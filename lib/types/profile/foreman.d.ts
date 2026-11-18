import type { PairProfile } from '../contracts.js';
/** Output ceiling for one review call; the same bound the compaction model uses. */
export declare const FOREMAN_MAX_OUTPUT_TOKENS = 128000;
/**
 * A review call is bounded, but a large candidate plan on a slow model legitimately
 * needs minutes: the earlier two-minute ceiling turned a working setting into a
 * save failure. Ten minutes still bounds the call without binding it to a model's pace.
 */
export declare const FOREMAN_TIMEOUT_MS: {
    readonly min: 1000;
    readonly max: 600000;
};
/**
 * What a combo starts with when the reviewer is switched on.
 *
 * Two minutes was this default and it was not enough to finish the work it was meant to
 * bound. A reasoning reviewer spends tens of seconds before its first token even on a
 * two-word request, and a candidate plan is orders of magnitude larger: one implement
 * candidate on a `reasoningEffort: high` route aborted at 120 006 ms having emitted no
 * stream at all, and the gate reads an abort as approval, so the plan shipped unaudited
 * with only a notice to say so. Five minutes keeps the documented ceiling for headroom
 * above the case that failed instead of sitting one queue stall away from it.
 */
export declare const FOREMAN_DEFAULT_TIMEOUT_MS = 300000;
/**
 * How long the reviewer may stay silent before the attempt is treated as never having
 * started, independent of {@link FOREMAN_DEFAULT_TIMEOUT_MS}.
 *
 * The two budgets answer different questions. A total timeout alone cannot tell "still
 * thinking" from "the gateway never answered", so it spends the whole budget on a stall
 * and reports one undifferentiated `TimeoutError`. Waiting only this long for the first
 * chunk distinguishes the two, and a route that produced nothing has not been reviewed
 * at all, so that case is worth one retry — where a review still streaming at its total
 * deadline is a slow reviewer whose partial output would be discarded anyway.
 */
export declare const FOREMAN_NO_PROGRESS_TIMEOUT_MS = 120000;
/** A separate shadow plan auditor model is never inferred from a provider name or enabled by default. */
export declare function foremanChoice(value: unknown): PairProfile['foreman'];
