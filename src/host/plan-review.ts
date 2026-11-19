import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { realpathSync } from 'node:fs'
import { FUSION_SOURCE_KIND } from '../message-source.js'
import type { PlanReviewCandidate } from '../contracts.js'
import type { SessionBinding } from './bindings.js'
import { markForemanReview, type NativeAuxiliaryRequests } from './native-auxiliary.js'
import { FOREMAN_NO_PROGRESS_TIMEOUT_MS } from '../profile/foreman.js'
import { FOREMAN_SYSTEM_PROMPT, parseForemanAssessment, type PlanReviewModule, type PlanReviewOutcome } from '../plan-review.js'
import { executeForemanTool, foremanToolSchemas, verifyForemanCitations } from './plan-review-tools.js'
import type { ScopedToolService } from './tool-seam.js'

/** Which budget ended an attempt, and how far the attempt had got. */
type AbortCause = 'caller' | 'total' | 'no-progress'

interface AttemptResult {
  outcome?: PlanReviewOutcome
  cause?: AbortCause
  /** True once any stream chunk arrived, so a retry only covers an unanswered request. */
  sawChunk: boolean
  /** Tool calls the attempt already dispatched; a non-zero count means the loop had started. */
  toolCalls: number
}

/**
 * How many tool calls one review may make before it is abandoned.
 *
 * This is a runaway guard, not a content cap: it does not limit what the reviewer may read or
 * run, only how many round trips it may spend doing it. A reviewer that keeps inspecting
 * without ever answering is not converging, and the review is better reported as unavailable
 * (which blocks dispatch and offers the documented recovery commands) than left to consume its
 * whole ceiling silently.
 *
 * Sixty, not forty: a review that reads the files a finding depends on makes a dozen calls
 * before it writes anything, and the observed review that aborted at the old ceiling had made
 * twenty-one of them. The bound is the same runaway guard; only its headroom moved with the
 * work a code-level audit actually needs.
 */
export const FOREMAN_MAX_TOOL_CALLS = 60

/**
 * The window a review gets before it has shown any work.
 *
 * A review used to be one model call, so one wall clock measured it fairly. It is now a tool
 * loop, and a fixed clock prices a reviewer that keeps opening files the same as one that
 * stopped responding: both end at the same second with no verdict. This is the part a fixed
 * clock got wrong — time spent working is not time spent waiting.
 *
 * What the clock describes is therefore the Lead's patience rather than the review's length.
 * It starts here and grows with the work the reviewer demonstrates (see
 * {@link FOREMAN_TOOL_CALL_BUDGET_MS}), up to the ceiling the combo configures. A review that
 * answers in three calls ends in the base window; a review that never calls a tool has nothing
 * to renew with and is abandoned in it.
 */
export const FOREMAN_BASE_BUDGET_MS = 120_000

/**
 * What one completed tool call buys the review it is part of.
 *
 * The reviewer has to read the code a finding depends on, and every read costs a round trip:
 * a model turn to decide it, the command, and a model turn to read the result. Buying that
 * work explicitly is what turns the budget from "how long may a review take" into "how much
 * work may it do", with the wall clock only deciding how long a user waits for it.
 *
 * Thirty seconds against a measured 14.2s of work per call, so a reviewer that keeps producing
 * evidence keeps its window growing faster than it spends it; one that stops calling tools
 * stops renewing, and its window runs out on its own.
 */
export const FOREMAN_TOOL_CALL_BUDGET_MS = 30_000

/**
 * The review's wall clock: a base window that each completed tool call extends, bounded by the
 * ceiling the combo configures.
 *
 * It aborts its own signal instead of using `AbortSignal.timeout`, because a timeout cannot be
 * extended: the whole point is that demonstrating work moves the deadline. The ceiling is the
 * combo's `timeoutMs` — the longest the Lead is ever made to wait — and it is reached only by
 * a review that keeps showing work, so the setting still bounds the wait while no longer
 * deciding how much of the repository a review may read before it runs out.
 *
 * Every timer is unref'd: this clock only ends a wait and must never be the reason a Host
 * process stays alive.
 */
export class ForemanReviewClock {
  readonly controller = new AbortController()
  private readonly startedAt = Date.now()
  private deadlineAt: number
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly ceilingMs: number, baseMs: number = FOREMAN_BASE_BUDGET_MS) {
    this.deadlineAt = this.startedAt + Math.max(1, Math.min(baseMs, ceilingMs))
    this.#arm()
  }

  get signal(): AbortSignal { return this.controller.signal }

  /** What is left of the current window, floored at zero. */
  get remainingMs(): number { return Math.max(0, this.deadlineAt - Date.now()) }

  /** What the review is allowed to wait in total, whether or not it renews. */
  get ceilingAtMs(): number { return this.startedAt + this.ceilingMs }

  /**
   * Move the deadline by `ms`, never past the ceiling.
   *
   * Extension is measured from the deadline rather than from now, so a fast reviewer banks the
   * difference instead of losing it: the window tracks work done, not wall time survived.
   */
  extend(ms: number = FOREMAN_TOOL_CALL_BUDGET_MS): void {
    if (this.controller.signal.aborted || ms <= 0) return
    const ceiling = this.ceilingAtMs
    this.deadlineAt = Math.min(ceiling, Math.max(this.deadlineAt, Date.now()) + ms)
    this.#arm()
  }

  dispose(): void {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  #arm(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.controller.abort('budget'), this.remainingMs)
    this.timer.unref?.()
  }
}

/**
 * How long one attempt may stay silent before it counts as unanswered.
 *
 * Half the window that is left, and never more than {@link FOREMAN_NO_PROGRESS_TIMEOUT_MS}.
 * Taking a share rather than the whole window is what makes the distinction useful: if a
 * stall could consume everything there would be nothing left to retry with, and the report
 * would be the same undifferentiated `TimeoutError` this exists to replace.
 */
export function foremanStallBudgetMs(windowMs: number): number {
  return Math.max(1, Math.min(FOREMAN_NO_PROGRESS_TIMEOUT_MS, Math.floor(windowMs / 2)))
}

/** One assistant turn as the loop accumulates it: text blocks in order, plus the calls it asked for. */
interface AssistantTurn {
  /** Every block, in index order, exactly as it should be replayed to the model. */
  blocks: ContentBlock[]
  text: string
  calls: { id: string; name: string; arguments: string }[]
}

export class NativePlanReviewService implements PlanReviewModule {
  constructor(
    private readonly ctx: Context,
    private readonly agent: Agent,
    private readonly binding: SessionBinding,
    private readonly auxiliary: NativeAuxiliaryRequests,
    /**
     * The window a review gets before it demonstrates work.
     *
     * Only a test passes this. A review's renewal is driven by completed tool calls, which are
     * real round trips, so the default two-minute base makes the difference between "extended"
     * and "not extended" impossible to observe without waiting two minutes.
     */
    private readonly baseBudgetMs: number = FOREMAN_BASE_BUDGET_MS,
  ) {}

  async review(candidate: PlanReviewCandidate, externalSignal?: AbortSignal): Promise<PlanReviewOutcome> {
    const foremanConfig = this.binding.profile.foreman
    if (!foremanConfig) {
      return { kind: 'unavailable', reason: 'Foreman profile is not configured' }
    }

    const { timeoutMs } = foremanConfig
    // One clock for the whole review, shared with the retry: the setting bounds the wait the
    // Lead actually experiences, not each attempt separately.
    const clock = new ForemanReviewClock(timeoutMs, this.baseBudgetMs)
    try {
      // The root is resolved once, so every tool call and every citation in this review sees
      // the same workspace even if the session's cwd moves underneath it.
      const root = this.#workspaceRoot()

      const first = await this.#attempt(candidate, root, externalSignal, clock)
      if (first.outcome) return first.outcome
      // A route the caller cancelled is not retried, and neither is a review that was already
      // answering: only silence means the gateway never took the first request. A loop that
      // dispatched tool calls has started its work, and re-running it would repeat half a review.
      if (first.cause === 'caller' || first.sawChunk) {
        return this.#abortOutcome(first.cause!, timeoutMs, { callerReason: externalSignal?.reason, ...first })
      }

      // One retry, out of what is left of the clock rather than on top of it: the setting
      // bounds the wait the Lead actually experiences, not each attempt separately.
      if (clock.remainingMs <= 0) return this.#abortOutcome('no-progress', timeoutMs, { ...first })
      const retried = await this.#attempt(candidate, root, externalSignal, clock)
      if (retried.outcome) return retried.outcome
      return this.#abortOutcome(retried.cause!, timeoutMs, { callerReason: externalSignal?.reason, ...retried, hadRetry: true })
    } finally {
      clock.dispose()
    }
  }

  /**
   * The frozen workspace root tools and citations are resolved against.
   *
   * The session's own cwd, canonicalised once. Undefined when the session has no workspace;
   * every file tool then answers with an error and any citation fails verification, which is
   * the fail-closed direction for a review that cannot see the code it is judging.
   */
  #workspaceRoot(): string | undefined {
    const cwd = (this.agent as { session?: { header?: { cwd?: string } } }).session?.header?.cwd
    if (!cwd) return undefined
    try { return realpathSync.native(cwd) } catch { return undefined }
  }

  /**
   * One review, bounded by `clock`.
   *
   * The loop is the whole review, not one call: it streams a request, executes every tool call
   * the answer asked for, appends that turn and its results, and streams again. It ends when a
   * response asks for no tools (that text is the assessment), when a budget aborts it, or when
   * the runaway guard stops a review that never converges.
   *
   * Two budgets answer different questions. The stall window asks whether this request ever
   * started answering, so a route that produced nothing can be reported as a stall and retried
   * once. The clock asks how long the Lead waits, and it grows with the tool calls the reviewer
   * completes: a loop that keeps reading the repository is doing the work a code audit is for,
   * where a loop that stops calling tools has nothing left to renew with and ends in its base
   * window. Neither number pretends to know how long a review "should" take.
   */
  async #attempt(
    candidate: PlanReviewCandidate,
    root: string | undefined,
    externalSignal: AbortSignal | undefined,
    clock: ForemanReviewClock,
  ): Promise<AttemptResult> {
    const foremanConfig = this.binding.profile.foreman!
    const { route, maxOutputTokens } = foremanConfig

    const combined = externalSignal === undefined ? clock.signal : AbortSignal.any([clock.signal, externalSignal])

    if (combined.aborted) return { cause: externalSignal?.aborted ? 'caller' : 'total', sawChunk: false, toolCalls: 0 }

    const messages: GenerateOptions['messages'] = [
      createUserMessage({
        content: [{ type: 'text', text: JSON.stringify(candidate) }],
        source: { kind: FUSION_SOURCE_KIND },
      }),
    ]
    const tools = [...foremanToolSchemas()]
    let toolCalls = 0
    let sawChunk = false
    let shellSeq = 0

    for (;;) {
      if (combined.aborted) {
        return { cause: externalSignal?.aborted ? 'caller' : 'total', sawChunk, toolCalls }
      }
      // A fresh stall window per request, out of what the review has left: this is the budget
      // for "did the route start answering this turn", not for the whole review.
      const stalled = new AbortController()
      const stallTimer = setTimeout(() => stalled.abort('no progress'), foremanStallBudgetMs(clock.remainingMs))
      // Nothing should hold the Host's event loop open for a timer that only ends a wait.
      stallTimer.unref?.()
      const signal = AbortSignal.any([combined, stalled.signal])

      const request: GenerateOptions = {
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort as GenerateOptions['reasoningEffort'] } : {}),
        system: FOREMAN_SYSTEM_PROMPT,
        messages: [...messages],
        tools,
        maxTokens: maxOutputTokens,
        signal,
        sessionId: this.agent.id,
      }

      markForemanReview(request)
      this.auxiliary.tag(request, {
        purpose: 'foreman',
        taskId: this.binding.taskId,
        sessionId: this.agent.id,
        profileDigest: this.binding.profile.digest,
        role: 'lead',
      })

      const turn = await this.#streamTurn(request, signal, combined, stalled, externalSignal, () => {
        sawChunk = true
        // The route answered, so the stall budget has done its job: from here the total
        // budget alone bounds this turn, however long the reviewer keeps streaming.
        clearTimeout(stallTimer)
      })
      clearTimeout(stallTimer)
      if (turn.cause) return { cause: turn.cause, sawChunk, toolCalls }
      if (turn.outcome) return { outcome: turn.outcome, sawChunk, toolCalls }

      const answered = turn.turn!
      if (answered.calls.length === 0) {
        const outcome = parseForemanAssessment(answered.text, candidate)
        return {
          outcome: outcome.kind === 'unavailable' ? outcome : verified(outcome, root),
          sawChunk,
          toolCalls,
        }
      }

      // The guard is checked before the calls run, so the review stops at the bound instead of
      // overshooting it by a whole turn's worth of work.
      if (toolCalls + answered.calls.length > FOREMAN_MAX_TOOL_CALLS) {
        return {
          outcome: {
            kind: 'unavailable',
            reason: `Foreman review stopped by the runaway guard: it asked for `
              + `${toolCalls + answered.calls.length} tool calls, more than the ${FOREMAN_MAX_TOOL_CALLS} one review may make, `
              + 'without returning an assessment. The plan was not reviewed; inspect the transcript for what it kept looking for.',
          },
          sawChunk,
          toolCalls,
        }
      }

      messages.push(createAssistantMessage({
        content: answered.blocks,
        source: { provider: route.provider, model: route.model },
      }))
      for (const call of answered.calls) {
        toolCalls++
        const result = await executeForemanTool(call.name, call.arguments, {
          root,
          tools: this.ctx.tools as unknown as ScopedToolService | undefined,
          agent: this.agent,
          signal: combined,
          callIdPrefix: `foreman:${this.binding.taskId}`,
          nextCallId: () => {
            shellSeq += 1
            return `${shellSeq}`
          },
        })
        // The call completed, so the review has demonstrated work: buy it another window.
        // Recorded before the result is replayed, because the next request has to have a budget
        // to be sent under — a tool call that returns into an expired clock would pay for the
        // evidence and then be refused the turn that reads it.
        clock.extend(FOREMAN_TOOL_CALL_BUDGET_MS)
        messages.push(createToolResultMessage({
          callId: ToolCallId(call.id),
          content: [{ type: 'text', text: result.text }],
          isError: result.isError,
        }))
      }
      // The turn is settled and its results recorded; the next request asks for the verdict.
    }
  }

  /**
   * Stream one request and assemble its blocks.
   *
   * Text arrives as indexed blocks: deltas stream one block, and `block-end` repeats that
   * block's assembled text. Appending both would duplicate every block, while appending only
   * the first block (or only when the buffer was empty) dropped the rest. So deltas are
   * accumulated per index, a block-end fills a block that streamed no deltas at all, and the
   * turn is the blocks in index order. Tool calls are assembled the same way, which is what
   * lets the loop replay the assistant turn exactly as the model produced it.
   */
  async #streamTurn(
    request: GenerateOptions,
    signal: AbortSignal,
    combined: AbortSignal,
    stalled: AbortController,
    externalSignal: AbortSignal | undefined,
    onChunk: () => void,
  ): Promise<{ turn?: AssistantTurn; outcome?: PlanReviewOutcome; cause?: AbortCause }> {
    const blocks = new Map<number, { kind: 'text'; text: string } | { kind: 'tool-call'; id: string; name: string; arguments: string }>()
    let finishReason: string | undefined
    let finishFailure: string | undefined

    const causeOf = (): AbortCause => externalSignal?.aborted === true
      ? 'caller'
      : stalled.signal.aborted ? 'no-progress' : 'total'

    // Race the stream against its own budgets.
    //
    // An adapter is expected to stop producing once its signal aborts, but the Host does not
    // own the adapter and cannot assume it: a route that ignores the signal would leave this
    // await pending for ever, which hangs the delegation instead of failing open. The deadline
    // is therefore observed here, by the code that owns the budget, not only signalled to it.
    const deadline = new Promise<{ cause: AbortCause }>(resolve => {
      const settle = (): void => resolve({ cause: causeOf() })
      if (combined.aborted || stalled.signal.aborted) { settle(); return }
      combined.addEventListener('abort', settle, { once: true })
      stalled.signal.addEventListener('abort', settle, { once: true })
    })

    /** Consume the stream until it ends, recording what each chunk was. */
    const consume = async (): Promise<{ done: true }> => {
      for await (const chunk of this.ctx.llm.stream(request) as AsyncIterable<StreamChunk>) {
        onChunk()
        collect(blocks, chunk)
        if (chunk.type === 'finish') {
          finishReason = chunk.reason.kind
          if (chunk.reason.kind === 'error') finishFailure = chunk.reason.failure.message
        }
      }
      return { done: true }
    }

    let failure: { error: unknown } | undefined
    const consumed = consume().catch((error: unknown) => {
      failure = { error }
      return { done: true as const }
    })

    const raced = await Promise.race([consumed, deadline])
    if ('cause' in raced) return { cause: raced.cause }
    if (failure) {
      // An adapter reports its own cancellation as a plain stream failure. Reading the
      // budgets first keeps a deadline out of the "route is broken" message, where it
      // would send someone looking for a provider fault that never happened.
      if (signal.aborted) return { cause: causeOf() }
      return {
        outcome: {
          kind: 'unavailable',
          reason: `Foreman model stream failed: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
        },
      }
    }
    if (signal.aborted) return { cause: causeOf() }

    if (finishReason === 'max-tokens') {
      return { outcome: { kind: 'unavailable', reason: 'Foreman output exceeded maxOutputTokens reservation (finish reason: max-tokens)' } }
    }
    if (finishReason === 'error' && finishFailure) {
      return { outcome: { kind: 'unavailable', reason: `Foreman model stream failed: ${finishFailure}` } }
    }

    const ordered = [...blocks.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value)
    const calls = ordered.flatMap(block => block.kind === 'tool-call'
      ? [{ id: block.id, name: block.name, arguments: block.arguments }] : [])
    const text = ordered.flatMap(block => block.kind === 'text' ? [block.text] : []).join('')
    // A response with no tool calls is the assessment, so it must end the way a final answer
    // ends; a stray `tool-calls` finish with nothing to run, or an unknown reason, is a broken
    // stream rather than a verdict.
    if (calls.length === 0 && finishReason !== 'stop') {
      return { outcome: { kind: 'unavailable', reason: `Foreman model call ended with unexpected finish reason: "${finishReason}"` } }
    }
    if (calls.length > 0 && finishReason !== 'tool-calls' && finishReason !== 'stop') {
      return { outcome: { kind: 'unavailable', reason: `Foreman model call ended with unexpected finish reason: "${finishReason}"` } }
    }
    return {
      turn: {
        blocks: ordered.flatMap((block): ContentBlock[] => block.kind === 'text'
          ? [{ type: 'text', text: block.text }]
          : [{ type: 'tool-call', id: ToolCallId(block.id), name: block.name, arguments: block.arguments }]),
        text,
        calls,
      },
    }
  }

  /**
   * Name the budget that ended the attempt, and whether a retry could change the answer.
   *
   * What the reviewer had already done decides the wording: a route that never answered is a
   * different problem from a review that stopped answering after reading twenty files, and one
   * sentence for both sends the user to the wrong fix.
   */
  #abortOutcome(cause: AbortCause, timeoutMs: number, attempt: AttemptResult & { callerReason?: unknown; hadRetry?: boolean }): PlanReviewOutcome {
    const route = this.binding.profile.foreman!.route
    const label = `${route.provider}/${route.model}`
    const { sawChunk, toolCalls, hadRetry = false, callerReason } = attempt
    if (cause === 'caller') {
      // The caller's own words are the most useful thing to report here: they say who
      // stopped it and why, which the budget name alone cannot.
      return { kind: 'unavailable', reason: `Foreman review aborted: ${String(callerReason ?? 'cancelled by the caller')}` }
    }
    if (cause === 'no-progress' && sawChunk) {
      return {
        kind: 'unavailable',
        reason: `Foreman review aborted: ${label} stopped answering mid-review`
          + `${toolCalls > 0 ? ` after ${toolCalls} tool calls` : ''}; the plan was not reviewed. `
          + 'The route went quiet rather than slow, so retrying is more likely to help than a longer timeout.',
      }
    }
    if (cause === 'no-progress') {
      return {
        kind: 'unavailable',
        reason: `Foreman review aborted: ${label} sent nothing back${hadRetry ? ' on two attempts' : ''}; `
          + 'the route never started answering, so the plan was not reviewed. '
          + 'Point the Foreman at a responsive route, or raise its timeout if the gateway queues.',
      }
    }
    // The count is the difference between "a slow route" and "a reviewer that kept looking":
    // both end at the ceiling, and only the second is a sign the brief sent it somewhere the
    // workspace cannot answer.
    return {
      kind: 'unavailable',
      reason: `Foreman review aborted: ${label} used its whole ${timeoutMs}ms ceiling while still streaming`
        + `${toolCalls > 0 ? ` after ${toolCalls} tool calls` : ''}; `
        + 'raise the Foreman timeout or lower its reasoning effort.',
    }
  }
}

/** Verify the citations of an assessment that has one; a shape error is reported as-is. */
function verified(outcome: PlanReviewOutcome, root: string | undefined): PlanReviewOutcome {
  if (outcome.kind === 'unavailable') return outcome
  const checked = verifyForemanCitations(outcome.assessment, root)
  if (!checked.ok) return { kind: 'unavailable', reason: checked.reason }
  return outcome.kind === 'ready'
    ? { kind: 'ready', assessment: checked.assessment }
    : { kind: 'concerns', assessment: checked.assessment }
}

/** Fold one stream chunk into the per-index block accumulator. */
function collect(
  blocks: Map<number, { kind: 'text'; text: string } | { kind: 'tool-call'; id: string; name: string; arguments: string }>,
  chunk: StreamChunk,
): void {
  if (chunk.type === 'text-delta') {
    const existing = blocks.get(chunk.index)
    if (existing?.kind === 'tool-call') return
    blocks.set(chunk.index, { kind: 'text', text: (existing?.text ?? '') + chunk.text })
    return
  }
  if (chunk.type === 'tool-call-delta') {
    const existing = blocks.get(chunk.index)
    if (existing?.kind !== 'tool-call') {
      blocks.set(chunk.index, { kind: 'tool-call', id: String(chunk.id), name: chunk.name ?? '', arguments: chunk.argumentsDelta })
      return
    }
    existing.arguments += chunk.argumentsDelta
    if (chunk.name) existing.name = chunk.name
    return
  }
  if (chunk.type !== 'block-end') return
  const block = chunk.block
  if (block.type === 'text') {
    const existing = blocks.get(chunk.index)
    if (existing?.kind === 'text' && existing.text !== '') return
    blocks.set(chunk.index, { kind: 'text', text: block.text })
    return
  }
  if (block.type === 'tool-call') {
    const existing = blocks.get(chunk.index)
    if (existing?.kind === 'tool-call') {
      if (existing.arguments === '') existing.arguments = block.arguments
      if (existing.name === '') existing.name = block.name
      return
    }
    blocks.set(chunk.index, { kind: 'tool-call', id: String(block.id), name: block.name, arguments: block.arguments })
  }
}
