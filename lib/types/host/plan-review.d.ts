import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { PlanReviewCandidate } from '../contracts.js';
import type { SessionBinding } from './bindings.js';
import type { NativeAuxiliaryRequests } from './native-auxiliary.js';
import { type PlanReviewModule, type PlanReviewOutcome } from '../plan-review.js';
/**
 * How long one attempt may stay silent before it counts as unanswered.
 *
 * Half the attempt's own budget, and never more than {@link FOREMAN_NO_PROGRESS_TIMEOUT_MS}.
 * Taking a share rather than the whole budget is what makes the distinction useful: if a
 * stall could consume the entire timeout there would be nothing left to retry with, and the
 * report would be the same undifferentiated `TimeoutError` this exists to replace.
 */
export declare function foremanStallBudgetMs(attemptBudgetMs: number): number;
export declare class NativePlanReviewService implements PlanReviewModule {
    #private;
    private readonly ctx;
    private readonly agent;
    private readonly binding;
    private readonly auxiliary;
    constructor(ctx: Context, agent: Agent, binding: SessionBinding, auxiliary: NativeAuxiliaryRequests);
    review(candidate: PlanReviewCandidate, externalSignal?: AbortSignal): Promise<PlanReviewOutcome>;
}
