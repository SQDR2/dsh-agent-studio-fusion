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
/** A separate shadow plan auditor model is never inferred from a provider name or enabled by default. */
export declare function foremanChoice(value: unknown): PairProfile['foreman'];
