import type { StreamChunk, TokenUsage, ToolCallId } from '@deepseek-ai/dsh-llm';
import type { AgyEvent, RawUsage } from './types.js';
import { type GoalContext } from './dsh-goal.js';
export declare const toToolCallId: (id: string) => ToolCallId;
export interface ToolCallBinding {
    readonly id: string;
    readonly name: string;
}
export interface ToolCallState {
    last: ToolCallBinding;
    pending: ToolCallBinding[];
}
/**
 * Disambiguate duplicate tool-call IDs across turns or multiple calls in a session.
 * Reusing a call ID across different tool names triggers INVALID_ARGS in DSH; suffixing
 * with #${name} keeps each call uniquely addressable and self-healing.
 */
export declare function rememberToolCallId(toolNames: Map<string, ToolCallState>, rawCallId: string, name: string): string;
export declare function consumeToolBinding(toolNames: Map<string, ToolCallState>, callId: string): ToolCallBinding | undefined;
export declare function expirePendingToolCalls(toolNames: Map<string, ToolCallState>): void;
export declare function usageFromRaw(raw: RawUsage): TokenUsage;
/** Suffix-delta: emit only what grew; fall back to a newline + full text. */
export declare function suffixDelta(prev: string, next: string): string;
export interface EventMapperOptions {
    /** Run whose event indices mint mirror callIds. */
    runId: string;
    /** Cut spans on completed tool steps (main turns). False for auxiliary calls. */
    cutOnTool: boolean;
    /** Whether an earlier span of this run already streamed assistant text. */
    initialSawText?: boolean;
    /**
     * True if DSH is in Code Mode (options.tools has 'run_code').
     * False if DSH is in Native / Standard Mode (options.tools has 'agy_tool' or standard tools).
     */
    useCodeWrapper?: boolean;
    /**
     * Shared per-run usage tracker (lives on the recording, spans share it).
     * Step usage is per-call (current context); the result envelope is
     * conversation-cumulative and must never reach DSH's token meter.
     */
    usage?: {
        noteStepUsage(raw: RawUsage): void;
        finalUsage(resultRaw: RawUsage): RawUsage;
    };
    /**
     * Resolve FULL tool args for a recorded step from the agy conversation DB
     * (stream args are stripped by agy's filterToolParameters). Called when the
     * mapper cuts a tool span; resolved args are stored back on the recording so
     * the mirror's enrichArgs/execute see the same full payload.
     */
    fullArgsAt?: (eventIndex: number) => Promise<Record<string, unknown> | null>;
    /**
     * Synchronously-available full args, keyed by event index. driveSpan
     * pre-resolves these (awaiting fullArgsAt) and hands them to the mapper so
     * the emitted tool-call arguments carry the complete payload without making
     * map() async.
     */
    resolvedFullArgs?: ReadonlyMap<number, Record<string, unknown>>;
    /**
     * Synchronously-available thoughts, keyed by event index. driveSpan
     * pre-resolves these from the agy conversation DB so reasoning blocks stream
     * real thought text instead of token-count annotations.
     */
    resolvedThoughts?: ReadonlyMap<number, string>;
    /** Base URL for the media route, e.g. http://127.0.0.1:5173/plugins/agy-worker/media */
    mediaBaseUrl?: string;
    /** Active DSH goal context for the current turn, if running under <goal_round>. */
    goalContext?: GoalContext | null;
    /** Whether the host provides the `update_goal` tool to mark the goal completed. */
    supportsGoalUpdate?: boolean;
    /** Whether the host provides the `exit_plan_mode` tool for DSH plan mode. */
    supportsPlanExit?: boolean;
}
/** Rewrite local image paths and file:// URLs to point to the local media route. */
export declare function rewriteImageMarkdown(text: string, mediaBaseUrl?: string): string;
export declare class EventMapper {
    private readonly opts;
    private blockIdx;
    private openType;
    private openAcc;
    private readonly emittedByKey;
    private readonly announcedTools;
    private readonly pendingAnnounced;
    private readonly thinkingAnnounced;
    /**
     * Steps whose banner already streamed WITHOUT prose (issue #43: desktop
     * hosts with no sqlite reader). Separate from `thinkingAnnounced` on
     * purpose: DB prose can resolve AFTER the banner streamed, and marking the
     * step announced there would drop the real text (the exact regression
     * issue #43 fixed). When prose arrives later it is appended WITHOUT the
     * banner and the entry is consumed.
     */
    private readonly bannerOnlyShown;
    private readonly bannerOnlyIndices;
    private bannerOnlyThinkingEmitted;
    private sawTextStep;
    private finished;
    private totalTextOutput;
    private readonly toolCallStates;
    constructor(opts: EventMapperOptions);
    /** Whether a terminal finish chunk has been emitted. */
    get isFinished(): boolean;
    private ensureBlock;
    private closeOpen;
    private appendDelta;
    /**
     * Emit thinking: always retain the [agy · ... tokens] banner.
     * When real thought prose is present, place the banner and thought
     * text on the same initial line so DSH's collapsed summary renders:
     *   [agy · *** tokens] [Chain-of-Thought body]
     *
     * With `allowBannerOnly` the bare banner is emitted when the DB prose never
     * arrived (desktop hosts without any sqlite reader, issue #43): the user
     * then at least SEES that a thinking turn happened and how large it was —
     * previously high-effort turns rendered nothing at all.
     */
    private emitThinking;
    /**
     * Map one event. `absIndex` is the event's position in the run recording;
     * it mints the mirror callId and is what continuation detection parses
     * back out of the DSH message list.
     */
    /**
     * Flush any thinking prose that resolved in the DB after its banner-only
     * placeholder already streamed (e.g. tool-heavy steps where thoughts resolved
     * during tool execution).
     */
    private flushBannerOnlyThoughts;
    map(ev: AgyEvent, absIndex: number): Generator<StreamChunk>;
    /**
     * Terminal error/abort: close what is open and finish with the failure.
     *
     * The usage sample is the last per-call context size when agy reported one,
     * NOT a hard-coded 0/0: DSH's token meter treats the last sample as current
     * context occupancy, so a failed turn used to reset the meter and could fire
     * a bogus compaction a step later.
     */
    emitFailure(kind: 'error' | 'aborted', code: string, message: string, 
    /**
     * Provider-requested retry delay (ms). Only transport failures state one:
     * the generic 2s-doubling schedule cannot outlast an egress outage, and the
     * retry plugin honours this value verbatim (up to the policy's maxDelayMs).
     */
    retryAfterMs?: number): Generator<StreamChunk>;
}
