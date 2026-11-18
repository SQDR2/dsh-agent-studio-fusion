import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { FUSION_SOURCE_KIND } from '../message-source.js'
import type { PlanReviewCandidate } from '../contracts.js'
import type { SessionBinding } from './bindings.js'
import type { NativeAuxiliaryRequests } from './native-auxiliary.js'
import { FOREMAN_NO_PROGRESS_TIMEOUT_MS } from '../profile/foreman.js'
import { FOREMAN_SYSTEM_PROMPT, parseForemanAssessment, type PlanReviewModule, type PlanReviewOutcome } from '../plan-review.js'

/** Which budget ended an attempt, and how far the attempt had got. */
type AbortCause = 'caller' | 'total' | 'no-progress'

interface AttemptResult {
  outcome?: PlanReviewOutcome
  cause?: AbortCause
  /** True once any stream chunk arrived, so a retry only covers an unanswered request. */
  sawChunk: boolean
}

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

    const first = await this.#attempt(candidate, externalSignal, Math.max(1, remaining()))
    if (first.outcome) return first.outcome
    // A route the caller cancelled is not retried, and neither is a request that was already
    // answering: only silence means the gateway never took the call.
    if (first.cause === 'caller' || first.sawChunk) {
      return this.#abortOutcome(first.cause!, timeoutMs, false, externalSignal?.reason)
    }

    // One retry, out of what is left of the configured budget rather than on top of it: the
    // setting bounds the wait the Lead actually experiences, not each attempt separately.
    const rest = remaining()
    if (rest <= 0) return this.#abortOutcome('no-progress', timeoutMs, false)
    const retried = await this.#attempt(candidate, externalSignal, rest)
    if (retried.outcome) return retried.outcome
    return this.#abortOutcome(retried.cause!, timeoutMs, true, externalSignal?.reason)
  }

  /**
   * One review call, bounded by `budgetMs` in total and by its stall share before the first
   * chunk arrives.
   *
   * The two budgets answer different questions. A single total timeout cannot tell "still
   * thinking" from "the gateway never answered", so it spends the whole budget on a stall and
   * reports one undifferentiated `TimeoutError` — which the gate then reads as approval. A
   * route that produced nothing has not been reviewed at all, so that case is worth one retry;
   * a review still streaming at its deadline is a slow reviewer whose partial output would be
   * discarded anyway, and repeating it would only double the wait.
   */
  async #attempt(
    candidate: PlanReviewCandidate,
    externalSignal: AbortSignal | undefined,
    budgetMs: number,
  ): Promise<AttemptResult> {
    const foremanConfig = this.binding.profile.foreman!
    const { route, maxOutputTokens } = foremanConfig

    const total = AbortSignal.timeout(budgetMs)
    const signals: AbortSignal[] = [total]
    if (externalSignal) signals.push(externalSignal)
    const combined = AbortSignal.any(signals)

    if (combined.aborted) return { cause: externalSignal?.aborted ? 'caller' : 'total', sawChunk: false }

    const stalled = new AbortController()
    const stallBudgetMs = foremanStallBudgetMs(budgetMs)
    const stallTimer = setTimeout(() => stalled.abort('no progress'), stallBudgetMs)
    // Nothing should hold the Host's event loop open for a timer that only ends a wait.
    stallTimer.unref?.()
    const signal = AbortSignal.any([combined, stalled.signal])

    const request: GenerateOptions = {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort as GenerateOptions['reasoningEffort'] } : {}),
      system: FOREMAN_SYSTEM_PROMPT,
      messages: [
        createUserMessage({
          content: [{ type: 'text', text: JSON.stringify(candidate) }],
          source: { kind: FUSION_SOURCE_KIND },
        }),
      ],
      tools: [],
      maxTokens: maxOutputTokens,
      signal,
      sessionId: this.agent.id,
    }

    this.auxiliary.tag(request, {
      purpose: 'foreman',
      taskId: this.binding.taskId,
      sessionId: this.agent.id,
      profileDigest: this.binding.profile.digest,
      role: 'lead',
    })

    // Text arrives as indexed blocks: deltas stream one block, and `block-end` repeats that
    // block's assembled text. Appending both would duplicate every block, while appending only
    // the first block (or only when the buffer was empty) dropped the rest. So deltas are
    // accumulated per index, a block-end fills a block that streamed no deltas at all, and the
    // final text is the blocks in index order.
    const blocks = new Map<number, string>()
    let finishReason: string | undefined
    let sawChunk = false

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

    /** Consume the stream until it ends, reporting what each chunk was. */
    const consume = async (): Promise<{ done: true }> => {
      for await (const chunk of this.ctx.llm.stream(request)) {
        sawChunk = true
        // The route answered, so the stall budget has done its job: from here the total
        // budget alone bounds the call, however long the reviewer keeps streaming.
        clearTimeout(stallTimer)
        if (chunk.type === 'text-delta') {
          blocks.set(chunk.index, (blocks.get(chunk.index) ?? '') + chunk.text)
        } else if (chunk.type === 'block-end' && chunk.block.type === 'text') {
          // Only a block that never streamed deltas needs the assembled copy; when the
          // deltas are present they are already exactly this text.
          if (!blocks.get(chunk.index)) blocks.set(chunk.index, chunk.block.text)
        } else if (chunk.type === 'finish') {
          finishReason = chunk.reason.kind
        }
      }
      return { done: true }
    }

    let failure: { error: unknown } | undefined
    const consumed = consume().catch((error: unknown) => {
      failure = { error }
      return { done: true as const }
    })

    try {
      const raced = await Promise.race([consumed, deadline])
      if ('cause' in raced) return { cause: raced.cause, sawChunk }
      if (failure) {
        // An adapter reports its own cancellation as a plain stream failure. Reading the
        // budgets first keeps a deadline out of the "route is broken" message, where it
        // would send someone looking for a provider fault that never happened.
        if (signal.aborted) return { cause: causeOf(), sawChunk }
        return {
          outcome: {
            kind: 'unavailable',
            reason: `Foreman model stream failed: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
          },
          sawChunk,
        }
      }
    } finally {
      clearTimeout(stallTimer)
    }

    if (signal.aborted) return { cause: causeOf(), sawChunk }

    if (finishReason === 'max-tokens') {
      return { outcome: { kind: 'unavailable', reason: 'Foreman output exceeded maxOutputTokens reservation (finish reason: max-tokens)' }, sawChunk }
    }
    if (finishReason !== 'stop') {
      return { outcome: { kind: 'unavailable', reason: `Foreman model call ended with unexpected finish reason: "${finishReason}"` }, sawChunk }
    }

    const text = [...blocks.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value).join('')

    return { outcome: parseForemanAssessment(text, candidate), sawChunk }
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
