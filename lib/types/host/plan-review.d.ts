import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { PlanReviewCandidate } from '../contracts.js';
import type { SessionBinding } from './bindings.js';
import { type NativeAuxiliaryRequests } from './native-auxiliary.js';
import { type PlanReviewModule, type PlanReviewOutcome } from '../plan-review.js';
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
export declare const FOREMAN_MAX_TOOL_CALLS = 40;
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
