/**
 * Profile shapes for the ACP agent routes Fusion hosts.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
/** How the ACP agent's own tool-permission requests are answered. */
export type PermissionPolicy = 'ask' | 'allow' | 'read-only' | 'reject';
/** Whether the Host system prompt is forwarded to the agent. */
export type SystemPromptMode = 'drop' | 'forward';
/**
 * Whether the route offers image input. `auto` follows the prompt capabilities the
 * agent declares in its ACP handshake; the other two override an agent that
 * misreports them.
 */
export type ImageInputMode = 'auto' | 'force' | 'off';
export interface AcpModelProfile {
    id: string;
    name?: string;
    description?: string;
    contextWindow?: number;
}
/** One configured ACP agent route, keyed by its provider route id. */
export interface AcpAgentProfile {
    displayName?: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd?: string;
    authMethod?: string;
    models: AcpModelProfile[];
    discoverModels: boolean;
    permission: PermissionPolicy;
    imageInput: ImageInputMode;
    systemPrompt: SystemPromptMode;
    showToolCalls: boolean;
    contextWindow: number;
    startupTimeoutMs: number;
    idleTimeoutMs: number;
}
/**
 * The `acp` configuration block: one profile per provider route.
 *
 * `agents` is declared volatile so the Host publishes a live-editable settings form, so a
 * parsed Config carries a `{ get() }` reference at that key rather than a plain map. Read it
 * through `agentsOf()`; `Object.entries(config.acp.agents)` sees only the reference's own
 * `get` method. The type below describes the declared (input) shape, which is what the
 * schema validates.
 */
export interface AcpConfig {
    agents: Record<string, AcpAgentProfile>;
}
/** The MCP server declaration an ACP `session/new` carries. */
export interface AcpMcpServerHttp {
    type: 'http';
    name: string;
    url: string;
    headers: {
        name: string;
        value: string;
    }[];
}
