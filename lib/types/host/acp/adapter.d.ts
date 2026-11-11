/**
 * The DSH LLM adapter that turns each configured ACP agent into a model route.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 *
 * Additions for Fusion: when a new ACP session is opened for a request that the bridge
 * authority accepts (a live Fusion Sidekick turn on this route), the adapter attaches the
 * Host-tool MCP bridge to that `session/new`. Every other request — Lead turns, plain ACP
 * route use, discovery, compaction, text mode, absent sessions — opens with no servers.
 */
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AcpHost } from './host.js';
import type { AcpBridgeRequest } from './bridge.js';
import type { AcpAdvertisedModel } from './agent-process.js';
import type { AcpAgentProfile, AcpMcpServerHttp } from './types.js';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { ContextWindows } from './context-windows.js';
import { PromptCapabilitiesCache } from './prompt-capabilities.js';
/** The narrow bridge surface the adapter needs; production is {@link AcpToolBridge}. */
export interface AcpBridgeMount {
    serversFor(request: AcpBridgeRequest): AcpMcpServerHttp[];
    /**
     * Whether an ACP session may keep being reused: a reused session never runs
     * `session/new`, so its bridge token must still match the current work order.
     */
    canReuse?(request: AcpBridgeRequest): boolean;
    revokeSession(dshSessionId: string): void;
    cancelInflight(dshSessionId: string): void;
}
export declare class AcpAdapter extends LlmAdapter {
    #private;
    private readonly host;
    private readonly profiles;
    private readonly contextWindows;
    private readonly capabilities;
    private readonly bridge;
    private readonly agents;
    private readonly bindings;
    private readonly turns;
    private readonly retryPolicy;
    constructor(host: AcpHost, profiles: () => ReadonlyMap<string, AcpAgentProfile>, contextWindows?: ContextWindows, capabilities?: PromptCapabilitiesCache, bridge?: AcpBridgeMount | undefined);
    sync(): void;
    dispose(): void;
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(): ResolvedRetryPolicy;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /**
     * Ask the agent behind one configured route which models it advertises, regardless of
     * the profile's declared `models` and `discoverModels` switch. Settings surfaces use this
     * to offer the agent's own list for adoption.
     */
    advertisedModels(provider: string, signal?: AbortSignal): Promise<readonly AcpAdvertisedModel[]>;
    /**
     * Exact-model metadata. Capabilities come from the agent itself: accepted input from the
     * `promptCapabilities` of its ACP handshake (learned here, remembered across restarts),
     * reasoning efforts from the `thought_level` option it offers for this very model, and the
     * context window it last reported through `usage_update`, else the one its model list
     * states, else one a "1m" token in the model's id, name or description implies.
     */
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /**
     * Ask the agent about one model before dsh uses it: the models it advertises (with any
     * context windows they state) and the thought levels it offers for that model.
     */
    private learnModel;
    /**
     * What the route accepts as input. dsh reads an omitted `inputModalities` as "unknown" and
     * sends images through untouched, while an explicit list without `image` is a negative it
     * acts on by replacing every attachment with text before the adapter is even called. So an
     * agent whose handshake nobody has heard yet must stay silent rather than claim text only.
     */
    private modalities;
    /** The running agent's handshake answer, else the one it gave for these spawn facts before. */
    private promptCapabilitiesOf;
    /**
     * Make sure the ACP handshake has happened at least once, since that is where an agent
     * states the content types it accepts. The answer is cached per route, so this starts an
     * agent only the first time dsh asks about a route it has never heard from.
     */
    private learnCapabilities;
    /** Read every image the prompt wants, as base64 request versions; unreadable ones stay text. */
    private readImages;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private run;
    private finish;
    /**
     * A turn the agent reports as cancelled. Agents end a turn that way when a tool call is
     * refused, and CodeBuddy also reports the turn after such a refusal as cancelled although
     * it answered in full, so only a cancel this side asked for is an abort.
     */
    private cancelled;
    private agent;
    private cwdOf;
    private dropBindings;
}
