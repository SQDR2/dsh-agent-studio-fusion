import type { PairProfile } from '../contracts.js';
/** Output ceiling for one review call; the same bound the compaction model uses. */
export declare const FOREMAN_MAX_OUTPUT_TOKENS = 128000;
/**
 * The range a combo may set for the review ceiling — when it sets one at all.
 *
 * A ceiling is optional, and the reviewer starts without one: it renews for as long as it
 * keeps working (see `FOREMAN_BASE_BUDGET_MS` / `FOREMAN_TOOL_CALL_BUDGET_MS`) and ends on
 * its own verdict. A configured ceiling is the longest the Lead is ever made to wait, and
 * the loop keeps the last two minutes of it for the verdict itself, so a bounded review
 * still ends in an assessment. Fifteen minutes is the largest such patience a combo may set.
 */
export declare const FOREMAN_TIMEOUT_MS: {
    readonly min: 1000;
    readonly max: 900000;
};
/**
 * How long the reviewer may stay silent before the attempt is treated as never having
 * started.
 *
 * This is not a task-level budget: it answers "did this request begin answering", which a
 * total timeout cannot. Spending a whole ceiling on a stall reports one undifferentiated
 * `TimeoutError`, so the loop waits only this long for the first chunk, retries a route that
 * produced nothing, and lets a review that is streaming end on its work rather than on the
 * clock. A capped slice of the remaining window (half, at most this) keeps a retry worth
 * making.
 */
export declare const FOREMAN_NO_PROGRESS_TIMEOUT_MS = 120000;
/** A separate shadow plan auditor model is never inferred from a provider name or enabled by default. */
export declare function foremanChoice(value: unknown): PairProfile['foreman'];
