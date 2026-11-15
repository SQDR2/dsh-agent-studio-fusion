/**
 * The two decisions the coordinator's tool gate makes about a conversation that is no
 * longer simply running.
 *
 * Both are small, and both cost a whole turn when they are wrong: one ended a Worker turn
 * as `blocked` and told the Lead its Sidekick had *declined*, the other refused the Lead's
 * last read and left a claim in its closing answer unverified (session-a1899929). They live
 * here, apart from the coordinator, so the reading is testable without a Host checkout.
 */

/** The roles these gates reason about. */
export type GateRole = 'lead' | 'worker'

/**
 * The Worker's post-submit gate.
 *
 * Once a report is in, the Lead owns the next move: another model request from the Worker
 * would invent work nobody asked for. Refusing that NEXT request is what settles the Lead's
 * delegation result, so this gate must stay.
 *
 * It must not refuse a bridge route's transport — Antigravity's `agy_tool`, which replays the
 * step the route already ran inside its own loop. The step that submits the report is exactly
 * the step that transport reports back, so the refusal landed on the card describing a
 * successful submission: the Worker turn ended as `blocked` with no closing message, and DSH
 * announced "declined the task" to the Lead although the report was persisted and both of its
 * acceptance checks had passed (session-a1899929). A replay carries no authority of its own,
 * so nothing it reports can be a reason to refuse it.
 * @param submitted - whether this task's Worker has already handed in its report.
 * @param replayed - the dispatch is that route transport replaying an executed step.
 * @returns the refusal to show the model, or undefined when the dispatch may proceed.
 */
export function workerSubmittedProblem(submitted: boolean, replayed: boolean): string | undefined {
  if (!submitted || replayed) return undefined
  return 'Worker report was submitted; wait for Lead feedback'
}

/**
 * What a completed task still permits.
 *
 * `completed` means the review accepted the work, so anything that could start, resume or
 * change work belongs to a new task. The Lead's closing explanation does not: it is written
 * in the same turn, and it may need one last read to be true. Refusing every tool made the
 * Lead answer "unverified" from memory about a fact one directory read would have settled
 * (session-a1899929).
 *
 * So the completed Lead keeps the ceiling it already had while running read-only — read
 * tools, and a shell the role sandbox still confines to read-only — and nothing else. The
 * remaining guard is unchanged: a shell that is not provably read-only is refused here, and
 * `#separatedLeadGuard` re-checks it at execution time.
 * @param input - the role asking, and whether this dispatch is a read or a confined shell.
 * @returns the refusal to show the model, or undefined when the dispatch may proceed.
 */
export function completedToolProblem(input: {
  readonly role: GateRole
  readonly read: boolean
  readonly confinedShell: boolean
}): string | undefined {
  if (input.role === 'lead' && (input.read || input.confinedShell)) return undefined
  return 'This task is completed; begin a new task before using tools'
}

/**
 * Whether a boot-time `runtime.background` flag is evidence of work this Host must inspect.
 *
 * `background` records only that the last handoff did not block the Lead's turn. On its own it
 * proves nothing about work in flight, and reading it as if it did bricked a whole conversation:
 * the Sidekick had already stopped on a provider error, every native effect was settled, and yet
 * the next start armed the reconciliation gate — after which every message the user typed ended
 * at once, because that gate refuses the request before it reaches the model (session-6fdb5c73).
 *
 * Real interruptions leave real traces, and each is still checked separately at boot: a live
 * lease, a prepared dispatch, an uncertain check, a pending approval, an unfinished compaction or
 * a recorded native effect. So the flag only counts while the task could still have had work: it
 * was running, its Worker had not reported, and no Worker stop was recorded for it. A recorded
 * stop is the Host's own note that the handoff ended.
 * @param runtime - the task's recorded runtime, if it has one.
 * @param control - that task's control state.
 * @param workerStopped - a model-control wait is recorded for this task's Worker.
 */
export function backgroundHandoffNeedsInspection(
  runtime: { readonly background?: boolean; readonly submitted?: unknown } | undefined,
  control: { readonly mode: string },
  workerStopped: boolean,
): boolean {
  return runtime?.background === true && control.mode === 'running' && !runtime.submitted && !workerStopped
}

/**
 * Whether a startup check should open a recovery gate it just disproved.
 *
 * The gate exists so that a Host exit never silently resumes work whose commands may still be
 * running — the user has to attest to what they saw. But it must also not outlive its reason:
 * a task that comes back with nothing unfinished (no lease, dispatch, check, approval,
 * compaction, effect or handoff) was gated for a trace that no longer exists, and keeping it
 * refuses every request — a message, "continue", a route change — leaving only a note nobody can
 * write meaningfully (session-6fdb5c73). A real interruption sets `unfinished`, so it stays closed.
 * @param input - the gate's current state, whether anything is unfinished, and the task's mode.
 */
export function staleRecoveryGate(input: {
  readonly recovering: boolean
  readonly unfinished: boolean
  readonly mode: string
}): boolean {
  return input.recovering && !input.unfinished && input.mode !== 'completed'
}
