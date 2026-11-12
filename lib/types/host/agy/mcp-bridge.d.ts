/** Minimal structural view of the DSH tool registry we need. */
export interface ToolsServiceLike {
    /**
     * Visible tool schemas for one scope. `scope` is the viewing agent (its
     * `ctx` is the registration scope): omitting it yields the GLOBAL view only,
     * which excludes every tool a plugin registered on an agent's own scope
     * (e.g. Fusion's `fusion_*`, registered via `agent.ctx.tools.register`).
     * Passing the resolved calling agent is therefore what makes agent-scoped
     * tools bridgeable at all.
     */
    schemas(scope?: unknown): Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
    execute(input: {
        callId: string;
        name: string;
        arguments: unknown;
        agent?: unknown;
        /**
         * Caller-owned cancellation, required by DSH's `ToolExecutionInput`. Tools
         * read `exec.signal` before/while they settle, so a call without one throws
         * `Cannot read properties of undefined (reading 'aborted')`.
         */
        signal: AbortSignal;
    }): Promise<unknown>;
}
/** MCP tool names are [a-zA-Z0-9_-]; DSH names may contain dots. */
export declare function toMcpName(name: string): string;
export interface McpBridge {
    /** Absolute path of the bridge script (dist/bridge.mjs). */
    bridgeScript: string;
    /** Bearer token the bridge script must present. */
    token: string;
    /** Base URL of the loopback endpoint. */
    url: string;
    port: number;
    close(): Promise<void>;
}
/**
 * Start the loopback endpoint. Resolves once listening. The tools service
 * may arrive later (optional service): pass a thunk.
 */
export declare function startMcpBridge(opts: {
    bridgeScript: string;
    tools: () => ToolsServiceLike | undefined;
    allowlist: () => string;
    /** Map the spawning DSH session id to the agent the call runs on behalf of. */
    resolveAgent?: (sessionId: string) => unknown | Promise<unknown>;
    log?: (msg: string) => void;
    /** Max buffered request-body bytes (tests use a small value). */
    maxBodyBytes?: number;
}): Promise<McpBridge>;
/** `agy` home the CLI reads its configs from (mirrors the runner's isolated-home rule). */
export declare function agyConfigHome(env?: NodeJS.ProcessEnv): string;
/**
 * Absolute path of the MCP server registry `agy` 1.4+ actually loads.
 * `override` wins so callers can target a specific file.
 * Correctly distinguishes between a home dir (`/path/to/home`) and a
 * direct .gemini dir (`/path/to/home/.gemini`).
 */
export declare function agyMcpConfigPath(override?: string, env?: NodeJS.ProcessEnv): string;
/** Registry key for one bridge instance: unique per port so two DSH hosts sharing a global file never clobber each other. */
export declare function mcpServerKey(port: number): string;
/**
 * Merge our server entry into the MCP registry file at `file` (`agy` 1.4+
 * reads the global one; a workspace `.mcp.json` is ignored, see issue #55).
 * Returns a restore function that puts the previous content back (or deletes
 * the file we created). Never throws.
 */
export declare function writeMcpConfig(file: string, bridge: McpBridge): () => void;
