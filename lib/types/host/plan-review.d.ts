import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { PlanReviewCandidate } from '../contracts.js';
import type { SessionBinding } from './bindings.js';
import type { NativeAuxiliaryRequests } from './native-auxiliary.js';
import { type PlanReviewModule, type PlanReviewOutcome } from '../plan-review.js';
export declare class NativePlanReviewService implements PlanReviewModule {
    private readonly ctx;
    private readonly agent;
    private readonly binding;
    private readonly auxiliary;
    constructor(ctx: Context, agent: Agent, binding: SessionBinding, auxiliary: NativeAuxiliaryRequests);
    review(candidate: PlanReviewCandidate, externalSignal?: AbortSignal): Promise<PlanReviewOutcome>;
}
