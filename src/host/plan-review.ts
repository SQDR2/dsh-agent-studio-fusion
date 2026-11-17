import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { FUSION_SOURCE_KIND } from '../message-source.js'
import type { PlanReviewCandidate } from '../contracts.js'
import type { SessionBinding } from './bindings.js'
import type { NativeAuxiliaryRequests } from './native-auxiliary.js'
import { FOREMAN_SYSTEM_PROMPT, parseForemanAssessment, type PlanReviewModule, type PlanReviewOutcome } from '../plan-review.js'

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

    const { route, maxOutputTokens, timeoutMs } = foremanConfig

    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const combinedSignal = externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal

    if (combinedSignal.aborted) {
      return { kind: 'unavailable', reason: `Foreman review aborted: ${String(combinedSignal.reason)}` }
    }

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
      signal: combinedSignal,
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

    try {
      for await (const chunk of this.ctx.llm.stream(request)) {
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
    } catch (error) {
      return {
        kind: 'unavailable',
        reason: `Foreman model stream failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    if (combinedSignal.aborted) {
      return { kind: 'unavailable', reason: `Foreman review aborted: ${String(combinedSignal.reason)}` }
    }

    if (finishReason === 'max-tokens') {
      return { kind: 'unavailable', reason: 'Foreman output exceeded maxOutputTokens reservation (finish reason: max-tokens)' }
    }
    if (finishReason !== 'stop') {
      return { kind: 'unavailable', reason: `Foreman model call ended with unexpected finish reason: "${finishReason}"` }
    }

    const text = [...blocks.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value).join('')

    return parseForemanAssessment(text, candidate)
  }
}
