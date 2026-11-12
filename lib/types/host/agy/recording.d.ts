import type { AgyEvent, RawUsage } from './types.js';
/** Terminal failure recorded when the process ended without a usable result. */
export interface RecordingFailure {
    kind: 'error' | 'aborted';
    code: string;
    message: string;
    /**
     * Delay the failure asks DSH to wait before retrying (ms). Only transport
     * failures state one: the generic exponential schedule is far too short to
     * outlast an egress outage (see NETWORK_RETRY_DELAYS_MS).
     */
    retryAfterMs?: number;
}
/** Status guidance only: retain the original tool error for replay and logs. */
export type ToolErrorKind = 'missing_file' | 'system_protection' | 'approval' | 'tool_error';
export declare function classifyToolError(error: string): ToolErrorKind;
declare const waiters: unique symbol;
/** One agy run's append-only event log plus its settlement state. */
export declare class RunRecording {
    readonly runId: string;
    private readonly events;
    /** Arrival timestamp for every recorded event (same index as `events`). */
    private readonly eventTimes;
    private settled;
    private failure;
    private resultConversationId;
    private lastStepUsageRaw;
    /**
     * Per-step generation timing for token-speed statistics: stepKey ->
     * { startedAt, lastAt, outputTokens }. The last usage sample of a step wins
     * (updates are cumulative snapshots of one internal call), so replacing —
     * not accumulating — keeps the numbers honest.
     */
    private readonly stepSpeed;
    private [waiters];
    /** DB-resolved full tool args keyed by event index (set during span driving). */
    private fullArgs;
    /** DB-resolved thoughts keyed by event index (set during span driving). */
    private thoughts;
    /** Isolated pool-account HOME used for this run's agy conversation DB. */
    accountHome: string | undefined;
    /**
     * Index of the event where the most recent span CUT (the last event the
     * previous run_code call yielded), or null while no span has finished on
     * this recording. Lets the duplicate-request debounce RESCUE an identical
     * prompt by re-driving the live recording from the cut point instead of
     * throwing BUSY at a mid-flight agentic turn (2026-10-10 23:0x incident:
     * a span whose mirror result did not parse as a continuation fell through
     * to full prompt assembly and the debounce killed the whole turn).
     */
    lastCutIndex: number | null;
    /**
     * Set by the adapter right after spawn. A mid-turn user steer makes DSH
     * open a NEW stream() call for the same session while this run's process
     * is still alive; without aborting it, two agy processes would append to
     * the SAME conversation concurrently.
     */
    requestAbort: (() => void) | null;
    constructor(runId?: string);
    /** Append one pump event and wake every span consumer. */
    append(ev: AgyEvent): void;
    /**
     * Token-speed statistics over the generation steps recorded so far
     * (tokens/second of model OUTPUT, thinking included where agy reports it).
     *
     * `avgTps` is the output-weighted mean (Σ tokens / Σ seconds) over steps
     * with a measurable window (≥ 500 ms); `lastTps` is the most recently
     * measured step. Tool-only and instantaneous steps are excluded, so the
     * numbers reflect actual generation speed rather than tool wait time.
     */
    speedStats(): {
        lastTps: number | null;
        avgTps: number | null;
        outputTokens: number;
        measuredSteps: number;
        generatingMs: number;
    };
    /**
     * Usage accounting (verified against agy 1.1.16 stream-json): step_update
     * usage is PER-CALL (the current context size at that internal LLM call),
     * while the result envelope's usage is CUMULATIVE across the whole agy
     * conversation. DSH's token meter treats the last reported sample as
     * current context occupancy, so forwarding the cumulative result makes
     * pressure explode quadratically and fires compaction within a few turns.
     * We therefore remember the last per-call step sample and report IT at
     * result time instead of the cumulative envelope.
     */
    noteStepUsage(raw: RawUsage): void;
    /** The usage to report for the result envelope: last per-call step sample. */
    finalUsage(resultRaw: RawUsage): RawUsage;
    /** Settle the recording: no further events will arrive. */
    settle(failure: RecordingFailure | null): void;
    private wake;
    get isSettled(): boolean;
    /** Terminal failure, when the run ended without a consumable result. */
    get failureInfo(): RecordingFailure | null;
    /** Conversation id from the result envelope, once seen. */
    get conversationId(): string | null;
    /** Whether a result event (ok or error-with-response) was recorded. */
    get hasResult(): boolean;
    /** The last result envelope's finish-relevant projection, when one arrived. */
    getResultEvent(): {
        ok: boolean;
        response: string;
    } | null;
    /** Event at an absolute index (bounds-checked). */
    eventAt(index: number): AgyEvent | undefined;
    /** Number of recorded events so far. */
    get length(): number;
    /**
     * Whether any assistant-visible text streamed before (not including) the
     * given index. Carried into each span's mapper so the result-envelope
     * fallback never duplicates text earlier spans already streamed.
     */
    sawTextBefore(index: number): boolean;
    /**
     * Yield events at or after `from`, waiting for the pump while the run is
     * live. The iterator ends once every recorded event was yielded AND the
     * recording settled — spans then inspect failureInfo to finish or fail.
     */
    eventsFrom(from: number): AsyncGenerator<AgyEvent>;
    /**
     * Recorded tool step for a mirror-tool call: the event at `eventIndex` must
     * be the completed tool step the callId was minted from.
     */
    toolEventAt(eventIndex: number): {
        name: string;
        args?: unknown;
        output?: unknown;
        error?: string;
    } | null;
    /** Raw errors reported by completed agy tool steps, in event order. */
    toolErrors(): string[];
    /** Store full DB-resolved tool args for a step (set during span driving). */
    setFullArgs(eventIndex: number, args: Record<string, unknown>): void;
    /** Store DB-resolved thoughts for a step (set during span driving). */
    setThoughts(eventIndex: number, text: string): void;
    /** Retrieve DB-resolved thoughts for a step if previously resolved. */
    getThoughts(eventIndex: number): string | undefined;
}
/** Full-args resolver injected into RunRecording (set in RunRegistry.create). */
export type FullArgsResolver = (eventIndex: number) => Promise<Record<string, unknown> | null>;
/** Prefix every mirrored agy tool callId carries; continuation detection key. */
export declare const AGY_CALL_PREFIX = "agytc-";
/** Mint the callId for one recorded tool event. */
export declare function mirrorCallId(runId: string, eventIndex: number): string;
/** Parse a callId back into its run coordinates; null when not ours. */
export declare function parseMirrorCallId(callId: string): {
    runId: string;
    eventIndex: number;
} | null;
/**
 * Bounded registry keeping the most recent runs for continuation spans.
 *
 * Eviction is deliberately conservative: a run is only dropped when it is
 * SETTLED, UNPINNED and is not the most recently used entry. A wedged agy
 * tool step can keep a run alive for hours while other DSH sessions create
 * their own runs (flash-blast incident, 2026-10-10): a pure FIFO cap evicted
 * that run mid-flight, and the mirror call the span had already queued —
 * `agy_tool({run, step})` — could no longer be resolved, so the model lost
 * the tool result and burned the turn debugging the bridge instead.
 */
export declare class RunRegistry {
    private readonly runs;
    /** runId -> pin count while a span is actively driving that recording. */
    private readonly pinned;
    create(): RunRecording;
    /**
     * Insert a run, or refresh one that is about to be consumed again (a
     * continuation span re-registers its recording so a long-lived run is the
     * most recent entry and survives the eviction that follows its cut).
     */
    remember(rec: RunRecording): void;
    get(runId: string): RunRecording | undefined;
    /**
     * Pin a run for the duration of a span drive. Pinned (and unsettled) runs
     * are exempt from eviction, so a span that waits hours for a wedged tool
     * step can still resolve the mirror calls it emits afterwards.
     */
    pin(runId: string): void;
    unpin(runId: string): void;
    /** Drop a settled run early (called when its final span finished stop). */
    forget(runId: string): void;
    /** Retained run ids, oldest first (diagnostics / tests). */
    get runIds(): readonly string[];
    /** Number of retained runs. */
    get size(): number;
    /** Number of currently pinned run ids (diagnostics / tests). */
    get pinnedCount(): number;
    /**
     * Trim back to the cap without ever breaking an in-flight run: evict the
     * oldest SETTLED, UNPINNED entry, never the most recent one (the next
     * mirror dispatch or continuation addresses it). Live (unsettled) and
     * pinned runs are exempt, so the registry may temporarily exceed the cap
     * while several runs are in flight — strictly better than failing a replay.
     */
    private evict;
}
export {};
