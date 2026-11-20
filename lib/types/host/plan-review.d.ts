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
 * whole ceiling silently.
 *
 * A hundred and twenty, not sixty: the review that prompted this bound made forty-two calls
 * and was still auditing when a ten-minute ceiling ended it, and a code-level audit of a
 * three-page plan legitimately reads every test, stylesheet and build script it cites. The
 * bound is the same runaway guard; the difference is that reaching it now asks the reviewer
 * for its verdict instead of discarding the review (see
 * {@link FOREMAN_FINAL_ANSWER_INSTRUCTION}).
 */
export declare const FOREMAN_MAX_TOOL_CALLS = 120;
/**
 * How much of a configured ceiling is kept back for the reviewer's own verdict.
 *
 * A ceiling is the longest the Lead is asked to wait, not a kill switch: when this much is
 * left, the loop stops inspecting and asks for the assessment it can already write. Three
 * minutes covers a final JSON answer even on a `high` reasoning route, where the thinking
 * before that answer is the expensive part — and a verdict returned late is worth more than
 * a review discarded on time.
 */
export declare const FOREMAN_FINAL_ANSWER_RESERVE_MS = 180000;
/**
 * The instruction that turns "out of budget" into "answer with what you have".
 *
 * Sent with no tools available, so the turn can only be the assessment. The citations it
 * names are still verified by the Host afterwards: a hurried verdict is still a verdict about
 * files that exist, and a `blocking-concern` still needs the code that shows the problem.
 */
export declare const FOREMAN_FINAL_ANSWER_INSTRUCTION: string;
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
export declare const FOREMAN_BASE_BUDGET_MS = 120000;
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
export declare const FOREMAN_TOOL_CALL_BUDGET_MS = 30000;
/**
 * The review's wall clock: a base window that each completed tool call extends, bounded by the
 * ceiling the combo configures — or by nothing at all.
 *
 * It aborts its own signal instead of using `AbortSignal.timeout`, because a timeout cannot be
 * extended: the whole point is that demonstrating work moves the deadline. `ceilingMs` is
 * optional: when a combo does not configure one, the review keeps renewing for as long as it
 * keeps working, which is what "let it finish" means. What still ends it is silence (the stall
 * window), the inspection cap, or the user cancelling the turn the review belongs to.
 *
 * Every timer is unref'd: this clock only ends a wait and must never be the reason a Host
 * process stays alive.
 */
export declare class ForemanReviewClock {
    #private;
    private readonly ceilingMs;
    readonly controller: AbortController;
    private readonly startedAt;
    private deadlineAt;
    private timer;
    constructor(ceilingMs: number | undefined, baseMs?: number);
    get signal(): AbortSignal;
    /** The configured ceiling, or undefined when this combo set none. */
    get ceiling(): number | undefined;
    /** What is left of the current window, floored at zero. */
    get remainingMs(): number;
    /** What the review is allowed to wait in total, whether or not it renews. */
    get ceilingAtMs(): number | undefined;
    /**
     * Move the deadline by `ms`, never past the ceiling.
     *
     * Extension is measured from the deadline rather than from now, so a fast reviewer banks the
     * difference instead of losing it: the window tracks work done, not wall time survived.
     */
    extend(ms?: number): void;
    dispose(): void;
}
/**
 * How long one attempt may stay silent before it counts as unanswered.
 *
 * Half the window that is left, and never more than {@link FOREMAN_NO_PROGRESS_TIMEOUT_MS}.
 * Taking a share rather than the whole window is what makes the distinction useful: if a
 * stall could consume everything there would be nothing left to retry with, and the report
 * would be the same undifferentiated `TimeoutError` this exists to replace.
 */
export declare function foremanStallBudgetMs(windowMs: number): number;
export declare class NativePlanReviewService implements PlanReviewModule {
    #private;
    private readonly ctx;
    private readonly agent;
    private readonly binding;
    private readonly auxiliary;
    /**
     * The window a review gets before it demonstrates work.
     *
     * Only a test passes this. A review's renewal is driven by completed tool calls, which are
     * real round trips, so the default two-minute base makes the difference between "extended"
     * and "not extended" impossible to observe without waiting two minutes.
     */
    private readonly baseBudgetMs;
    constructor(ctx: Context, agent: Agent, binding: SessionBinding, auxiliary: NativeAuxiliaryRequests, 
    /**
     * The window a review gets before it demonstrates work.
     *
     * Only a test passes this. A review's renewal is driven by completed tool calls, which are
     * real round trips, so the default two-minute base makes the difference between "extended"
     * and "not extended" impossible to observe without waiting two minutes.
     */
    baseBudgetMs?: number);
    review(candidate: PlanReviewCandidate, externalSignal?: AbortSignal): Promise<PlanReviewOutcome>;
}
