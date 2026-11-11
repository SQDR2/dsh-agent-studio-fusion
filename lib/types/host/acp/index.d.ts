/**
 * Installing the ACP provider routes inside the dsh-fusion Host plugin.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 *
 * Registration happens under the `dsh-fusion` identity: the adapter owns the provider
 * routes named in `acp.agents`, model discovery is offered under the plugin id, and the
 * Host-tool MCP bridge is mounted on this Host's web server. Nothing here creates a second
 * plugin.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AcpWorkerFacts } from './bridge.js';
import type { AcpAgentProfile } from './types.js';
/** The Fusion side of the bridge, as the live coordinator exposes it. */
export interface AcpBridgeSource {
    /** The exact facts of one live Fusion Worker, or undefined for anything else. */
    workerFacts(agent: Agent): AcpWorkerFacts | undefined;
}
export interface InstallAcpOptions {
    /** Configured Sidekick ceiling. */
    workerTools: readonly string[];
    /** The profiles to serve now; an empty map registers no routes. */
    profiles: () => ReadonlyMap<string, AcpAgentProfile>;
    /** The coordinator, once this Host has created it. */
    coordinator: () => AcpBridgeSource | undefined;
}
/**
 * Register the ACP routes, discovery and — only when a coordinator exists — the Sidekick
 * MCP bridge. Returns the disposer; the caller owns it through `ctx.effect`.
 */
export declare function installAcp(ctx: Context, options: InstallAcpOptions): () => void;
