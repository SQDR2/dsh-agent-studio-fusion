import { type AgyEvent } from './types.js';
/** Parse one decoded JSON object into a typed event; undefined = ignore. */
export declare function classifyEvent(obj: unknown, seq: number): AgyEvent | undefined;
export interface ParserStats {
    lines: number;
    garbage: number;
    /** Consecutive garbage lines since the last parsed event. */
    consecutiveGarbage: number;
    authUrl: string | undefined;
    sawAuthFailure: boolean;
    /**
     * The auth-shaped stdout line(s) that raised `sawAuthFailure`, bounded.
     * The adapter asks whether THOSE lines also carry transport evidence: agy
     * reports "silent auth failed / not logged in" for a network-broken token
     * check just as often as for a real sign-out, and the two need different
     * treatment (retry on another account vs. stop and ask for a re-login).
     */
    authFailureText: string | undefined;
    /** Error text from the last result envelope, if any (adapter maps it to AGY_ERROR). */
    lastResultError: string | undefined;
}
/**
 * Hard cap on a single un-newline-terminated stdout buffer. Stream-json is
 * newline-delimited, so a line should never approach this; the cap only stops a
 * runaway / malformed stream (no newline for megabytes) from growing the
 * buffered partial line without bound.
 */
export declare const MAX_STREAM_LINE_BYTES: number;
export declare class StreamJsonParser {
    private buffer;
    private seq;
    readonly stats: ParserStats;
    /** Ring buffer of raw stdout lines for /agy doctor export. */
    readonly recentLines: string[];
    private readonly maxRecent;
    /** Feed a stdout chunk; returns the events completed by it. */
    feed(chunk: string): AgyEvent[];
    /** Flush a trailing line without a newline (agy killed mid-write). */
    flush(): AgyEvent[];
    private recordAuthFailure;
    private takeLine;
}
