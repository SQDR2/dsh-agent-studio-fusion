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
 * whole timeout silently. Forty calls is far above any real review: a plan review that needs
 * more than a handful of reads and one test run has already lost the thread.
 */
export const FOREMAN_MAX_TOOL_CALLS = 40

/**
 * How long one attempt may stay silent before it counts as unanswered.
 *
 * Half the attempt's own budget, and never more than {@link FOREMAN_NO_PROGRESS_TIMEOUT_MS}.
 * Taking a share rather than the whole budget is what makes the distinction useful: if a
 * stall could consume the entire timeout there would be nothing left to retry with, and the
 * report would be the same undifferentiated `TimeoutError` this exists to replace.
 */
export function foremanStallBudgetMs(attemptBudgetMs: number): number {
  return Math.max(1, Math.min(FOREMAN_NO_PROGRESS_TIMEOUT_MS, Math.floor(attemptBudgetMs / 2)))
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
  ) {}

  async review(candidate: PlanReviewCandidate, externalSignal?: AbortSignal): Promise<PlanReviewOutcome> {
    const foremanConfig = this.binding.profile.foreman
    if (!foremanConfig) {
      return { kind: 'unavailable', reason: 'Foreman profile is not configured' }
    }

    const { timeoutMs } = foremanConfig
    const startedAt = Date.now()
    const remaining = (): number => timeoutMs - (Date.now() - startedAt)

    // The root is resolved once, so every tool call and every citation in this review sees the
    // same workspace even if the session's cwd moves underneath it.
    const root = this.#workspaceRoot()

    const first = await this.#attempt(candidate, root, externalSignal, Math.max(1, remaining()))
    if (first.outcome) return first.outcome
    // A route the caller cancelled is not retried, and neither is a review that was already
    // answering: only silence means the gateway never took the first request. A loop that
    // dispatched tool calls has started its work, and re-running it would repeat half a review.
    if (first.cause === 'caller' || first.sawChunk) {
      return this.#abortOutcome(first.cause!, timeoutMs, false, externalSignal?.reason)
    }

    // One retry, out of what is left of the configured budget rather than on top of it: the
    // setting bounds the wait the Lead actually experiences, not each attempt separately.
    const rest = remaining()
    if (rest <= 0) return this.#abortOutcome('no-progress', timeoutMs, false)
    const retried = await this.#attempt(candidate, root, externalSignal, rest)
    if (retried.outcome) return retried.outcome
    return this.#abortOutcome(retried.cause!, timeoutMs, true, externalSignal?.reason)
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
   * One review, bounded by `budgetMs` in total.
   *
   * The loop is the whole review, not one call: it streams a request, executes every tool call
   * the answer asked for, appends that turn and its results, and streams again. It ends when a
   * response asks for no tools (that text is the assessment), when a budget aborts it, or when
   * the runaway guard stops a review that never converges.
   *
   * The two budgets answer different questions. A single total timeout cannot tell "still
   * thinking" from "the gateway never answered", so it spends the whole budget on a stall and
   * reports one undifferentiated `TimeoutError`, hiding which problem the user can act on. A
   * route that produced nothing has not been reviewed at all, so that case is worth one retry;
   * a review still streaming at its deadline is a slow reviewer whose partial output would be
   * discarded anyway, and repeating it would only double the wait. The stall budget is per
   * request: each model turn gets its own window to start answering, while the total budget
   * covers the whole loop.
   */
  async #attempt(
    candidate: PlanReviewCandidate,
    root: string | undefined,
    externalSignal: AbortSignal | undefined,
    budgetMs: number,
  ): Promise<AttemptResult> {
    const foremanConfig = this.binding.profile.foreman!
    const { route, maxOutputTokens } = foremanConfig

    const total = AbortSignal.timeout(budgetMs)
    const signals: AbortSignal[] = [total]
    if (externalSignal) signals.push(externalSignal)
    const combined = AbortSignal.any(signals)

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
      // A fresh stall window per request: this is the budget for "did the route start
      // answering this turn", not for the whole review.
      const stalled = new AbortController()
      const stallTimer = setTimeout(() => stalled.abort('no progress'), foremanStallBudgetMs(budgetMs))
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

  /** Name the budget that ended the attempt, and whether a retry could change the answer. */
  #abortOutcome(cause: AbortCause, timeoutMs: number, hadRetry: boolean, callerReason?: unknown): PlanReviewOutcome {
    const route = this.binding.profile.foreman!.route
    const label = `${route.provider}/${route.model}`
    if (cause === 'caller') {
      // The caller's own words are the most useful thing to report here: they say who
      // stopped it and why, which the budget name alone cannot.
      return { kind: 'unavailable', reason: `Foreman review aborted: ${String(callerReason ?? 'cancelled by the caller')}` }
    }
    if (cause === 'no-progress') {
      return {
        kind: 'unavailable',
        reason: `Foreman review aborted: ${label} sent nothing back${hadRetry ? ' on two attempts' : ''}; `
          + 'the route never started answering, so the plan was not reviewed. '
          + 'Point the Foreman at a responsive route, or raise its timeout if the gateway queues.',
      }
    }
    return {
      kind: 'unavailable',
      reason: `Foreman review aborted: ${label} used its whole ${timeoutMs}ms budget while still streaming; `
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
