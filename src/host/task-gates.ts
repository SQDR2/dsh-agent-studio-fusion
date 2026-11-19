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
 * So the completed Lead keeps the two things that cannot change the work: read tools, and the
 * shell it uses to check a claim (the user's own sandbox mode, like any other command). Its
 * writer tools stay closed: the work is accepted, and changing the workspace after acceptance
 * is a new task.
 * @param input - the role asking, and whether this dispatch reads or runs a command.
 * @returns the refusal to show the model, or undefined when the dispatch may proceed.
 */
export function completedToolProblem(input: {
  readonly role: GateRole
  readonly read: boolean
  readonly shell: boolean
}): string | undefined {
  if (input.role === 'lead' && (input.read || input.shell)) return undefined
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
 * Whether a queued Worker dispatch is still something to inspect after a restart.
 *
 * `prepared` never reached the child and `dispatched` may be in flight, so both stay unfinished.
 * `accepted` means the child took the brief: the handoff is no longer queued on this Host, and if
 * the Worker's stop is recorded the child turn has ended — its effects, if it started any, are
 * recorded separately. Treating that row as unfinished kept a gate armed on a task whose Sidekick
 * had already failed, so the row outlived the work it described (session-6fdb5c73).
 * @param state - the outbox row state.
 * @param workerStopped - a model-control wait is recorded for this task's Worker.
 */
export function dispatchAwaitsInspection(state: string, workerStopped: boolean): boolean {
  if (state === 'prepared' || state === 'dispatched') return true
  return state === 'accepted' && !workerStopped
}

/**
 * What a dispatch may do while the task is paused or awaiting an inspection.
 *
 * The gate exists to stop effects: a command may still be running, or a task is deliberately
 * paused. It never needed to stop the Lead from reading the conversation, the workspace or its
 * own state — yet it refused the whole request, so the model never ran and the user got a turn
 * that ended in four milliseconds with nothing in it (session-6fdb5c73). Read-only work is the
 * one thing that cannot make a stopped task worse, and it is what the user expects: the Lead
 * reads what is recorded, says what it sees, and asks before anything writes.
 * @param input - the role asking, whether this dispatch only reads, and the gate's state.
 */
export function gatedDispatchProblem(input: {
  readonly role: GateRole
  readonly readOnly: boolean
  readonly phase: string
  readonly recovering: boolean
}): string | undefined {
  if (input.role === 'lead' && input.readOnly) return undefined
  if (input.role !== 'lead') return `Fusion execution is gated: ${input.phase}`
  const remedy = input.recovering
    ? 'record the inspection with /fusion recover <inspection note>'
    : 'continue with /fusion resume (or the Fusion panel)'
  return `Fusion execution is gated: ${input.phase}. Reading, inspecting and answering still work; to delegate, write files or run effectful tools, ${remedy} first.`
}

/**
 * Why a gated turn stops after it tried to start an effect.
 *
 * Admitting a gated Lead request is what lets it read and answer, but a model that keeps calling
 * the refused delegation would keep asking for another step — measured as seven requests where the
 * turn used to send none (native-tests, restored recovering task). One refusal is the answer to
 * the question it asked; a second step has nothing left to do until the task runs again.
 * @param input - whether the task waits on an inspection, which decides the remedy to name.
 */
export function gatedTurnStopped(input: { readonly recovering: boolean; readonly phase: string }): string {
  const remedy = input.recovering
    ? 'record the inspection with /fusion recover <inspection note>, then /fusion resume'
    : '/fusion resume (or the Fusion panel) to continue'
  return `Fusion execution is gated: ${input.phase}, and this turn already reached that limit. Nothing else will run until you ${remedy}. Answer the user with what was read; do not retry.`
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
 * @param input - the gate's current state, whether anything is unfinished, the task's mode, and
 *   whether the task stopped in the middle of a handoff (that pause is the Host saying a child may
 *   still be live, so only an inspection may open it).
 */
export function staleRecoveryGate(input: {
  readonly recovering: boolean
  readonly unfinished: boolean
  readonly mode: string
  readonly handoffStop: boolean
}): boolean {
  return input.recovering && !input.unfinished && input.mode !== 'completed' && !input.handoffStop
}
