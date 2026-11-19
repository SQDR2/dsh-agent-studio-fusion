import type { PairProfile } from '../contracts.js';
/** Output ceiling for one review call; the same bound the compaction model uses. */
export declare const FOREMAN_MAX_OUTPUT_TOKENS = 128000;
/**
 * The range one combo may set for the review ceiling.
 *
 * This is the longest the Lead is ever made to wait, not the length of a review: the review
 * starts with a shorter window and each completed tool call extends it (see
 * `FOREMAN_BASE_BUDGET_MS` / `FOREMAN_TOOL_CALL_BUDGET_MS`), so the ceiling is only reached by
 * a reviewer that keeps demonstrating work. Fifteen minutes, because a code-level audit reads
 * the files its findings depend on: the review that aborted at the old five-minute default had
 * made twenty-one tool calls in four minutes and was still reading.
 */
export declare const FOREMAN_TIMEOUT_MS: {
    readonly min: 1000;
    readonly max: 900000;
};
/**
 * What a combo starts with when the reviewer is switched on.
 *
 * Each raise of this default has been a fix for the same failure. Two minutes aborted a
 * `reasoningEffort: high` reviewer that emitted no stream at all; five minutes then aborted
 * one that was streaming steadily at ~115 tokens/s across sixteen turns and twenty-one tool
 * calls, with nothing wrong with the route. A fixed second count cannot separate "slow" from
 * "stuck", and the reviewer now does real work per review, so the default moved to ten
 * minutes — the ceiling a review only reaches if it keeps producing evidence.
 */
export declare const FOREMAN_DEFAULT_TIMEOUT_MS = 600000;
/**
 * How long the reviewer may stay silent before the attempt is treated as never having
 * started, independent of {@link FOREMAN_DEFAULT_TIMEOUT_MS}.
 *
 * The two budgets answer different questions. A total timeout alone cannot tell "still
 * thinking" from "the gateway never answered", so it spends the whole budget on a stall
 * and reports one undifferentiated `TimeoutError`. Waiting only this long for the first
 * chunk distinguishes the two, and a route that produced nothing has not been reviewed
 * at all, so that case is worth one retry — where a review still streaming at its ceiling
 * is a slow reviewer whose partial output would be discarded anyway.
 */
export declare const FOREMAN_NO_PROGRESS_TIMEOUT_MS = 120000;
/** A separate shadow plan auditor model is never inferred from a provider name or enabled by default. */
export declare function foremanChoice(value: unknown): PairProfile['foreman'];
