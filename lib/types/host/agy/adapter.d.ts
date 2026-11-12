import { LlmAdapter, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo, type RequestMessage, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { type PluginConfig } from './types.js';
import type { AccountPoolManager } from './pool.js';
import { type RunRecording, type RunRegistry } from './recording.js';
import { ModelCatalog } from './models.js';
import { StreamJsonParser } from './parser.js';
import { type ImageRefLike } from './media.js';
import { type SessionStore } from './sessions.js';
/**
 * Correlation id of a tool-result message. Accepts `message.toolCallId`
 * (0.1.7+), `source.callId` (0.1.x), and nested `tool-result` blocks.
 */
export declare function toolCallIdOf(m: RequestMessage): string | null;
/**
 * Detect synthetic harness messages injected by DSH.
 *
 * DSH injects runtime telemetry and reminder blocks with `role: 'user'`, such as:
 * - time-context: "Time sampled while preparing turn X, step Y: ..."
 * - skill-catalog: "<system-reminder>\nA skill is a reusable set..."
 * - runtime-context: "Current runtime context. This snapshot supersedes..."
 * - model-selection: "[model changed: ...]"
 * - system-reminder: "<system-reminder>..."
 *
 * These are harness infrastructure, NEVER real human user tasks. If treated
 * as a user task, they overwrite the user's actual instruction with a timestamp
 * or reminder block, causing agy to completely ignore the user's latest input
 * (e.g. session-c65a826e where 42 time samples were appended).
 */
export declare function isSyntheticHarnessMessage(m: RequestMessage): boolean;
/** True for a real human user turn (not a tool result, not a synthetic harness snapshot). */
export declare function isRealUserMessage(m: RequestMessage): boolean;
/**
 * Latest real human turn (not a tool result, not assistant, not harness metadata).
 * This is the live task; a digest or tool-result-only trailing span must never drop it
 * (issue #35: "续跑提示词里没有任务").
 */
export declare function latestUserTaskText(messages: readonly RequestMessage[]): string;
/**
 * Last user message REGARDLESS of the synthetic-looking prefix heuristics,
 * searched only within the TRAILING span (after the last assistant message).
 *
 * The sniffing exists so harness telemetry (time samples, skill catalogs,
 * `<system-reminder>` snapshots) never overwrites a REAL task. But when the
 * synthetic-looking message is the ONLY user content of the turn — the user
 * pasted a reminder block to ask about it — filtering it left the turn with
 * no task at all ("request carries no user text"). Callers fall back to this.
 *
 * The span bound keeps the image-only regression fixed: a trailing
 * image-only turn must NOT rescue an older question from before the last
 * assistant reply, exactly as latestUserTaskText refuses to.
 */
export declare function latestUserMessageAny(messages: readonly RequestMessage[]): string;
/**
 * Images this hop should forward, minus what the current agy conversation
 * has already received. Trailing-span attachments come first (this hop's
 * screenshots), then any user-turn attachments since `fromIdx` that carry
 * unseen ids (tool-hop continuations and foreign-model turns used to fall
 * into a "re-send every historical screenshot" path).
 */
export declare function collectUnsentImageRefs(messages: readonly RequestMessage[], trailingUser: readonly RequestMessage[], fromIdx: number, sentIds: readonly string[]): ImageRefLike[];
/** Merge newly forwarded attachment ids into a bounded, oldest-first list. */
export declare function mergeSentImageIds(existing: readonly string[] | undefined, added: readonly string[], max?: number): string[];
/**
 * Rolling digest of turns this agy conversation has not seen (ADR-7).
 *
 * Budget policy (issue #35): the latest real user task is reserved first so
 * a wall of tool-result text can never truncate the question away. Remaining
 * budget is filled from the newest other turns.
 */
export declare function utf8Bytes(s: string): number;
/**
 * Keep the longest prefix whose UTF-8 encoding fits `maxBytes`, never splitting
 * a multi-byte code point. Appends a short marker unless `note` is false.
 */
export declare function trimToUtf8Bytes(s: string, maxBytes: number, note?: boolean): string;
/** agy 1.4.x silently truncates a single user message at 192,000 UTF-8 bytes
 * (measured: a 300 KB ASCII prompt kept exactly 192,000 B; a 490 KB CJK prompt
 * kept 191,998 B) and the cut lands on the TAIL. Every prompt we build must
 * stay under that with margin, and the live request must sit at the HEAD. */
export declare const AGY_SINGLE_MESSAGE_MAX_BYTES = 192000;
export declare const AGY_PROMPT_SAFE_BYTES = 180000;
/**
 * Put the live request at the very head of the prompt so agy's tail-side
 * truncation can only ever discard background history, never the question.
 */
export declare function wrapLiveRequest(live: string): string;
/** Write a large context digest to a temp .md so agy can read it in pages. */
export declare function writeContextTransferFile(sessionKey: string, body: string): Promise<string | null>;
export interface DigestBudget {
    /** Hard UTF-8 byte ceiling for the returned digest. */
    maxBytes?: number;
    /** Per-line byte ceiling so one huge tool result cannot eat the budget. */
    maxLineBytes?: number;
    /** Include the reserved "User: <latest task>" line (default true). */
    includeTaskLine?: boolean;
}
export declare function buildDigest(messages: readonly RequestMessage[], fromIdx: number, maxChars: number, budgetOpts?: DigestBudget): string;
export interface AgyAdapterDeps {
    getConfig: () => PluginConfig;
    catalog: ModelCatalog;
    store: SessionStore;
    pool?: AccountPoolManager;
    bin: () => string | null;
    /** Shared semaphore for cross-session concurrency (ADR-12). */
    acquire: (signal?: AbortSignal) => Promise<() => void>;
    log?: (msg: string) => void;
    /** Recordings shared with the agy_tool mirror (native tool-card mirroring). */
    runs: RunRegistry;
    /**
     * Resolve the DSH session's working directory. Called with the raw
     * session id; return an absolute path to run agy inside that workspace.
     * Explicit config `workspaceRoot` still wins over this value.
     */
    sessionCwd?: (sessionId: string) => string | undefined;
    /**
     * Resolve active goal info (goalId, revision) from session history if not present on messages.
     */
    sessionGoal?: (sessionId: string) => {
        goalId: string;
        revision: number;
    } | null;
    /** Last-run telemetry surfaced by /agy status. Process completion and tool failures are distinct. */
    onRun?: (info: {
        processOk: boolean;
        processCode: string;
        toolErrors: readonly string[];
        durationMs: number;
        model: string;
        /** Output-token speed over this run's generation steps (see RunRecording.speedStats). */
        tokenSpeed: ReturnType<RunRecording['speedStats']>;
    }) => void;
    /** Reads image bytes from DSH attachment storage (multimodal staging). */
    readImage?: (ref: ImageRefLike) => Promise<Uint8Array | null>;
    /** Called with each run's parser so the host can keep the last stdout ring for /agy doctor. */
    onParser?: (parser: StreamJsonParser) => void;
    /** Base URL of the media route, e.g. http://127.0.0.1:PORT/plugins/agy-worker/media */
    getMediaBaseUrl?: () => string | null;
    /** Synchronizes active model selection back to DSH input box / session */
    syncSessionModel?: (sessionId: string, model: string, effort?: string) => void;
}
/**
 * Reserved block index for pre-spawn status notices.
 *
 * Negative on purpose: the mapper's own blocks count up from 0, so a negative
 * index can never be closed by a mapper `block-end` later in the run (the
 * assembler ignores deltas for a closed index). Deltas alone are enough — the
 * assembler explicitly tolerates delta-only protocols — so the notices land as
 * one growing reasoning block at the top of the turn.
 */
export declare const STATUS_NOTICE_BLOCK_INDEX = -1;
/**
 * Await `work` while periodically yielding a SESSION-VISIBLE notice.
 *
 * Why this exists: Windows has ONE machine-global credential slot, so every
 * session's agy run is serialized behind whichever session got there first.
 * A healthy long run (a 15-minute build, a 240-minute long tool) made the
 * OTHER sessions sit with a completely empty transcript for up to
 * `dispatchTimeoutMinutes` — indistinguishable from a freeze. The console
 * heartbeat was invisible to the user, so the only honest signal was "nothing
 * is happening" (2026-10-22: two sessions looked hung for 15 minutes while
 * another project's agy run held the slot).
 *
 * Resolves with `work`'s value; rejects with `work`'s rejection untouched, so
 * the caller's existing error classification is unchanged.
 */
export declare function awaitWithNotices<T>(work: Promise<T>, opts: {
    /** Delay before the FIRST notice (and the base for later ones). */
    intervalMs: number;
    /** Growth factor between notices (default 1 = constant cadence). */
    escalate?: number;
    /** Upper bound for the cadence after escalation. */
    maxIntervalMs?: number;
    /** Text for the current wait duration in milliseconds. */
    notice: (elapsedMs: number) => string;
}): AsyncGenerator<StreamChunk, T, void>;
export declare class AgyAdapter extends LlmAdapter {
    private readonly deps;
    private readonly warnedKeys;
    /** sessionKey -> in-flight run, for steer-time preemption. */
    private readonly activeRuns;
    /**
     * sessionKey -> prompt info for duplicate submission debounce.
     * `inFlight` is true from submit until the run settles (or spawn throws),
     * so a settled failure can never wall a legitimate retry.
     */
    private readonly activeSessionPrompts;
    /** accountId -> timestamp of last spawn for spacing throttling */
    private readonly lastAccountSpawnTime;
    private readonly minSpawnIntervalMs;
    /** Global sliding window timestamps for batch rate-limiting protection */
    private readonly requestTimestamps;
    /**
     * sessionKey -> account failovers claimed inside the current window.
     *
     * A settled recording that died of an ACCOUNT-scoped failure is retried on
     * another account instead of being replayed (post-tool quota exhaustion used
     * to dead-end the turn). That retry happens inside one DSH step, so DSH's own
     * retry budget cannot bound it: without this counter a soft capacity refusal
     * (which cools nothing) would rotate A→B→C→A…, re-running the user's tools on
     * every cycle.
     */
    private readonly failoverBudget;
    private static readonly FAILOVER_WINDOW_MS;
    /**
     * Same shape, but for HARD rate-limit hops only. A hard 429 gives the failed
     * account a cooldown of at least the server-quoted reset (default 10m), so
     * each claim provably makes progress and cannot loop. The generic 120s/2-hop
     * budget above exists to stop SOFT failures (which cool nothing) from
     * rotating forever — but a long-running turn's quota failures arrive spread
     * over minutes (observed live: 429 at 20:28 with "Resets in 11m", further
     * hops at 20:28:43 and 20:29:17), so the tight window spent itself while a
     * full-quota account sat idle and the turn dead-ended (2026-10-10 20:29).
     * Rate-limit hops get their own pool-depth budget over a window as long as
     * the default cooldown, refreshed on every fresh failure.
     */
    private readonly rateLimitFailover;
    private static readonly RATE_LIMIT_FAILOVER_WINDOW_MS;
    /**
     * sessionKey -> consecutive transport failures and when the streak started.
     *
     * The streak drives the 5s/15s/30s retry delay handed to DSH. A success (or
     * any non-transport failure) clears it, and a gap longer than the window
     * treats the next failure as a fresh streak: a user who retries a turn ten
     * minutes after an outage must not start by waiting 30 seconds.
     */
    private readonly networkStreak;
    private static readonly NETWORK_STREAK_WINDOW_MS;
    constructor(deps: AgyAdapterDeps);
    private warnOnce;
    /**
     * Record one transport failure and return the streak position (1-based).
     * Position drives the delay requested from DSH.
     */
    private noteNetworkFailure;
    /** Drop the transport streak: the session reached Google (or failed another way). */
    private clearNetworkStreak;
    /**
     * Whether every enabled account leaves through the same proxy.
     *
     * A shared egress makes a transport failure a property of the machine's
     * network, not of the account: rotating the sticky pointer repoints the
     * session for nothing and spends the rotation budget a real quota or
     * eligibility hop needs (live 2026-10-21: one flapping proxy produced EOFs
     * on every account and the turn still rotated the pool).
     */
    private sharesSingleEgress;
    /** Mark a session prompt as no longer in flight so retries are not debounced. */
    private clearInFlightPrompt;
    /**
     * Claim one account failover for a session, bounded by the pool's spare
     * depth ((enabled accounts - 1) inside a short window). Returns false when
     * the failure is not account-scoped or the budget is spent — the caller then
     * replays the recorded failure so the turn ends with the real error.
     */
    private claimFailover;
    /**
     * Fail fast on auth and abort; allow retries for transient process failures
     * (timeout, crash, malformed stream) per ADR-11.
     *
     * Account-scoped failures (RATE_LIMIT / ELIGIBILITY / NETWORK / OVERLOADED)
     * are retryable on purpose: the failed account was cooled down or skipped and
     * the sticky pointer advanced BEFORE the error surfaced, so the retry is
     * served by the NEXT account in the pool — quota exhaustion used to dead-end
     * in a user-visible error even though a healthy account was idle.
     *
     * The budget follows the pool: a 3-account pool gets 2 retries, because one
     * hop is not enough to survive a spent account followed by a second account
     * whose token expired mid-flight (observed live: primary ELIGIBILITY → g98
     * "not signed in" → turn lost, 2026-10-10 14:17). A single-account pool keeps
     * the old single retry.
     */
    providerRetryPolicy(_provider: string): {
        mode: "normal";
        maxRetries: number;
        retryableCodes: string[];
        initialDelayMs: number;
        maxDelayMs: number;
        jitterRatio: number;
    };
    providerInfo(_provider: string): LlmProviderInfo;
    private getActiveAccount;
    listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(_provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /**
     * Bind exact model metadata and dispatch to ONE adapter generation.
     * Required by dsh-llm >= 0.1.1-rc.2: LlmRuntime.prepareCall calls
     * registration.adapter.prepareCall(provider, model, signal) unconditionally,
     * so an adapter compiled against the old base class (no prepareCall) crashed
     * with "registration.adapter.prepareCall is not a function" on new hosts.
     * Implemented explicitly here so both old and new runtimes work: the old
     * runtime never calls it, the new runtime gets the capability-bound handle.
     * Declared without `override`/imported types on purpose: the plugin still
     * typechecks against dsh-llm ^0.1.0-rc.6 (no prepareCall in the base), while
     * the runtime contract matches the 0.1.1-rc.2 PreparedAdapterCall shape
     * { model: LlmResolvedModelInfo; stream(options): AsyncIterable<StreamChunk> }.
     */
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<{
        model: LlmResolvedModelInfo;
        stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    }>;
    /**
     * Deliver a context-transfer digest: inline when small, file-referenced when
     * large. agy caps a single user message at 192,000 UTF-8 bytes and cuts the
     * tail, so big histories must travel as a readable file (agy pages through it)
     * instead of one giant message.
     */
    private deliverContext;
    /** Build the agy argv for one call. Exported for tests. */
    buildArgs(opts: {
        prompt: string;
        model: string;
        effort?: string;
        conversationId?: string;
        permissionMode: PluginConfig['permissionMode'];
        timeoutMs: number;
        extraArgs: readonly string[];
        addDirs?: readonly string[];
        printTimeoutMinutes?: number;
        /** Omit `-p <prompt>` and add `--input-format stream-json` (prompt rides stdin). */
        promptViaStdin?: boolean;
    }): string[];
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /**
     * Stream one span of a recording: map events from `from` until the mapper
     * finishes (tool-calls cut or result stop), then let the queue drain. When
     * the recording settles without a consumable result, surface its failure
     * as this span's terminal chunk — the turn ends exactly like a native
     * provider error.
     */
    private driveSpan;
    /** Body of {@link driveSpan}: map recorded events until the span finishes. */
    private driveSpanBody;
}
/**
 * Detect a continuation span: the request's LAST message is the tool result
 * of one of our mirrored agy tool calls. Its callId encodes the recording
 * run and the event index to resume after.
 *
 * Accepts both dsh-llm tool-result shapes: `role: 'user'` + `source.callId`
 * (0.1.x) and `role: 'tool'` + `message.toolCallId` (0.1.7+). Rejecting the
 * latter made every post-tool hop spawn a fresh agy process with a
 * digest-only prompt (issues #34 / #35).
 */
export declare function detectContinuation(messages: readonly RequestMessage[]): {
    runId: string;
    eventIndex: number;
} | null;
