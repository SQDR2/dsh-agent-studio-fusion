import type { Digest, PairProfile, TaskId } from '../contracts.js'
import { TaskId as taskId } from '../contracts.js'
import { digestOf } from '../digest.js'
import { completeProfile } from '../profile/resolve.js'
import type { PromptBundle, ResolvedProfile } from '../profile/resolve.js'
import type { SqliteFusionStore } from '../task/sqlite-store.js'

export interface SessionBinding {
  readonly schemaVersion: 1
  readonly sessionId: string
  readonly taskId: TaskId
  readonly selected: boolean
  /** One native continuable Worker for this selection, across completed tasks. */
  readonly workerId?: string
  readonly profile: PairProfile
  readonly prompts: PromptBundle
}

/**
 * The part of a frozen profile a running session may never change, hashed without the reviewer.
 *
 * The Lead route is pinned to the user's own model choice, and the Sidekick route owns a
 * persistent Worker session whose model cannot be swapped under it; both are part of the
 * identity every task, checkpoint, keepalive row and usage record in the store is bound to,
 * so a rollover that moved either would silently relabel work that already ran.
 *
 * The reviewer is different in kind: it holds no session and is called per candidate with an
 * explicit route that the review record itself names. A combo may therefore name a different
 * reviewer for the next task without rewriting the identity of the last one.
 */
export function bindingIdentity(profile: PairProfile): Digest {
  const { foreman: _reviewer, digest: _digest, ...identity } = profile
  return digestOf(identity)
}

/**
 * The frozen profile with the reviewer a combo names now, or undefined when it already names it.
 *
 * Re-deriving is what keeps the digest honest: the task record, the keepalive rows and the
 * usage rows of the successor all name a profile whose body really contains that reviewer,
 * instead of a document whose digest was left pointing at the old one.
 */
export function revisedReviewerProfile(
  profile: PairProfile, prompts: PromptBundle, foreman: PairProfile['foreman'],
): PairProfile | undefined {
  if (digestOf(foreman ?? null) === digestOf(profile.foreman ?? null)) return undefined
  return completeProfile({ ...profile, foreman }, prompts)
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Fusion session binding')
  return value as Record<string, unknown>
}

export function readBinding(value: unknown, sessionId: string): SessionBinding {
  const row = object(value)
  if (row.schemaVersion !== 1 || row.sessionId !== sessionId || typeof row.taskId !== 'string'
    || typeof row.selected !== 'boolean') throw new Error('Fusion binding migration or reconciliation required')
  const prompt = object(row.prompts)
  if (row.workerId !== undefined && (typeof row.workerId !== 'string' || !row.workerId || row.workerId.includes('\0'))) {
    throw new Error('Invalid persistent Fusion Worker identity')
  }
  if (typeof prompt.lead !== 'string' || typeof prompt.worker !== 'string' || typeof prompt.compact !== 'string') {
    throw new Error('Frozen Fusion prompts are missing')
  }
  const prompts: PromptBundle = { lead: prompt.lead, worker: prompt.worker, compact: prompt.compact }
  const profile = completeProfile(object(row.profile), prompts)
  if (digestOf(profile) !== digestOf(row.profile)) throw new Error('Frozen Fusion profile or prompt digest changed')
  return { schemaVersion: 1, sessionId, taskId: taskId(row.taskId), selected: row.selected, profile, prompts,
    ...(row.workerId === undefined ? {} : { workerId: row.workerId as string }) }
}

/** Selection is durable and scoped by the native Lead identity, never a global default. */
export class BindingRepository {
  constructor(private readonly store: SqliteFusionStore) {}

  read(sessionId: string): { revision: number; binding: SessionBinding } | undefined {
    const document = this.store.readDocument(`binding:${sessionId}`)
    return document ? { revision: document.revision, binding: readBinding(document.value, sessionId) } : undefined
  }

  select(sessionId: string, id: TaskId, resolved: ResolvedProfile): SessionBinding {
    const prior = this.read(sessionId)
    if (prior?.binding.selected) throw new Error('Fusion is already selected for this session')
    const binding: SessionBinding = {
      schemaVersion: 1, sessionId, taskId: id, selected: true,
      profile: structuredClone(resolved.profile), prompts: structuredClone(resolved.prompts),
    }
    readBinding(binding, sessionId)
    this.store.writeDocument(`binding:${sessionId}`, prior?.revision ?? 0, binding)
    return binding
  }

  clear(sessionId: string): void {
    const prior = this.read(sessionId)
    if (!prior || !prior.binding.selected) return
    this.store.writeDocument(`binding:${sessionId}`, prior.revision, { ...prior.binding, selected: false })
  }

  /** Reserve identity before native dispatch; an existing selection cannot swap workers. */
  assignWorker(sessionId: string, expectedTask: TaskId, workerId: string): void {
    const prior = this.read(sessionId)
    if (!prior?.binding.selected || prior.binding.taskId !== expectedTask) throw new Error('Fusion binding changed before Worker dispatch')
    if (prior.binding.workerId && prior.binding.workerId !== workerId) throw new Error('Persistent Worker identity cannot change within a Fusion selection')
    const binding = { ...prior.binding, workerId }
    readBinding(binding, sessionId)
    this.store.writeDocument(`binding:${sessionId}`, prior.revision, binding)
  }

  /**
   * A new native user turn starts a new task while preserving the frozen pair.
   *
   * `profile` is only for the one role a running selection may re-freeze (the reviewer); the
   * Lead and Sidekick routes stay exactly as they were, and `readBinding` below re-derives the
   * document so a profile that does not read back never reaches the store.
   */
  rollover(sessionId: string, expectedTask: TaskId, nextTask: TaskId, profile?: PairProfile): SessionBinding {
    const prior = this.read(sessionId)
    if (!prior?.binding.selected || prior.binding.taskId !== expectedTask) throw new Error('Fusion binding changed during task rollover')
    const binding: SessionBinding = { ...prior.binding, taskId: nextTask, ...(profile === undefined ? {} : { profile }) }
    readBinding(binding, sessionId)
    this.store.writeDocument(`binding:${sessionId}`, prior.revision, binding)
    return binding
  }

  selected(): readonly SessionBinding[] {
    const result: SessionBinding[] = []
    for (const id of this.store.listDocumentIds('binding:')) {
      try {
        const item = this.read(id.slice('binding:'.length))
        if (item?.binding.selected) result.push(item.binding)
      } catch {
        // ignore stale or incompatible binding digests from previous versions
      }
    }
    return result
  }
}
