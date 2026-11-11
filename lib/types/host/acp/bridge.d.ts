/**
 * A capability-secure MCP bridge for Fusion Sidekick ACP sessions.
 *
 * Mirrors the return-channel design the Antigravity route uses, but over MCP: an ACP
 * agent process can only reach Host tools if the ACP client (this plugin) declares an
 * MCP server in `session/new`. This bridge is that server, and it is mounted only for an
 * exact Fusion Worker ACP dispatch.
 *
 * Security properties (all enforced here, not by the adapter):
 * - A server declaration is issued only when `sessionId` resolves to a live Agent whose
 *   Fusion coordinator owner is role `worker`, whose current work order permits tools,
 *   and whose selected route is this ACP route.
 * - The URL carries an unguessable token bound to the Agent id, DSH session id, Fusion
 *   task id, current work order id/revision and the configured `workerTools` set.
 * - Every tool call re-resolves the Agent from the DSH registry and re-checks the owner,
 *   route, task, work order and ceiling. Stale, forged, cross-session, canceled or
 *   expired tokens are refused; a refused grant is revoked.
 * - Only tool schemas visible in the Worker's own scope and allowed by `workerTools` are
 *   listed; Fusion's `fusion_*` internals and route transports are never exposed.
 * - Calls dispatch through `ctx.tools.execute` with the exact live Agent and a branded
 *   `ToolCallId`, so DSH guards, approvals, sandbox policy and Fusion's coordinator
 *   checks stay authoritative. No tool implementation is called directly.
 * - An AbortController per call is abandoned when the HTTP request closes, the ACP turn
 *   aborts, the ACP session closes, or the bridge is disposed.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
import type { AcpMcpServerHttp } from './types.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
/** The MCP endpoint every bridge token lives under. */
export declare const ACP_MCP_PATH = "/api/fusion/acp-mcp";
/** How long one issued bridge token may live before it must be re-issued. */
export declare const DEFAULT_TOKEN_TTL_MS: number;
/** The work-order modes that may reach Host tools at all. */
export type ToolMode = 'implement' | 'explore';
/** Exactly what one live Fusion Worker ACP dispatch is, at the moment a token is bound. */
export interface AcpWorkerFacts {
    readonly dshSessionId: string;
    readonly taskId: string;
    readonly workOrderId: string;
    readonly workOrderRevision: number;
    readonly briefRevision: number;
    readonly mode: ToolMode;
    readonly route: {
        readonly provider: string;
        readonly model: string;
    };
}
/** The Fusion side of the bridge: all of it reads live state, never a cached snapshot. */
export interface AcpBridgeAuthority {
    /** The live Agent this Host still holds for one DSH session, if any. */
    agentOf(dshSessionId: string): Agent | undefined;
    /** This Agent's exact Fusion Worker facts, or undefined for anything that is not one. */
    workerFacts(agent: Agent): AcpWorkerFacts | undefined;
    /** Tool schemas visible in this Agent's own scope. */
    schemasOf(agent: Agent): readonly ToolSchema[];
    /** Dispatch through DSH's guarded pipeline (`ctx.tools.execute`). */
    execute(input: {
        agent: Agent;
        name: string;
        arguments: unknown;
        callId: ToolCallId;
        signal: AbortSignal;
    }): Promise<ToolExecutionResult>;
}
export interface AcpBridgeOptions {
    /** The configured Sidekick ceiling (`workerTools`). */
    workerTools: readonly string[];
    /** Origin the ACP agent can reach, resolved when a session is opened. */
    origin: () => string;
    now?: () => number;
    ttlMs?: number;
    /** Test seam: the token value. Production uses 32 random bytes. */
    tokenFactory?: () => string;
}
/** What one ACP dispatch asks the bridge for. */
export interface AcpBridgeRequest {
    readonly sessionId?: string;
    /** `compaction`/`session-title` and other auxiliary calls never get a bridge. */
    readonly purpose?: string;
    readonly route: string;
    readonly model: string;
}
/**
 * The MCP server for Fusion Sidekick ACP requests, plus the grant bookkeeping that decides
 * whether one may exist at all.
 */
export declare class AcpToolBridge {
    #private;
    private readonly authority;
    private readonly options;
    private readonly grants;
    constructor(authority: AcpBridgeAuthority, options: AcpBridgeOptions);
    /**
     * The MCP server declarations to put in one ACP `session/new`.
     *
     * Empty unless this exact request is a live Fusion Worker dispatch on this route, in a
     * mode that permits tools. Never for a Lead, an ordinary ACP route call, a discovery or
     * compaction request, or a Worker in text mode.
     */
    serversFor(request: AcpBridgeRequest): AcpMcpServerHttp[];
    /**
     * Whether an ACP session opened for `request` may keep being reused as it is.
     *
     * A reused ACP session never runs `session/new` again, so its bridge token is the one
     * issued earlier. When the request would now need a bridge but the existing token no
     * longer matches the current task/work order/route (or expired), the session must be
     * replaced instead of reused — otherwise the Sidekick silently loses its tools.
     */
    canReuse(request: AcpBridgeRequest): boolean;
    /** Revoke every token bound to one DSH session (ACP session close or replacement). */
    revokeSession(dshSessionId: string): void;
    /** Abort in-flight calls of one session without revoking its grant (request abort). */
    cancelInflight(dshSessionId: string): void;
    /** Revoke every grant and abort every call (plugin unload). */
    dispose(): void;
    /** The tools this exact Agent may reach right now: ceiling ∩ own scope − internals. */
    allowedTools(agent: Agent, facts: AcpWorkerFacts): readonly string[];
    /**
     * The MCP Streamable HTTP endpoint. One JSON-RPC message per POST; a notification gets
     * `202`, a request gets `application/json`.
     */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
