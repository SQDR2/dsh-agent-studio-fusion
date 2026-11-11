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
 *   Fusion coordinator owner is role `worker`, whose current work order permits tools, and
 *   whose selected route *and model* are this ACP route call.
 * - The declaration's URL is the Host's own public origin plus the fixed
 *   {@link ACP_MCP_PATH}; the client's streamable-HTTP POST goes to exactly that path.
 *   The capability itself is an unguessable bearer token carried only in the
 *   `Authorization` header, bound to the Agent id, DSH session id, Fusion task id, current
 *   work order id/revision, brief revision, mode, route and the configured
 *   `workerTools` ceiling. No part of the URL ever carries the token, so nothing that
 *   logs or echoes a URL (agent process logs, proxies, browser history) can replay it.
 * - A request is trusted against that same configured origin, not a fixed loopback list:
 *   `Host` must equal the origin's authority, a present `Origin` must equal the origin, a
 *   cross-site request is refused, and the peer must be this machine (loopback or the exact
 *   address the Host binds). No forwarding header is consulted, so a configured non-loopback
 *   bind keeps working for its own local callers while remote peers and proxies cannot.
 * - Every tool call re-resolves the Agent from the DSH registry and re-checks the owner,
 *   route, model, task, work order, brief revision and ceiling. Stale, forged,
 *   cross-session, canceled or expired tokens are refused; a refused grant is revoked.
 * - Only tool schemas visible in the Worker's own scope and allowed by `workerTools` are
 *   listed; Fusion's `fusion_*` internals and route transports are never exposed. An
 *   `explore` order is the intersection of `workerTools` with the read-only tools, so it
 *   can only ever narrow the configured ceiling.
 * - Calls dispatch through `ctx.tools.execute` with the exact live Agent and a branded
 *   `ToolCallId`, so DSH guards, approvals, sandbox policy and Fusion's coordinator
 *   checks stay authoritative. No tool implementation is called directly.
 * - An AbortController per call is abandoned when the HTTP request closes, the ACP turn
 *   aborts or times out, the ACP session closes or is replaced, the grant is revoked, or
 *   the bridge is disposed.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
import type { AcpMcpServerHttp } from './types.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
/** The one MCP endpoint of this Host; the route is mounted at exactly this path. */
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
    /**
     * The Host's own public origin, resolved when an ACP session is opened. It must come
     * from the running web server (`ctx.webServer.getOrigin()`), so an HTTPS bind or a
     * non-default local interface is reachable exactly as configured; there is no
     * loopback fallback, and a Host that cannot name its origin gets no bridge.
     */
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
     * longer matches the current agent, task, work order, brief, mode, route or ceiling (or
     * expired), the session must be replaced instead of reused — otherwise the Sidekick
     * silently loses its tools.
     *
     * The opposite direction matters just as much: a session that used to hold a bridge and
     * has stopped qualifying (demoted to Lead, text order, submitted report, paused task,
     * route change) must lose that grant and must not reuse the ACP session that carries it.
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
