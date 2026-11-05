import { FusionError, TASK_BUSY } from '../errors.js'

/**
 * Whether a task record may be cleared out of the history.
 *
 * The question is not "what phase did this task reach" but "is anything still
 * writing into the rows a deletion removes". A phase is a projection of the
 * last event a running process appended; a process that was replaced (Host
 * restart, HMR reload, crash) never appends the event that would have moved
 * the phase on, so a finished task keeps the phase and `control.mode` of its
 * last living moment forever. Deciding on those fields makes such a record
 * permanently undeletable even though nothing owns it any more.
 *
 * So the decision is taken from evidence of a live writer, in two classes:
 *
 * - `live`: the Host in this process still owns an Agent, tool call, write
 *   lease or stop for the task. This is the only authority that can see
 *   in-process work, and it is what actually keeps a running task undeletable.
 * - `foreign`: a durable row (native effect, approval, check invocation) left
 *   in a pending state by a *different* process that is provably still alive.
 *   Rows written by this process are not evidence: if the in-process authority
 *   says nothing is live, the row is the residue of an interrupted call.
 */
export interface DeletionEvidence {
  /** Why this task still owns live work in this process, or `undefined` when it owns none. */
  readonly live: DeletionBlocker | undefined
  /** Pending durable rows written by another process whose pid still exists. */
  readonly foreign: readonly string[]
}

/** What still holds the task, named so the panel can explain it in either language. */
export type DeletionBlocker =
  /** A native Agent for this task is not idle. */
  | 'agent'
  /** A native tool call is still in flight. */
  | 'tool'
  /** A native job or background stop has not proved quiescence. */
  | 'job'
  /** The task still holds (or is releasing) the workspace write lease. */
  | 'lease'
  /** Only another, still-living process holds it. */
  | 'foreign-process'

export type DeletionVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly blocker: DeletionBlocker; readonly detail: string }

export const DELETION_ALLOWED: DeletionVerdict = { allowed: true }

/** The one refusal the panel already knows how to translate; the blocker rides alongside it. */
export class DeletionBlocked extends FusionError {
  constructor(readonly blocker: DeletionBlocker, readonly detail: string) {
    super(TASK_BUSY, 'Cannot delete a running task')
  }
}

/** Pure decision, so the rule is testable without a Host, a process table or a database. */
export function deletionVerdict(evidence: DeletionEvidence): DeletionVerdict {
  if (evidence.live) return { allowed: false, blocker: evidence.live, detail: LIVE_DETAIL[evidence.live] }
  if (evidence.foreign.length) {
    const shown = evidence.foreign.slice(0, 3).join(', ')
    const more = evidence.foreign.length > 3 ? ` and ${evidence.foreign.length - 3} more` : ''
    return { allowed: false, blocker: 'foreign-process', detail: `another Host process is still working on it (${shown}${more})` }
  }
  return DELETION_ALLOWED
}

const LIVE_DETAIL: Readonly<Record<DeletionBlocker, string>> = {
  agent: 'its Lead or Sidekick is not idle',
  tool: 'a native tool call is still in flight',
  job: 'a native job is still running',
  lease: 'it still holds the workspace write lease',
  'foreign-process': 'another Host process is still working on it',
}

/** Recorded owner of a durable row, when the row carries a usable pid. */
export function recordedProcessId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const pid = (value as { processId?: unknown }).processId
  return typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

/** Durable state names that mean the row was still open when its process stopped. */
const OPEN_EFFECT = new Set(['dispatch-started', 'outcome-unknown'])

/**
 * A row is unfinished when its own state says so. The families disagree on
 * where they record that, so each one is read through its own field and an
 * unrecognized shape counts as settled rather than pinning the record forever.
 */
export function unfinishedDocument(family: string, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  switch (family) {
    case 'native-effect': return typeof row.state === 'string' && OPEN_EFFECT.has(row.state)
    case 'native-approval': return row.state === 'pending'
    case 'check-invocation': {
      const evidence = row.evidence
      if (!evidence || typeof evidence !== 'object') return false
      const state = (evidence as { state?: unknown }).state
      return state === 'started' || state === 'outcome-unknown'
    }
    default: return false
  }
}
