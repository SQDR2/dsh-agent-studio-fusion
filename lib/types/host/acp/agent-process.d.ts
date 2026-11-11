/**
 * Driving one ACP agent process over stdio JSON-RPC.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 *
 * One difference from the source: `newSession` takes the MCP server declarations the
 * caller resolved for this exact request, so a Fusion Sidekick ACP session can be given
 * the Host-tool bridge while every other ACP session gets an empty list.
 */
import type { ContentBlock as AcpContentBlock, McpServer, NewSessionResponse, PromptResponse, RequestPermissionRequest, RequestPermissionResponse, SessionConfigOption, SessionUpdate } from '@agentclientprotocol/sdk';
import type { AcpHostLogger } from './host.js';
import type { AcpPromptCapabilities } from './prompt-capabilities.js';
import type { AcpAgentProfile } from './types.js';
export interface AcpAdvertisedModel {
    id: string;
    name: string;
    description?: string;
    /** The model's context window, when the agent states it ahead of any turn. */
    contextWindow?: number;
}
export interface AcpSessionModels {
    configId?: string;
    legacy: boolean;
    current?: string;
    available: AcpAdvertisedModel[];
}
/** The agent's `thought_level` config option, mapped onto dsh reasoning efforts. */
export interface AcpSessionEfforts {
    configId: string;
    current?: string;
    /** The level the session started with: what dsh's "Default" effort restores. */
    initial?: string;
    available: AcpAdvertisedModel[];
}
export interface AcpSession {
    sessionId: string;
    generation: number;
    models: AcpSessionModels;
    efforts?: AcpSessionEfforts;
}
export type AcpPermissionHandler = (sessionId: string, request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
export interface AcpAgentOptions {
    route: string;
    profile: () => AcpAgentProfile;
    onPermission: AcpPermissionHandler;
    logger: AcpHostLogger;
    /** Every completed handshake, so the caller can remember what this agent accepts. */
    onCapabilities?: (capabilities: AcpPromptCapabilities) => void;
}
/** Read the `thought_level` select the agent offers, if any. */
export declare function sessionEfforts(options: readonly SessionConfigOption[] | null | undefined): AcpSessionEfforts | undefined;
/** Fold a fresh `configOptions` list (set_config_option answer or config_option_update) into a session. */
export declare function applyConfigOptions(session: AcpSession, options: readonly SessionConfigOption[] | null | undefined): void;
export declare function sessionModels(response: NewSessionResponse): AcpSessionModels;
export declare class AcpAgentProcess {
    private readonly options;
    private live;
    private starting;
    private generationCounter;
    private disposed;
    private stderrTail;
    private readonly listeners;
    private advertised;
    private defaults;
    /** Thought levels per agent model, as offered right after switching to it; null when it offers none. */
    private readonly modelEfforts;
    private probe;
    private probing;
    constructor(options: AcpAgentOptions);
    get generation(): number;
    /** What the running agent said it accepts in a prompt; undefined until it has spoken. */
    get promptCapabilities(): AcpPromptCapabilities | undefined;
    get supportsImages(): boolean;
    /**
     * Ask the agent itself what prompt content it accepts. ACP answers that in `initialize`,
     * so the handshake alone is enough — no session and no turn.
     */
    probeCapabilities(signal?: AbortSignal): Promise<AcpPromptCapabilities>;
    get advertisedModels(): readonly AcpAdvertisedModel[] | undefined;
    /** The model the agent starts a fresh process on, which is what dsh's "default" model means. */
    get defaultModel(): string | undefined;
    /**
     * The thought levels the agent offers for one model, if it offers any. Levels differ per
     * model; one not switched to yet reads as the default model's.
     */
    effortsFor(model: string): AcpSessionEfforts | undefined;
    /**
     * Learn the thought levels the agent offers for one model. An agent lists only the current
     * model's levels, so this switches a shared probe session to the model once.
     */
    learnEfforts(model: string, cwd: string, signal?: AbortSignal): Promise<void>;
    /**
     * Open one ACP session. `mcpServers` is the exact bridge declaration the caller resolved
     * for this request; it is empty for every session that is not a Fusion Sidekick turn.
     */
    newSession(cwd: string, signal?: AbortSignal, mcpServers?: readonly McpServer[]): Promise<AcpSession>;
    /** Switch a session to a model; "default" switches back to the model the agent starts on. */
    selectModel(session: AcpSession, model: string, signal?: AbortSignal): Promise<void>;
    /**
     * Apply a dsh reasoning effort through the agent's `thought_level` option. Unknown efforts
     * (the model changed the offered levels) keep the agent's current level.
     */
    selectEffort(session: AcpSession, effort: string, signal?: AbortSignal): Promise<void>;
    prompt(session: AcpSession, prompt: AcpContentBlock[], onUpdate: (update: SessionUpdate) => void): Promise<PromptResponse>;
    cancel(session: AcpSession): void;
    closeSession(session: AcpSession): void;
    discoverModels(cwd: string, signal?: AbortSignal): Promise<readonly AcpAdvertisedModel[]>;
    restart(): void;
    dispose(): void;
    private teardown;
    private agentModel;
    private knowsEfforts;
    private recordEfforts;
    /** Probes share one idle session per agent process, so reading metadata never piles up sessions. */
    private probeSession;
    /** Run probe work one task at a time, since every task may switch the probe session's model. */
    private serial;
    private requireLive;
    private ensure;
    private start;
    private stderrSuffix;
    private startError;
    private transportError;
    private withAbort;
}
