import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { OperationId, SessionId, TaskId, WriteLease } from '../contracts.js'
import { FusionError, LEASE_BUSY, LEASE_GENERATION } from '../errors.js'

export interface LeaseRecord extends WriteLease {
  readonly owner: string
  readonly pid: number
  readonly acquiredAt: string
  readonly liveProcessRefs: readonly number[]
  /**
   * When the writing process started, to the second.
   *
   * A pid is an id the kernel recycles, not an identity: after a crash the next
   * process on this machine frequently gets the same number, and reading that as
   * "the old writer is still here" is what keeps a workspace locked forever. The
   * start time is the part of the identity the kernel does not reuse. Absent on
   * records written before this field existed, and on hosts without `/proc`.
   */
  readonly ownerStartedAt?: string
}

/** One process incarnation: the pid and the moment that process started, if knowable. */
export interface ProcessIncarnation {
  readonly pid: number
  readonly startedAt: number | undefined
}

/** Linux reports `/proc/<pid>/stat` clock ticks per second; 100 on every mainstream build. */
const CLOCK_TICKS_PER_SECOND = 100
/** A start time this far from the recorded one is another process, not clock skew. */
const INCARNATION_TOLERANCE_MS = 1_000

let bootTimeMs: number | undefined
function bootTime(): number | undefined {
  if (bootTimeMs !== undefined) return bootTimeMs
  try {
    const match = /^btime\s+(\d+)$/m.exec(fs.readFileSync('/proc/stat', 'utf8'))
    if (match) bootTimeMs = Number(match[1]) * 1_000
  } catch {
    // No procfs: liveness falls back to a signal probe with no start time.
  }
  return bootTimeMs
}

/**
 * This exact process incarnation, or `undefined` when no such process can still be
 * running. A zombie has a `/proc` entry and cannot write, so it is reported gone.
 *
 * `startedAt` is `undefined` on a platform without procfs: callers may still ask
 * "is this pid present", but they cannot tell a recycled id from the original.
 */
export function processIncarnation(pid: number): ProcessIncarnation | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined
  if (process.platform === 'linux') {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
      const close = stat.lastIndexOf(')')
      if (close < 0) return undefined
      // Fields after "<comm>" begin at field 3 (`state`); starttime is field 22.
      const fields = stat.slice(close + 2).split(' ')
      if (fields[0] === 'Z' || fields[0] === 'X') return undefined
      const ticks = Number(fields[19])
      const boot = bootTime()
      return { pid, startedAt: Number.isSafeInteger(ticks) && boot !== undefined
        ? boot + ticks * (1_000 / CLOCK_TICKS_PER_SECOND) : undefined }
    } catch {
      return undefined
    }
  }
  try {
    process.kill(pid, 0)
    return { pid, startedAt: undefined }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM' ? { pid, startedAt: undefined } : undefined
  }
}

export function canonicalWorkspace(cwd: string): string {
  return fs.realpathSync.native(cwd)
}

const DURABLE_LEASE_ROOT = path.join(os.homedir(), '.local', 'state', 'dsh-fusion', 'leases')
/** Where this plugin kept durable leases before it was renamed from `dsh-model-fusion`. */
const LEGACY_LEASE_ROOT = path.join(os.homedir(), '.local', 'state', 'dsh-model-fusion', 'leases')

/**
 * Move a pre-rename lease registry to its current name.
 *
 * The registry outlives a single process, so a rename must carry it: a fresh
 * empty directory beside a lock nobody reads would report the workspace as
 * free while a previous holder believes it still owns the write lease. A move
 * keeps that holder visible to the next process; a cross-device install copies
 * the directory instead, and a failed copy removes only what it created.
 *
 * @param next - registry directory the current release uses.
 * @param legacy - registry directory the previous name used.
 * @returns whether a legacy registry was adopted.
 */
export function adoptLegacyLeaseRoot(next: string, legacy = LEGACY_LEASE_ROOT): boolean {
  if (fs.existsSync(next) || !fs.existsSync(legacy)) return false
  try {
    fs.renameSync(legacy, next)
    return true
  } catch {
    // Cross-device or a locked file: fall back to a copy, then drop the source.
  }
  try {
    fs.cpSync(legacy, next, { recursive: true })
  } catch {
    fs.rmSync(next, { recursive: true, force: true })
    return false
  }
  try {
    fs.rmSync(legacy, { recursive: true, force: true })
  } catch {
    // The new copy is complete; a leftover legacy directory is harmless.
  }
  return true
}

export function leasePath(workspaceId: string, root = DURABLE_LEASE_ROOT): string {
  const key = createHash('sha256').update(workspaceId).digest('hex').slice(0, 24)
  return path.join(root, `${key}.lock`)
}

export interface LeaseInput {
  cwd: string
  holder: SessionId
  taskId: TaskId
  operationId: OperationId
  liveProcessRefs?: readonly number[]
}

export class WorkspaceWriteLease {
  constructor(private readonly root = DURABLE_LEASE_ROOT) {
    if (!path.isAbsolute(root)) throw new TypeError('lease registry directory must be absolute')
    adoptLegacyLeaseRoot(root)
  }

  acquire(input: LeaseInput): LeaseRecord {
    const workspaceId = canonicalWorkspace(input.cwd)
    return this.#transaction(workspaceId, db => {
      const row = this.#row(db)
      const prior = this.#record(row, workspaceId)
      if (prior) throw new FusionError(LEASE_BUSY, `workspace is held by ${prior.holder} (pid ${prior.pid}, since ${prior.acquiredAt}); finish or stop that writer, or let its process exit so the abandoned lease is taken over`)
      return this.#write(db, row, workspaceId, input)
    })
  }

  /**
   * Take over a lease whose writer is gone.
   *
   * This is a compare-and-swap on the record the caller inspected, not a blind
   * overwrite: if another process acquired, released or reclaimed the lease in
   * the meantime, the swap fails and the caller keeps the busy error. The caller
   * is responsible for having proved the writer is gone; `alive` answers that
   * question, and `Coordinator#abandonedLease` adds the effect-journal half.
   */
  reclaim(prior: LeaseRecord, input: LeaseInput): LeaseRecord {
    const workspaceId = canonicalWorkspace(input.cwd)
    if (prior.workspaceId !== workspaceId) throw new FusionError(LEASE_BUSY, 'the inspected lease belongs to a different workspace')
    return this.#transaction(workspaceId, db => {
      const row = this.#row(db)
      const current = this.#record(row, workspaceId)
      if (!current || current.owner !== prior.owner || current.generation !== prior.generation) {
        throw new FusionError(LEASE_BUSY, 'the workspace writer changed while it was being inspected')
      }
      if (this.alive(current)) throw new FusionError(LEASE_BUSY, `workspace is still held by ${current.holder}; its process is live`)
      return this.#write(db, row, workspaceId, input)
    })
  }

  /**
   * Whether the process that wrote this record can still be running.
   *
   * A present pid is not enough. The recorded start time decides a recycled id,
   * and a record written before the current process on that pid existed cannot be
   * held by it — which is how a record from before this field existed is judged.
   * Any other recorded process reference counts as live, because a command the
   * writer started may outlive it.
   */
  alive(record: LeaseRecord): boolean {
    return this.#sameWriter(record)
      || record.liveProcessRefs.some(pid => pid !== record.pid && processIncarnation(pid) !== undefined)
  }

  /** Whether the process on the recorded pid is still the one that wrote the record. */
  #sameWriter(record: LeaseRecord): boolean {
    const current = processIncarnation(record.pid)
    if (!current) return false
    if (current.startedAt === undefined) return true
    const recordedStart = record.ownerStartedAt === undefined ? undefined : Date.parse(record.ownerStartedAt)
    if (recordedStart !== undefined && Number.isFinite(recordedStart)) {
      return Math.abs(current.startedAt - recordedStart) <= INCARNATION_TOLERANCE_MS
    }
    return current.startedAt <= Date.parse(record.acquiredAt) + INCARNATION_TOLERANCE_MS
  }

  #write(db: DatabaseSync, row: { generation: number }, workspaceId: string, input: LeaseInput): LeaseRecord {
    if (row.generation === Number.MAX_SAFE_INTEGER) throw new FusionError(LEASE_GENERATION, 'lease generation exhausted')
    const refs = [...new Set([process.pid, ...(input.liveProcessRefs ?? [])])]
    if (refs.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) throw new FusionError(LEASE_BUSY, 'invalid process reference')
    const startedAt = processIncarnation(process.pid)?.startedAt
    const record: LeaseRecord = {
      workspaceId, holder: input.holder, taskId: input.taskId, generation: row.generation + 1,
      activeOperationIds: [input.operationId], owner: `${process.pid}:${randomUUID()}`, pid: process.pid,
      acquiredAt: new Date().toISOString(), liveProcessRefs: refs,
      ...(startedAt === undefined ? {} : { ownerStartedAt: new Date(startedAt).toISOString() }),
    }
    db.prepare('UPDATE lease SET generation=?, record=? WHERE id=1').run(record.generation, JSON.stringify(record))
    return record
  }

  assertGeneration(lease: WriteLease, generation: number): void {
    const current = this.current(lease.workspaceId)
    if (lease.generation !== generation || current?.generation !== generation
      || current.holder !== lease.holder || current.taskId !== lease.taskId) {
      throw new FusionError(LEASE_GENERATION, `stale write generation ${generation}`)
    }
  }

  stillHeld(lease: LeaseRecord): boolean {
    const current = this.current(lease.workspaceId)
    return current?.owner === lease.owner && current.generation === lease.generation
  }

  /** Caller must prove native Worker/tool quiescence before releasing. */
  release(lease: LeaseRecord): void {
    this.#transaction(lease.workspaceId, db => {
      const current = this.#record(this.#row(db), lease.workspaceId)
      if (current?.owner === lease.owner && current.generation === lease.generation) {
        db.prepare('UPDATE lease SET record=NULL WHERE id=1 AND generation=?').run(lease.generation)
      }
    })
  }

  /** Trusted recovery inspection. A dead PID by itself never authorizes stealing. */
  current(cwd: string): LeaseRecord | undefined {
    const workspaceId = canonicalWorkspace(cwd)
    return this.#transaction(workspaceId, db => this.#record(this.#row(db), workspaceId))
  }

  #row(db: DatabaseSync): { generation: number; record: unknown } {
    const row = db.prepare('SELECT generation, record FROM lease WHERE id=1').get()
    if (!row || typeof row.generation !== 'number' || !Number.isSafeInteger(row.generation) || row.generation < 0) {
      throw new FusionError(LEASE_BUSY, 'durable lease generation is corrupt')
    }
    return { generation: row.generation, record: row.record }
  }

  #record(row: { generation: number; record: unknown }, workspaceId: string): LeaseRecord | undefined {
    if (row.record === null) return undefined
    if (typeof row.record !== 'string') throw new FusionError(LEASE_BUSY, 'invalid durable lease record')
    const value = JSON.parse(row.record) as Partial<LeaseRecord>
    if (value.workspaceId !== workspaceId || value.generation !== row.generation
      || typeof value.owner !== 'string' || typeof value.holder !== 'string' || typeof value.taskId !== 'string'
      || !Number.isSafeInteger(value.pid) || Number(value.pid) <= 0 || typeof value.acquiredAt !== 'string'
      || (value.ownerStartedAt !== undefined
        && (typeof value.ownerStartedAt !== 'string' || !Number.isFinite(Date.parse(value.ownerStartedAt))))
      || !Array.isArray(value.activeOperationIds) || !Array.isArray(value.liveProcessRefs)) {
      throw new FusionError(LEASE_BUSY, 'durable lease requires reconciliation')
    }
    return value as LeaseRecord
  }

  /** Atomic publication/CAS; generations survive release and process restart. */
  #transaction<T>(workspaceId: string, body: (db: DatabaseSync) => T): T {
    const legacy = leasePath(workspaceId, this.root)
    fs.mkdirSync(path.dirname(legacy), { recursive: true, mode: 0o700 })
    const oldTemporary = leasePath(workspaceId, path.join(fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), 'dsh-model-fusion-leases'))
    // A lock written under the pre-rename registry, or by the pre-rename
    // temporary one, still names a writer: refuse rather than take the
    // workspace out from under it.
    const oldDurable = leasePath(workspaceId, LEGACY_LEASE_ROOT)
    for (const lock of new Set([legacy, oldDurable, oldTemporary])) {
      try {
        fs.lstatSync(lock)
        throw new FusionError(LEASE_BUSY, 'legacy writer lock requires explicit reconciliation')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    const db = new DatabaseSync(`${legacy}.sqlite`)
    let transaction = false
    try {
      db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;')
      transaction = true
      const version = db.prepare('PRAGMA user_version').get()?.user_version
      if (version !== 0 && version !== 1) throw new FusionError(LEASE_BUSY, 'unknown lease database version')
      if (version === 0) {
        const tables = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()?.n
        if (tables !== 0) throw new FusionError(LEASE_BUSY, 'unversioned nonempty lease database')
        db.exec('CREATE TABLE lease (id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL, record TEXT); INSERT INTO lease VALUES (1, 0, NULL); PRAGMA user_version=1;')
      }
      const result = body(db)
      db.exec('COMMIT'); transaction = false
      return result
    } catch (error) {
      if (transaction) db.exec('ROLLBACK')
      throw error
    } finally { db.close() }
  }
}

export function classifyEffect(kind: 'read-tool' | 'write-tool' | 'unknown-shell'): 'read' | 'write' {
  if (kind === 'read-tool') return 'read'
  return 'write'
}
