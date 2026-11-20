import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { OperationId, SessionId, TaskId } from '../src/contracts.js'
import { LEASE_BUSY, LEASE_GENERATION } from '../src/errors.js'
import { canonicalWorkspace, classifyEffect, leasePath, processIncarnation, WorkspaceWriteLease, type LeaseRecord } from '../src/execution/write-lease.js'
import { expectCode } from './helpers.js'

/** A pid that no live process owns: a child that has already exited. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', ''])
  if (!child.pid) throw new Error('could not spawn a child to obtain a dead pid')
  return child.pid
}

/**
 * Write the durable record a killed Host leaves behind, without going through
 * `acquire`: the point of these cases is what a reader makes of a record whose
 * writer is already gone.
 */
function seedRecord(root: string, cwd: string, record: Partial<LeaseRecord> & { workspaceId?: string }): void {
  const file = `${leasePath(canonicalWorkspace(cwd), root)}.sqlite`
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  const generation = 3
  const row = {
    workspaceId: canonicalWorkspace(cwd), holder: SessionId('session-crashed'), taskId: TaskId('task-crashed'),
    generation, activeOperationIds: [OperationId('op-crashed')], owner: `4242:${'a'.repeat(8)}`, pid: deadPid(),
    acquiredAt: new Date(Date.now() - 3_600_000).toISOString(), liveProcessRefs: [deadPid()],
    ...record,
  }
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;')
    db.exec("CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL, record TEXT); "
      + 'INSERT OR IGNORE INTO lease VALUES (1, 0, NULL); PRAGMA user_version=1;')
    db.prepare('UPDATE lease SET generation=?, record=? WHERE id=1').run(row.generation, JSON.stringify(row))
    db.exec('COMMIT')
  } finally { db.close() }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

describe('WorkspaceWriteLease', () => {
  it('allows only one writer generation on a workspace', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dmf-lease-'))
    dirs.push(cwd)
    const gate = new WorkspaceWriteLease(join(cwd, 'lease-registry'))
    const first = gate.acquire({
      cwd,
      holder: SessionId('worker-1'),
      taskId: TaskId('task-1'),
      operationId: OperationId('op-1'),
    })
    expect(first.generation).toBe(1)
    expectCode(() => gate.acquire({
      cwd,
      holder: SessionId('lead-1'),
      taskId: TaskId('task-1'),
      operationId: OperationId('op-2'),
    }), LEASE_BUSY)
    gate.assertGeneration(first, 1)
    expectCode(() => gate.assertGeneration(first, 0), LEASE_GENERATION)
    gate.release(first)
    const second = gate.acquire({
      cwd,
      holder: SessionId('lead-1'),
      taskId: TaskId('task-1'),
      operationId: OperationId('op-3'),
    })
    expect(second.generation).toBe(2)
    expectCode(() => gate.assertGeneration(first, first.generation), LEASE_GENERATION)
    gate.release(first)
    expect(gate.stillHeld(second)).toBe(true)
    gate.release(second)
  })

  it('coordinates independent handles and canonical symlink paths', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dmf-lease-')); dirs.push(cwd)
    const alias = join(cwd, 'alias'); const nested = mkdtempSync(join(cwd, 'target-')); symlinkSync(nested, alias)
    const first = new WorkspaceWriteLease(join(cwd, 'lease-registry')); const second = new WorkspaceWriteLease(join(cwd, 'lease-registry'))
    const input = { cwd: alias, holder: SessionId('worker'), taskId: TaskId('task'), operationId: OperationId('op') }
    const held = first.acquire(input)
    expect(second.current(nested)).toEqual(held)
    expectCode(() => second.acquire({ ...input, cwd: nested }), LEASE_BUSY)
    second.release(held)
    const next = first.acquire(input)
    expect(next.generation).toBe(2)
    first.release(next)
  })

  it('refuses incomplete legacy locks instead of racing to unlink them', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dmf-lease-')); dirs.push(cwd)
    const root = join(cwd, 'lease-registry')
    const lock = leasePath(canonicalWorkspace(cwd), root); mkdirSync(dirname(lock), { recursive: true })
    writeFileSync(lock, '')
    try {
      expectCode(() => new WorkspaceWriteLease(root).acquire({ cwd, holder: SessionId('worker'), taskId: TaskId('task'), operationId: OperationId('op') }), LEASE_BUSY)
      expect(existsSync(lock)).toBe(true)
    } finally { rmSync(lock) }
  })

  it('treats unknown shell as writable', () => {
    expect(classifyEffect('unknown-shell')).toBe('write')
    expect(classifyEffect('read-tool')).toBe('read')
  })

  it('takes over a lease whose writer is gone, and refuses one whose writer is live', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dmf-lease-')); dirs.push(cwd)
    const root = join(cwd, 'lease-registry')
    const gate = new WorkspaceWriteLease(root)
    const input = { cwd, holder: SessionId('lead-1'), taskId: TaskId('task-1'), operationId: OperationId('op-1') }
    seedRecord(root, cwd, {})
    const crashed = gate.current(cwd)!
    expect(gate.alive(crashed)).toBe(false)
    expectCode(() => gate.acquire(input), LEASE_BUSY)
    const taken = gate.reclaim(crashed, input)
    expect(taken).toMatchObject({ holder: 'lead-1', generation: crashed.generation + 1 })
    expect(gate.current(cwd)?.owner).toBe(taken.owner)

    // The writer that now holds it is this process, so a second claim is refused.
    expect(gate.alive(taken)).toBe(true)
    expectCode(() => gate.reclaim(taken, { ...input, holder: SessionId('lead-2') }), LEASE_BUSY)
    gate.release(taken)
  })

  it('keeps refusing an abandoned record while any process it names can still be running', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dmf-lease-')); dirs.push(cwd)
    const root = join(cwd, 'lease-registry')
    const gate = new WorkspaceWriteLease(root)
    // The writer is gone, but a command it started is recorded as live.
    seedRecord(root, cwd, { liveProcessRefs: [deadPid(), process.pid] })
    const crashed = gate.current(cwd)!
    expect(gate.alive(crashed)).toBe(true)
    expectCode(() => gate.reclaim(crashed, {
      cwd, holder: SessionId('lead-1'), taskId: TaskId('task-1'), operationId: OperationId('op-1'),
    }), LEASE_BUSY)
  })

  it('does not mistake a recycled pid for the writer, including records written before start times were stored', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dmf-lease-')); dirs.push(cwd)
    const root = join(cwd, 'lease-registry')
    const gate = new WorkspaceWriteLease(root)
    const current = processIncarnation(process.pid)!
    // A record naming this live pid, but started an hour before this process began.
    seedRecord(root, cwd, { pid: process.pid, ownerStartedAt: new Date((current.startedAt ?? Date.now()) - 3_600_000).toISOString() })
    expect(gate.alive(gate.current(cwd)!)).toBe(false)
    // A record from before the field existed, written an hour before this process began:
    // the process on that pid now cannot be its writer.
    seedRecord(root, cwd, { pid: process.pid, acquiredAt: new Date(Date.now() - 3_600_000).toISOString() })
    expect(gate.alive(gate.current(cwd)!)).toBe(false)
    // Written after this process started, the same legacy record may well be its own, and
    // nothing but the pid can say otherwise: it stays held.
    seedRecord(root, cwd, { pid: process.pid, acquiredAt: new Date().toISOString() })
    expect(gate.alive(gate.current(cwd)!)).toBe(true)
  })

  it('refuses to swap a lease that another process changed after it was inspected', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dmf-lease-')); dirs.push(cwd)
    const root = join(cwd, 'lease-registry')
    const first = new WorkspaceWriteLease(root), second = new WorkspaceWriteLease(root)
    seedRecord(root, cwd, {})
    const inspected = first.current(cwd)!
    const taken = second.reclaim(inspected, { cwd, holder: SessionId('lead-2'), taskId: TaskId('task-2'), operationId: OperationId('op-2') })
    expectCode(() => first.reclaim(inspected, { cwd, holder: SessionId('lead-1'), taskId: TaskId('task-1'), operationId: OperationId('op-1') }), LEASE_BUSY)
    expect(first.current(cwd)?.owner).toBe(taken.owner)
  })
})
