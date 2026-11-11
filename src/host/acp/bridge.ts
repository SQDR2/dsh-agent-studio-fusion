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

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { AcpMcpServerHttp } from './types.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { json, readJson, trustedRequest } from '../http.js'
import { isRouteTransportName } from '../route-transport.js'
import { READ_TOOL_NAMES } from '../read-tools.js'

const PLUGIN_ID = 'dsh-fusion'

/** The MCP endpoint every bridge token lives under. */
export const ACP_MCP_PATH = '/api/fusion/acp-mcp'

/** How long one issued bridge token may live before it must be re-issued. */
export const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000

/** The work-order modes that may reach Host tools at all. */
export type ToolMode = 'implement' | 'explore'

/** Exactly what one live Fusion Worker ACP dispatch is, at the moment a token is bound. */
export interface AcpWorkerFacts {
  readonly dshSessionId: string
  readonly taskId: string
  readonly workOrderId: string
  readonly workOrderRevision: number
  readonly briefRevision: number
  readonly mode: ToolMode
  readonly route: { readonly provider: string; readonly model: string }
}

/** The Fusion side of the bridge: all of it reads live state, never a cached snapshot. */
export interface AcpBridgeAuthority {
  /** The live Agent this Host still holds for one DSH session, if any. */
  agentOf(dshSessionId: string): Agent | undefined
  /** This Agent's exact Fusion Worker facts, or undefined for anything that is not one. */
  workerFacts(agent: Agent): AcpWorkerFacts | undefined
  /** Tool schemas visible in this Agent's own scope. */
  schemasOf(agent: Agent): readonly ToolSchema[]
  /** Dispatch through DSH's guarded pipeline (`ctx.tools.execute`). */
  execute(input: {
    agent: Agent
    name: string
    arguments: unknown
    callId: ToolCallId
    signal: AbortSignal
  }): Promise<ToolExecutionResult>
}

export interface AcpBridgeOptions {
  /** The configured Sidekick ceiling (`workerTools`). */
  workerTools: readonly string[]
  /** Origin the ACP agent can reach, resolved when a session is opened. */
  origin: () => string
  now?: () => number
  ttlMs?: number
  /** Test seam: the token value. Production uses 32 random bytes. */
  tokenFactory?: () => string
}

/** What one ACP dispatch asks the bridge for. */
export interface AcpBridgeRequest {
  readonly sessionId?: string
  /** `compaction`/`session-title` and other auxiliary calls never get a bridge. */
  readonly purpose?: string
  readonly route: string
  readonly model: string
}

interface Grant {
  token: string
  agentId: string
  dshSessionId: string
  taskId: string
  workOrderId: string
  workOrderRevision: number
  briefRevision: number
  mode: ToolMode
  routeProvider: string
  routeModel: string
  /** The exact ceiling issued with this token; a later config change only narrows it. */
  allowedTools: readonly string[]
  expiresAt: number
  revoked: boolean
  readonly active: Set<AbortController>
}

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

function isInternalTool(name: string): boolean {
  return name.startsWith('fusion_') || isRouteTransportName(name)
}

function textContent(content: readonly unknown[] | undefined): { type: 'text'; text: string }[] {
  const out: { type: 'text'; text: string }[] = []
  for (const block of content ?? []) {
    const record = typeof block === 'object' && block !== null ? block as Record<string, unknown> : undefined
    if (record?.type === 'text' && typeof record.text === 'string') out.push({ type: 'text', text: record.text })
    else out.push({ type: 'text', text: JSON.stringify(block) })
  }
  return out
}

function failureText(result: ToolExecutionResult): string {
  if (result.isError !== true) return ''
  const content = textContent(result.content).map(block => block.text).join('\n').trim()
  if (content.length > 0) return content
  const error = result.error as { message?: unknown; code?: unknown } | undefined
  return typeof error?.message === 'string' ? error.message : String(error?.code ?? 'tool failed')
}

/**
 * The MCP server for Fusion Sidekick ACP requests, plus the grant bookkeeping that decides
 * whether one may exist at all.
 */
export class AcpToolBridge {
  private readonly grants = new Map<string, Grant>()

  constructor(private readonly authority: AcpBridgeAuthority, private readonly options: AcpBridgeOptions) {}

  /**
   * The MCP server declarations to put in one ACP `session/new`.
   *
   * Empty unless this exact request is a live Fusion Worker dispatch on this route, in a
   * mode that permits tools. Never for a Lead, an ordinary ACP route call, a discovery or
   * compaction request, or a Worker in text mode.
   */
  serversFor(request: AcpBridgeRequest): AcpMcpServerHttp[] {
    const decision = this.#decision(request)
    if (decision === undefined) return []
    const grant = this.#issue(decision.agent, decision.facts, decision.allowedTools)
    return [{
      type: 'http',
      name: 'dsh-fusion-sidekick',
      url: `${this.options.origin()}${ACP_MCP_PATH}/${grant.token}`,
      headers: [{ name: 'Authorization', value: `Bearer ${grant.token}` }],
    }]
  }

  /**
   * Whether an ACP session opened for `request` may keep being reused as it is.
   *
   * A reused ACP session never runs `session/new` again, so its bridge token is the one
   * issued earlier. When the request would now need a bridge but the existing token no
   * longer matches the current task/work order/route (or expired), the session must be
   * replaced instead of reused — otherwise the Sidekick silently loses its tools.
   */
  canReuse(request: AcpBridgeRequest): boolean {
    const decision = this.#decision(request)
    if (decision === undefined) return true
    const grant = this.#grantOfSession(decision.facts.dshSessionId)
    if (grant === undefined || grant.revoked) return false
    const now = this.options.now ?? Date.now
    if (now() > grant.expiresAt) return false
    const { facts } = decision
    if (grant.taskId !== facts.taskId) return false
    if (grant.workOrderId !== facts.workOrderId) return false
    if (grant.workOrderRevision !== facts.workOrderRevision) return false
    if (grant.mode !== facts.mode) return false
    if (grant.routeProvider !== facts.route.provider) return false
    if (grant.routeModel !== facts.route.model) return false
    const current = new Set(decision.allowedTools)
    return grant.allowedTools.every(name => current.has(name))
  }

  /** The exact authorization a request would get, or undefined when no bridge is allowed. */
  #decision(request: AcpBridgeRequest): { agent: Agent; facts: AcpWorkerFacts; allowedTools: readonly string[] } | undefined {
    if (request.sessionId === undefined || request.sessionId.length === 0) return undefined
    if (request.purpose !== undefined) return undefined
    const agent = this.authority.agentOf(request.sessionId)
    if (!agent) return undefined
    const facts = this.authority.workerFacts(agent)
    if (!facts) return undefined
    if (facts.mode !== 'implement' && facts.mode !== 'explore') return undefined
    if (facts.route.provider !== request.route) return undefined
    const allowedTools = this.allowedTools(agent, facts)
    return allowedTools.length === 0 ? undefined : { agent, facts, allowedTools }
  }

  #grantOfSession(dshSessionId: string): Grant | undefined {
    for (const grant of this.grants.values()) {
      if (grant.dshSessionId === dshSessionId) return grant
    }
    return undefined
  }

  /** Revoke every token bound to one DSH session (ACP session close or replacement). */
  revokeSession(dshSessionId: string): void {
    for (const [token, grant] of this.grants) {
      if (grant.dshSessionId === dshSessionId) this.#revoke(token, grant)
    }
  }

  /** Abort in-flight calls of one session without revoking its grant (request abort). */
  cancelInflight(dshSessionId: string): void {
    for (const grant of this.grants.values()) {
      if (grant.dshSessionId !== dshSessionId) continue
      for (const controller of grant.active) controller.abort()
      grant.active.clear()
    }
  }

  /** Revoke every grant and abort every call (plugin unload). */
  dispose(): void {
    for (const [token, grant] of this.grants) this.#revoke(token, grant)
  }

  /** The tools this exact Agent may reach right now: ceiling ∩ own scope − internals. */
  allowedTools(agent: Agent, facts: AcpWorkerFacts): readonly string[] {
    const ceiling = facts.mode === 'explore' ? READ_TOOL_NAMES : this.options.workerTools
    const visible = new Set(this.authority.schemasOf(agent).map(schema => schema.name))
    return ceiling.filter(name => visible.has(name) && !isInternalTool(name))
  }

  /**
   * The MCP Streamable HTTP endpoint. One JSON-RPC message per POST; a notification gets
   * `202`, a request gets `application/json`.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const grant = this.#grantFor(req, url)
    if (grant === undefined) {
      const body = await readJson(req).catch(() => undefined)
      return this.#writeRpc(res, undefined, body?.id as string | number | null | undefined,
        -32001, 'unauthorized: no live Fusion Sidekick bridge token')
    }
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    }
    catch (error) {
      return this.#writeRpc(res, grant, undefined, -32700, `parse error: ${String(error)}`)
    }
    const message = body as unknown as RpcRequest
    if (typeof message.method !== 'string') return this.#writeRpc(res, grant, message.id, -32600, 'invalid request')
    const id = message.id
    switch (message.method) {
      case 'initialize':
        return this.#result(res, grant, id, {
          protocolVersion: this.#protocolVersion(message.params),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: `${PLUGIN_ID}-sidekick-bridge`, version: '1' },
        })
      case 'notifications/initialized':
      case 'notifications/cancelled':
        res.writeHead(202).end()
        return
      case 'ping':
        return this.#result(res, grant, id, {})
      case 'tools/list':
        return this.#toolsList(res, grant, id)
      case 'tools/call':
        return this.#toolsCall(req, res, grant, id, message.params)
      default:
        return this.#writeRpc(res, grant, id, -32601, `method not found: ${message.method}`)
    }
  }

  #protocolVersion(params: unknown): string {
    const requested = typeof params === 'object' && params !== null ? (params as Record<string, unknown>).protocolVersion : undefined
    return typeof requested === 'string' && requested.length > 0 ? requested : '2024-11-05'
  }

  #issue(agent: Agent, facts: AcpWorkerFacts, allowedTools: readonly string[]): Grant {
    // One live ACP session holds exactly one bridge; re-opening it replaces the grant.
    this.revokeSession(facts.dshSessionId)
    const token = (this.options.tokenFactory ?? (() => randomBytes(32).toString('base64url')))()
    const now = this.options.now ?? Date.now
    const grant: Grant = {
      token,
      agentId: agent.id,
      dshSessionId: facts.dshSessionId,
      taskId: facts.taskId,
      workOrderId: facts.workOrderId,
      workOrderRevision: facts.workOrderRevision,
      briefRevision: facts.briefRevision,
      mode: facts.mode,
      routeProvider: facts.route.provider,
      routeModel: facts.route.model,
      allowedTools: [...allowedTools],
      expiresAt: now() + (this.options.ttlMs ?? DEFAULT_TOKEN_TTL_MS),
      revoked: false,
      active: new Set(),
    }
    this.grants.set(token, grant)
    return grant
  }

  #revoke(token: string, grant: Grant): void {
    grant.revoked = true
    for (const controller of grant.active) controller.abort()
    grant.active.clear()
    this.grants.delete(token)
  }

  #grantFor(req: IncomingMessage, url: URL): Grant | undefined {
    const header = req.headers.authorization
    const fromHeader = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined
    const fromPath = decodeURIComponent(url.pathname.slice(ACP_MCP_PATH.length).replace(/^\//, ''))
    const token = fromHeader !== undefined && fromHeader.length > 0 ? fromHeader : fromPath
    if (token.length === 0) return undefined
    const grant = this.grants.get(token)
    if (grant === undefined) return undefined
    // A header token and a path token must name the same grant, never widen it.
    if (fromHeader !== undefined && fromHeader.length > 0 && fromPath.length > 0 && fromPath !== fromHeader) return undefined
    if (grant.revoked) return undefined
    const now = this.options.now ?? Date.now
    if (now() > grant.expiresAt) {
      this.#revoke(token, grant)
      return undefined
    }
    return grant
  }

  /** Re-resolve the Agent and every bound fact; a mismatch revokes the grant. */
  #live(grant: Grant): { agent: Agent; facts: AcpWorkerFacts } | undefined {
    const agent = this.authority.agentOf(grant.dshSessionId)
    if (!agent || agent.id !== grant.agentId) return this.#stale(grant)
    const facts = this.authority.workerFacts(agent)
    if (!facts) return this.#stale(grant)
    if (facts.dshSessionId !== grant.dshSessionId) return this.#stale(grant)
    if (facts.taskId !== grant.taskId) return this.#stale(grant)
    if (facts.workOrderId !== grant.workOrderId) return this.#stale(grant)
    if (facts.workOrderRevision !== grant.workOrderRevision) return this.#stale(grant)
    if (facts.mode !== grant.mode) return this.#stale(grant)
    if (facts.route.provider !== grant.routeProvider) return this.#stale(grant)
    if (facts.route.model !== grant.routeModel) return this.#stale(grant)
    return { agent, facts }
  }

  #stale(grant: Grant): undefined {
    this.#revoke(grant.token, grant)
    return undefined
  }

  /** What this grant may still reach: its issued ceiling, narrowed by the live ceiling. */
  #ceiling(grant: Grant, agent: Agent, facts: AcpWorkerFacts): readonly string[] {
    const current = new Set(this.allowedTools(agent, facts))
    return grant.allowedTools.filter(name => current.has(name))
  }

  #toolsList(res: ServerResponse, grant: Grant, id: string | number | null | undefined): void {
    const live = this.#live(grant)
    if (live === undefined) return this.#writeRpc(res, grant, id, -32001, 'unauthorized: the Fusion Sidekick session is no longer live')
    const allowed = new Set(this.#ceiling(grant, live.agent, live.facts))
    const tools = this.authority.schemasOf(live.agent)
      .filter(schema => allowed.has(schema.name))
      .map(schema => ({ name: schema.name, description: schema.description, inputSchema: schema.parameters }))
    this.#result(res, grant, id, { tools })
  }

  async #toolsCall(req: IncomingMessage, res: ServerResponse, grant: Grant, id: string | number | null | undefined, params: unknown): Promise<void> {
    const live = this.#live(grant)
    if (live === undefined) return this.#writeRpc(res, grant, id, -32001, 'unauthorized: the Fusion Sidekick session is no longer live')
    const record = typeof params === 'object' && params !== null ? params as Record<string, unknown> : undefined
    const name = typeof record?.name === 'string' ? record.name : ''
    const arguments_ = record?.arguments
    const allowed = this.#ceiling(grant, live.agent, live.facts)
    if (!allowed.includes(name)) {
      return this.#result(res, grant, id, {
        content: [{ type: 'text', text: `${name || '(missing name)'} is outside the Sidekick's configured tools (${allowed.join(', ') || 'none'})` }],
        isError: true,
      })
    }
    // Required cancellation for every dispatched call: the HTTP request closing, this ACP
    // turn aborting, or the grant being revoked all abort it.
    const controller = new AbortController()
    const onClose = (): void => controller.abort()
    res.once('close', onClose)
    grant.active.add(controller)
    try {
      const result = await this.authority.execute({
        agent: live.agent,
        name,
        arguments: arguments_,
        callId: ToolCallId(randomUUID()),
        signal: controller.signal,
      })
      if (res.writableEnded) return
      const failed = result.isError === true
      this.#result(res, grant, id, {
        content: failed ? [{ type: 'text', text: failureText(result) }] : textContent(result.content),
        ...(failed ? { isError: true } : {}),
      })
    }
    catch (error) {
      if (!res.writableEnded) this.#result(res, grant, id, {
        content: [{ type: 'text', text: `${name} failed: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      })
    }
    finally {
      res.off('close', onClose)
      grant.active.delete(controller)
    }
  }

  #result(res: ServerResponse, grant: Grant, id: string | number | null | undefined, result: unknown): void {
    this.#writeRpc(res, grant, id, undefined, undefined, result)
  }

  #writeRpc(res: ServerResponse, _grant: Grant | undefined, id: string | number | null | undefined,
    code?: number, message?: string, result?: unknown): void {
    if (res.writableEnded) return
    if (id === undefined || id === null) {
      // A request without an id is a notification: nothing to answer.
      res.writeHead(202).end()
      return
    }
    if (code !== undefined) json(res, 200, { jsonrpc: '2.0', id, error: { code, message: message ?? 'error' } })
    else json(res, 200, { jsonrpc: '2.0', id, result })
  }
}
