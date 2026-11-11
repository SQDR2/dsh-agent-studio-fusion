import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { AcpToolBridge, ACP_MCP_PATH, type AcpBridgeAuthority, type AcpWorkerFacts } from '../src/host/acp/bridge.js'
import { AcpAdapter, type AcpBridgeMount } from '../src/host/acp/adapter.js'
import { AcpAgentProcess } from '../src/host/acp/agent-process.js'
import type { AcpHost } from '../src/host/acp/host.js'
import type { AcpAgentProfile } from '../src/host/acp/types.js'

const SESSION = 'session-worker-1'
const TASK = 'task-1'
const ORDER = 'order-1'

function agentOf(id: string): Agent {
  return {
    id,
    session: { header: { cwd: tmpdir(), parentSession: 'session-lead-1' } },
  } as unknown as Agent
}

function factsFor(mode: 'implement' | 'explore' = 'implement', route = 'devin'): AcpWorkerFacts {
  return {
    dshSessionId: SESSION,
    taskId: TASK,
    workOrderId: ORDER,
    workOrderRevision: 1,
    briefRevision: 0,
    mode,
    route: { provider: route, model: 'default' },
  }
}

interface HarnessOptions {
  workerTools?: readonly string[]
  schemas?: readonly ToolSchema[]
  origin?: string
  execute?: (input: { agent: Agent; name: string; arguments: unknown; callId: unknown; signal: AbortSignal }) => Promise<ToolExecutionResult>
}

/** Production bridge over an authority whose Fusion facts each test controls. */
function harness(options: HarnessOptions = {}) {
  const agents = new Map<string, Agent>()
  const role = { current: 'worker' as 'worker' | 'lead' }
  const facts = { current: factsFor() as AcpWorkerFacts | undefined }
  const calls: { agent: Agent; name: string; arguments: unknown; callId: unknown; signal: AbortSignal }[] = []
  const schemas: ToolSchema[] = [...(options.schemas ?? [
    { name: 'read', description: 'read a file', parameters: { type: 'object' } },
    { name: 'bash', description: 'run a command', parameters: { type: 'object' } },
    { name: 'fusion_submit_result', description: 'internal', parameters: { type: 'object' } },
    { name: 'agy_tool', description: 'transport', parameters: { type: 'object' } },
  ])]
  const authority: AcpBridgeAuthority = {
    agentOf: id => agents.get(id),
    workerFacts: () => role.current === 'worker' ? facts.current : undefined,
    schemasOf: () => schemas,
    execute: async (input) => {
      calls.push(input)
      if (options.execute) return options.execute(input)
      return { isError: false, value: null, content: [{ type: 'text', text: 'done' }] } as unknown as ToolExecutionResult
    },
  }
  const bridge = new AcpToolBridge(authority, {
    workerTools: options.workerTools ?? ['read', 'bash'],
    origin: () => options.origin ?? 'http://127.0.0.1:4123',
    tokenFactory: () => `token-${SESSION}`,
  })
  agents.set(SESSION, agentOf(SESSION))
  return { bridge, authority, agents, role, facts, calls, schemas }
}

class FakeResponse extends EventEmitter {
  status = 0
  payload = ''
  done = false

  writeHead(status: number, headers?: Record<string, string>): this {
    this.status = status
    if (headers) for (const [key, value] of Object.entries(headers)) void key, value
    return this
  }

  setHeader(): this {
    return this
  }

  end(body?: string): this {
    if (body !== undefined) this.payload += body
    this.done = true
    return this
  }
}

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${label}`)
}

interface RequestOverrides {
  url?: string
  /** The `Host` header the client addressed. Defaults to the harness loopback origin. */
  host?: string
  origin?: string
  remoteAddress?: string
  secFetchSite?: string
}

async function rpc(bridge: AcpToolBridge, token: string | undefined, method: string, params?: unknown,
  id: number | string | null = 1, overrides: RequestOverrides = {}) {
  const res = new FakeResponse()
  await bridge.handle(fakeRequest(token, { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }, overrides), res as unknown as ServerResponse)
  return { status: res.status, body: res.payload.length > 0 ? JSON.parse(res.payload) as Record<string, unknown> : undefined }
}

/**
 * One streamable-HTTP POST. The capability travels only in the Authorization header, so a
 * test that wants to prove a URL token is not authentication passes it in `url` instead.
 */
function fakeRequest(token: string | undefined, body: unknown, overrides: RequestOverrides = {}): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage & { [Symbol.asyncIterator]: () => AsyncGenerator<Buffer> }
  req.method = 'POST'
  req.url = overrides.url ?? ACP_MCP_PATH
  req.headers = {
    host: overrides.host ?? '127.0.0.1:4123',
    'content-type': 'application/json',
    ...(overrides.origin === undefined ? {} : { origin: overrides.origin }),
    ...(overrides.secFetchSite === undefined ? {} : { 'sec-fetch-site': overrides.secFetchSite }),
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  }
  ;(req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' }
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(body))
  }
  return req
}

/** The tool names an authorized `tools/list` returned, or undefined when it was refused. */
async function listedTools(bridge: AcpToolBridge, token: string | undefined, overrides: RequestOverrides = {}): Promise<string[] | undefined> {
  const response = await rpc(bridge, token, 'tools/list', undefined, 1, overrides)
  const result = response.body?.result as { tools?: { name: string }[] } | undefined
  return result?.tools?.map(tool => tool.name)
}

function profile(log: string, env: Record<string, string> = {}, extra: Partial<AcpAgentProfile> = {}): AcpAgentProfile {
  return {
    command: process.execPath,
    args: [join(import.meta.dirname, 'fixtures', 'mock-acp-agent.mjs')],
    env: { ACP_MCP_LOG: log, ...env },
    models: [],
    discoverModels: false,
    permission: 'read-only',
    imageInput: 'off',
    systemPrompt: 'drop',
    showToolCalls: false,
    contextWindow: 1000,
    startupTimeoutMs: 20_000,
    idleTimeoutMs: 20_000,
    ...extra,
  }
}

function hostFor(): AcpHost {
  return {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    agentOf: id => id === SESSION ? agentOf(SESSION) as unknown as ReturnType<AcpHost['agentOf']> : undefined,
    approve: undefined,
    readImage: undefined,
  }
}

async function runAdapter(adapter: AcpAdapter, sessionId: string | undefined, extra: Partial<GenerateOptions> = {}): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  const controller = new AbortController()
  const options = {
    provider: 'devin',
    model: 'default',
    sessionId: sessionId as GenerateOptions['sessionId'],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    signal: controller.signal,
    ...extra,
  } as GenerateOptions
  for await (const chunk of adapter.stream(options)) chunks.push(chunk)
  return chunks
}

/** What the mock ACP agent saw in each `session/new`. */
function sessionNews(log: string): { mcpServers: { type?: string; name?: string; url?: string; headers?: { name: string; value: string }[] }[] }[] {
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { mcpServers: [] })
}

describe('ACP Sidekick MCP bridge — declaration gating', () => {
  it('gives a live Fusion Worker ACP session exactly one bridge server at the exact endpoint', () => {
    const h = harness()
    const servers = h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    expect(servers).toHaveLength(1)
    expect(servers[0]!.type).toBe('http')
    // The URL is the Host's origin plus the fixed path: the capability is never in it.
    expect(servers[0]!.url).toBe(`http://127.0.0.1:4123${ACP_MCP_PATH}`)
    expect(servers[0]!.url).not.toContain('token')
    expect(servers[0]!.headers).toEqual([{ name: 'Authorization', value: `Bearer token-${SESSION}` }])
  })

  it('uses the Host origin as configured, without a loopback fallback', () => {
    // A non-default concrete bind behind TLS: the declaration must follow the Host, not a guess.
    const h = harness({ origin: 'https://198.51.100.7:8443/' })
    const servers = h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    expect(servers[0]!.url).toBe(`https://198.51.100.7:8443${ACP_MCP_PATH}`)
  })

  it('issues no bridge at all when the Host cannot name its origin', () => {
    const h = harness({ origin: '' })
    expect(() => h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toThrow(/no origin/)
    // Nothing was issued, so there is nothing to reuse either.
    expect(h.bridge.canReuse({ sessionId: SESSION, route: 'devin', model: 'default' })).toBe(false)
  })

  it('gives a Lead ACP session no bridge', () => {
    const h = harness()
    h.role.current = 'lead'
    expect(h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toEqual([])
  })

  it('gives a non-Fusion or unknown ACP session no bridge', () => {
    const h = harness()
    expect(h.bridge.serversFor({ sessionId: 'session-somebody-else', route: 'devin', model: 'default' })).toEqual([])
    expect(h.bridge.serversFor({ sessionId: undefined, route: 'devin', model: 'default' })).toEqual([])
  })

  it('gives facts that describe another DSH session no bridge', () => {
    const h = harness()
    h.facts.current = { ...factsFor(), dshSessionId: 'session-worker-2' }
    expect(h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toEqual([])
  })

  it('gives a discovery or compaction request no bridge', () => {
    const h = harness()
    expect(h.bridge.serversFor({ sessionId: SESSION, purpose: 'compaction', route: 'devin', model: 'default' })).toEqual([])
    expect(h.bridge.serversFor({ sessionId: SESSION, purpose: 'session-title', route: 'devin', model: 'default' })).toEqual([])
  })

  it('gives a text work order no bridge (its facts are absent)', () => {
    const h = harness()
    h.facts.current = undefined
    expect(h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toEqual([])
  })

  it('refuses a Worker whose selected route is not this ACP route', () => {
    const h = harness()
    h.facts.current = factsFor('implement', 'openai-completions')
    expect(h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toEqual([])
  })

  it('refuses a request for another model on the same ACP route', () => {
    const h = harness()
    h.facts.current = { ...factsFor(), route: { provider: 'devin', model: 'default' } }
    expect(h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'another-model' })).toEqual([])
  })

  it('exposes only the configured ceiling, never Fusion internals or route transports', () => {
    const h = harness({ workerTools: ['read', 'fusion_submit_result', 'agy_tool', 'write'] })
    expect(h.bridge.allowedTools(h.agents.get(SESSION)!, factsFor())).toEqual(['read'])
  })

  it('reuses a session only while its issued token still matches the work order', () => {
    const h = harness()
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    // No bridge needed and none issued (Lead) => nothing to refresh, so reuse is fine.
    h.role.current = 'lead'
    expect(h.bridge.canReuse(request)).toBe(true)
    h.role.current = 'worker'
    // A bridge is now required but none was issued for this session.
    expect(h.bridge.canReuse(request)).toBe(false)
    h.bridge.serversFor(request)
    expect(h.bridge.canReuse(request)).toBe(true)
    // A new work order invalidates the reused session's token.
    h.facts.current = { ...factsFor(), workOrderId: 'order-2', workOrderRevision: 2 }
    expect(h.bridge.canReuse(request)).toBe(false)
  })

  it('revokes a former bridge and refuses reuse when the session stops qualifying', async () => {
    const h = harness()
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    h.bridge.serversFor(request)
    expect(await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).toMatchObject({ status: 200 })
    // The Worker's order became a text order (or its task was gated): no facts at all.
    h.facts.current = undefined
    // The ACP session is not reused, and the capability it carried is gone.
    expect(h.bridge.canReuse(request)).toBe(false)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    // The replacement session opens with no MCP server, and nothing is left to revoke.
    expect(h.bridge.serversFor(request)).toEqual([])
    expect(h.bridge.canReuse(request)).toBe(true)
  })

  it('revokes a former bridge when the Worker is demoted to Lead', async () => {
    const h = harness()
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    h.bridge.serversFor(request)
    h.role.current = 'lead'
    expect(h.bridge.canReuse(request)).toBe(false)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('never lets an auxiliary request revoke the live session’s grant', async () => {
    const h = harness()
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    h.bridge.serversFor(request)
    // Compaction borrows the Worker's session id while the Sidekick keeps running.
    expect(h.bridge.serversFor({ ...request, purpose: 'compaction' })).toEqual([])
    expect(h.bridge.canReuse({ ...request, purpose: 'compaction' })).toBe(true)
    expect(h.bridge.canReuse(request)).toBe(true)
    expect(await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).toMatchObject({ status: 200 })
  })

  it('refuses to reuse a session whose brief moved on, and revokes the grant', async () => {
    const h = harness()
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    h.bridge.serversFor(request)
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    h.facts.current = { ...factsFor(), briefRevision: 1 }
    expect(h.bridge.canReuse(request)).toBe(false)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('refuses to reuse a session whose route model no longer matches the request', async () => {
    const h = harness()
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    h.bridge.serversFor(request)
    // The Worker was moved to another model on the same route: the grant describes the old
    // model, so the ACP session must be replaced rather than reused.
    h.facts.current = { ...factsFor(), route: { provider: 'devin', model: 'other-model' } }
    expect(h.bridge.canReuse(request)).toBe(false)
    // Brought back in step with the request, a fresh grant is issued again.
    expect(h.bridge.canReuse({ ...request, model: 'other-model' })).toBe(false)
    expect(h.bridge.serversFor({ ...request, model: 'other-model' })).toHaveLength(1)
    expect(h.bridge.canReuse({ ...request, model: 'other-model' })).toBe(true)
  })

  it('refuses to reuse a session whose grant was issued for another agent', () => {
    const h = harness()
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    h.bridge.serversFor(request)
    // The same DSH session id answering with a different Agent object: the grant is not
    // transferable, so the ACP session must be replaced rather than reused.
    h.agents.set(SESSION, { ...agentOf(SESSION), id: 'session-worker-replaced' } as unknown as Agent)
    expect(h.bridge.canReuse(request)).toBe(false)
  })

  it('narrows an explore order to its read-only tools', () => {
    const h = harness({ workerTools: ['read', 'bash', 'write'] })
    expect(h.bridge.allowedTools(h.agents.get(SESSION)!, factsFor('explore'))).toEqual(['read'])
  })

  it('never widens the configured ceiling for an explore order', () => {
    // `read` is visible and read-only, but the user did not grant it to the Sidekick.
    const h = harness({ workerTools: ['bash'] })
    expect(h.bridge.allowedTools(h.agents.get(SESSION)!, factsFor('explore'))).toEqual([])
    expect(h.bridge.allowedTools(h.agents.get(SESSION)!, factsFor('implement'))).toEqual(['bash'])
    h.facts.current = factsFor('explore')
    expect(h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toEqual([])
  })
})

describe('ACP Sidekick MCP bridge — MCP endpoint', () => {
  it('authenticates with the issued token and lists exactly the allowed tools', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const listed = await rpc(h.bridge, `token-${SESSION}`, 'tools/list')
    expect(listed.status).toBe(200)
    const tools = (listed.body!.result as { tools: { name: string; inputSchema: unknown }[] }).tools
    expect(tools.map(tool => tool.name)).toEqual(['read', 'bash'])
    expect(tools[0]!.inputSchema).toEqual({ type: 'object' })
  })

  it('refuses a forged token', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const response = await rpc(h.bridge, 'forged-token', 'tools/list')
    expect(response.body!.error).toMatchObject({ code: -32001 })
  })

  it('accepts a request addressed to a configured non-loopback local interface', async () => {
    // The Host is bound to a concrete interface, so the declaration advertises that address
    // and its own local clients must be served — while nothing else is.
    const h = harness({ origin: 'http://192.0.2.10:4000' })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const listed = await rpc(h.bridge, `token-${SESSION}`, 'tools/list',
      undefined, 1, { host: '192.0.2.10:4000', remoteAddress: '192.0.2.10' })
    expect(listed.status).toBe(200)
    expect((listed.body!.result as { tools: { name: string }[] }).tools.map(tool => tool.name)).toEqual(['read', 'bash'])
    // The same request with the configured Origin header present is still accepted.
    expect(await listedTools(h.bridge, `token-${SESSION}`,
      { host: '192.0.2.10:4000', remoteAddress: '192.0.2.10', origin: 'http://192.0.2.10:4000' })).toEqual(['read', 'bash'])
  })

  it('refuses a request whose peer is not this machine', async () => {
    const h = harness({ origin: 'http://192.0.2.10:4000' })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const response = await rpc(h.bridge, `token-${SESSION}`, 'tools/list',
      undefined, 1, { host: '192.0.2.10:4000', remoteAddress: '203.0.113.9' })
    expect(response.status).toBe(403)
    expect(h.calls).toHaveLength(0)
  })

  it('refuses a request addressed to another Host authority or a foreign Origin', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    // A valid token does not help a request that was not addressed to this Host.
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list', undefined, 1, { host: 'evil.example:4123' })).status).toBe(403)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list', undefined, 1, { origin: 'http://evil.example' })).status).toBe(403)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list', undefined, 1, { secFetchSite: 'cross-site' })).status).toBe(403)
  })

  it('accepts an IPv4-mapped loopback peer and refuses a missing Host header', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    expect(await listedTools(h.bridge, `token-${SESSION}`, { remoteAddress: '::ffff:127.0.0.1' })).toEqual(['read', 'bash'])
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list', undefined, 1, { host: '' })).status).toBe(403)
  })

  it('requires the bearer header: a request without one is unauthorized', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const response = await rpc(h.bridge, undefined, 'tools/list')
    expect(response.body!.error).toMatchObject({ code: -32001 })
  })

  it('does not accept a token carried in the URL path', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    // The old capability shape: the token as a path segment. It is not an endpoint.
    const response = await rpc(h.bridge, undefined, 'tools/list', undefined, 1, { url: `${ACP_MCP_PATH}/token-${SESSION}` })
    expect(response.status).toBe(404)
    expect(h.calls).toHaveLength(0)
  })

  it('does not accept a token carried in the query string', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const response = await rpc(h.bridge, undefined, 'tools/list', undefined, 1, { url: `${ACP_MCP_PATH}?token=token-${SESSION}` })
    expect(response.body!.error).toMatchObject({ code: -32001 })
  })

  it('refuses a malformed or suffix target without throwing', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list', undefined, 1, { url: `${ACP_MCP_PATH}x` })).status).toBe(404)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list', undefined, 1, { url: `${ACP_MCP_PATH}/%zz` })).status).toBe(404)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list', undefined, 1, { url: '/elsewhere' })).status).toBe(404)
  })

  it('refuses an expired token, refuses to reuse its session, and drops the grant', async () => {
    const now = { value: 1_000 }
    const h = harness()
    const bridge = new AcpToolBridge(h.authority, {
      workerTools: ['read', 'bash'],
      origin: () => 'http://127.0.0.1:4123',
      now: () => now.value,
      ttlMs: 50,
      // Deterministic token, so the endpoint check really exercises expiry — not a guess.
      tokenFactory: () => `token-${SESSION}`,
    })
    const request = { sessionId: SESSION, route: 'devin', model: 'default' }
    bridge.serversFor(request)
    // Before the deadline the very same token is authorized.
    expect(await listedTools(bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    expect(bridge.canReuse(request)).toBe(true)
    now.value += 100
    expect(bridge.canReuse(request)).toBe(false)
    expect((await rpc(bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('refuses a token whose task or work order changed, and revokes it', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    h.facts.current = { ...factsFor(), workOrderId: 'order-2', workOrderRevision: 2 }
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    // Revoked: even after the facts move back, the token stays dead.
    h.facts.current = factsFor()
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('refuses a token issued under an older brief revision, and revokes it', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    // The Lead's feedback moved the brief on: the old grant described the old brief.
    h.facts.current = { ...factsFor(), briefRevision: 1 }
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    expect(h.bridge.canReuse({ sessionId: SESSION, route: 'devin', model: 'default' })).toBe(false)
  })

  it('narrows the token to a ceiling that shrank after issuance', async () => {
    const h = harness({ workerTools: ['read', 'bash'] })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    h.schemas.splice(h.schemas.findIndex(schema => schema.name === 'bash'), 1)
    const listed = await rpc(h.bridge, `token-${SESSION}`, 'tools/list')
    expect((listed.body!.result as { tools: { name: string }[] }).tools.map(tool => tool.name)).toEqual(['read'])
    const denied = await rpc(h.bridge, `token-${SESSION}`, 'tools/call', { name: 'bash', arguments: {} })
    expect(denied.body!.result).toMatchObject({ isError: true })
    expect(h.calls).toHaveLength(0)
  })

  it('refuses a token when the Worker route model changed', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    h.facts.current = { ...factsFor(), route: { provider: 'devin', model: 'another-model' } }
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('refuses a token when the Agent is gone', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    h.agents.delete(SESSION)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('refuses a token when the Agent stops being this task’s Worker', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    h.role.current = 'lead'
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('revokes access when the ACP session closes', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).status).toBe(200)
    h.bridge.revokeSession(SESSION)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('dispatches an allowed call through execute with the exact Agent and a branded call id', async () => {
    const h = harness()
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const called = await rpc(h.bridge, `token-${SESSION}`, 'tools/call', { name: 'read', arguments: { path: 'a.ts' } })
    expect(called.body!.result).toEqual({ content: [{ type: 'text', text: 'done' }] })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]!.agent).toBe(h.agents.get(SESSION))
    expect(h.calls[0]!.name).toBe('read')
    expect(h.calls[0]!.arguments).toEqual({ path: 'a.ts' })
    expect(typeof h.calls[0]!.callId).toBe('string')
    expect(h.calls[0]!.signal.aborted).toBe(false)
  })

  it('refuses a tool outside the configured ceiling without dispatching it', async () => {
    const h = harness({ workerTools: ['read'] })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const denied = await rpc(h.bridge, `token-${SESSION}`, 'tools/call', { name: 'bash', arguments: {} })
    expect(denied.body!.result).toMatchObject({ isError: true })
    expect((denied.body!.result as { content: { text: string }[] }).content[0]!.text).toContain('outside the Sidekick')
    expect(h.calls).toHaveLength(0)
  })

  it('refuses a Fusion internal tool even if the caller names it', async () => {
    const h = harness({ workerTools: ['read', 'fusion_submit_result'] })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const denied = await rpc(h.bridge, `token-${SESSION}`, 'tools/call', { name: 'fusion_submit_result', arguments: {} })
    expect(denied.body!.result).toMatchObject({ isError: true })
    expect(h.calls).toHaveLength(0)
  })

  it('propagates a DSH guard or approval denial as a failed tool result', async () => {
    const h = harness({
      execute: async () => ({
        isError: true,
        error: { name: 'ToolDenied', code: 'DENIED', message: 'denied by approval policy' },
        content: [{ type: 'text', text: 'denied by approval policy' }],
      }) as unknown as ToolExecutionResult,
    })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const denied = await rpc(h.bridge, `token-${SESSION}`, 'tools/call', { name: 'read', arguments: {} })
    expect(denied.body!.result).toMatchObject({ isError: true })
    expect((denied.body!.result as { content: { text: string }[] }).content[0]!.text).toContain('denied by approval policy')
  })

  it('aborts an in-flight call when the HTTP request closes', async () => {
    let seen: AbortSignal | undefined
    const h = harness({
      execute: input => new Promise<ToolExecutionResult>((resolve) => {
        seen = input.signal
        input.signal.addEventListener('abort', () => resolve({
          isError: true,
          error: { name: 'Aborted', code: 'ABORTED', message: 'aborted' },
          content: [{ type: 'text', text: 'aborted' }],
        } as unknown as ToolExecutionResult), { once: true })
      }),
    })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const res = new FakeResponse()
    const pending = h.bridge.handle(fakeRequest(`token-${SESSION}`, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read', arguments: {} },
    }), res as unknown as ServerResponse)
    // The bridge attaches its abort listener when the call starts; closing the response then
    // aborts that exact call.
    await until(() => seen !== undefined, 'the tool dispatch to start')
    res.emit('close')
    await pending
    expect(seen?.aborted).toBe(true)
  })

  it('aborts in-flight calls without revoking the grant on an ACP turn abort', async () => {
    let seen: AbortSignal | undefined
    const h = harness({
      execute: input => new Promise<ToolExecutionResult>((resolve) => {
        seen = input.signal
        input.signal.addEventListener('abort', () => resolve({
          isError: true,
          error: { name: 'Aborted', code: 'ABORTED', message: 'aborted' },
          content: [{ type: 'text', text: 'aborted' }],
        } as unknown as ToolExecutionResult), { once: true })
      }),
    })
    h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    const res = new FakeResponse()
    const pending = h.bridge.handle(fakeRequest(`token-${SESSION}`, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read', arguments: {} },
    }), res as unknown as ServerResponse)
    await until(() => seen !== undefined, 'the tool dispatch to start')
    h.bridge.cancelInflight(SESSION)
    await pending
    expect(seen?.aborted).toBe(true)
    // The session keeps its token: later turns still need it.
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).status).toBe(200)
  })
})

describe('ACP adapter — real session/new carries the bridge only for a Sidekick', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acp-bridge-'))
  let counter = 0
  const logPath = (): string => join(dir, `mcp-${++counter}.jsonl`)

  function adapterWith(h: ReturnType<typeof harness>, log: string, env: Record<string, string> = {}): AcpAdapter {
    const bridge: AcpBridgeMount = h.bridge
    return new AcpAdapter(hostFor(), () => new Map([['devin', profile(log, env)]]), undefined, undefined, bridge)
  }

  it('attaches the bridge on session/new for a live Fusion Worker', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    const chunks = await runAdapter(adapter, SESSION)
    adapter.dispose()
    expect(chunks.some(chunk => chunk.type === 'text-delta')).toBe(true)
    const news = sessionNews(log)
    expect(news).toHaveLength(1)
    expect(news[0]!.mcpServers).toHaveLength(1)
    expect(news[0]!.mcpServers[0]!.type).toBe('http')
    // The fixed endpoint plus the Host origin: the token is in the header, never the URL.
    expect(news[0]!.mcpServers[0]!.url).toBe('http://127.0.0.1:4123/api/fusion/acp-mcp')
    expect(news[0]!.mcpServers[0]!.headers).toEqual([{ name: 'Authorization', value: `Bearer token-${SESSION}` }])
  })

  it('attaches nothing for a Lead ACP session', async () => {
    const h = harness()
    h.role.current = 'lead'
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    adapter.dispose()
    expect(sessionNews(log)[0]!.mcpServers).toEqual([])
  })

  it('attaches nothing for an ordinary ACP session that is not a Fusion Worker', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, 'session-plain-user')
    adapter.dispose()
    expect(sessionNews(log)[0]!.mcpServers).toEqual([])
  })

  it('attaches nothing for a compaction request', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION, { purpose: 'compaction' } as Partial<GenerateOptions>)
    adapter.dispose()
    expect(sessionNews(log)[0]!.mcpServers).toEqual([])
  })

  it('reuses the ACP session while the same work order stays current', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    await runAdapter(adapter, SESSION)
    adapter.dispose()
    expect(sessionNews(log)).toHaveLength(1)
  })

  it('replaces the ACP session when a new work order starts', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    h.facts.current = { ...factsFor(), workOrderId: 'order-2', workOrderRevision: 2 }
    await runAdapter(adapter, SESSION)
    adapter.dispose()
    const news = sessionNews(log)
    expect(news).toHaveLength(2)
    expect(news[1]!.mcpServers).toHaveLength(1)
  })

  it('revokes the bridge on a cancelled turn and re-issues it on the next one', async () => {
    const h = harness()
    const log = logPath()
    const revokes: string[] = []
    const mount: AcpBridgeMount = {
      serversFor: request => h.bridge.serversFor(request),
      revokeSession: (id) => { revokes.push(id); h.bridge.revokeSession(id) },
      cancelInflight: id => h.bridge.cancelInflight(id),
    }
    const adapter = new AcpAdapter(hostFor(), () => new Map([['devin', profile(log, { ACP_PROMPT_DELAY_MS: '150' })]]), undefined, undefined, mount)
    const controller = new AbortController()
    const consume = (async () => {
      for await (const _chunk of adapter.stream({
        provider: 'devin', model: 'default', sessionId: SESSION as GenerateOptions['sessionId'],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], signal: controller.signal,
      } as GenerateOptions)) { /* drain */ }
    })().catch(() => {})
    await until(() => sessionNews(log).length === 1, 'the first session/new')
    controller.abort()
    await consume
    expect(revokes).toContain(SESSION)
    // The next turn opens a fresh ACP session and gets a fresh grant.
    await runAdapter(adapter, SESSION)
    adapter.dispose()
    expect(sessionNews(log)).toHaveLength(2)
    expect(sessionNews(log)[1]!.mcpServers).toHaveLength(1)
  })

  it('revokes and re-issues the session bridge when the ACP session is replaced', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    // A second turn under a new brief revision is still authorized, but the old ACP
    // session's grant no longer describes it: replaced, and the new one carries a grant.
    h.facts.current = { ...factsFor(), briefRevision: 1 }
    await runAdapter(adapter, SESSION)
    adapter.dispose()
    const news = sessionNews(log)
    expect(news).toHaveLength(2)
    for (const entry of news) expect(entry.mcpServers).toHaveLength(1)
  })

  it('opens the next ACP session with no MCP server once the session stops qualifying', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).status).toBe(200)
    // The Worker is demoted (or its order became text, or its task was gated): no facts.
    h.role.current = 'lead'
    await runAdapter(adapter, SESSION)
    const news = sessionNews(log)
    expect(news).toHaveLength(2)
    expect(news[0]!.mcpServers).toHaveLength(1)
    // The replacement session is opened without any Host-tool bridge.
    expect(news[1]!.mcpServers).toEqual([])
    // And the capability the old session carried is dead.
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    adapter.dispose()
  })

  it('revokes the bridge when session setup fails after the declaration', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log, { ACP_FAIL_NEW_SESSION: '1' })
    const chunks = await runAdapter(adapter, SESSION)
    adapter.dispose()
    // The agent saw the declaration, then refused the session: the client must revoke it.
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
    expect(sessionNews(log)).toHaveLength(1)
    expect(sessionNews(log)[0]!.mcpServers).toHaveLength(1)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('revokes the bridge when the turn times out', async () => {
    const h = harness()
    const log = logPath()
    const adapter = new AcpAdapter(hostFor(),
      () => new Map([['devin', profile(log, { ACP_PROMPT_DELAY_MS: '5000' }, { idleTimeoutMs: 100 })]]),
      undefined, undefined, h.bridge)
    const chunks = await runAdapter(adapter, SESSION)
    expect(JSON.stringify(chunks.at(-1))).toContain('TIMEOUT')
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    adapter.dispose()
  })

  it('revokes the bridge when the consumer stops iterating early', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log, { ACP_PROMPT_DELAY_MS: '30' })
    const controller = new AbortController()
    const stream = adapter.stream({
      provider: 'devin', model: 'default', sessionId: SESSION as GenerateOptions['sessionId'],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], signal: controller.signal,
    } as GenerateOptions)
    // Stop after the first chunk: the turn never finishes, so its capability must go.
    for await (const _chunk of stream) break
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    adapter.dispose()
  })

  it('never revokes a live Worker capability from a failed auxiliary session setup', async () => {
    const h = harness()
    const workerLog = logPath(), compactionLog = logPath()
    const compact = profile(compactionLog, { ACP_FAIL_NEW_SESSION: '1' })
    const adapter = new AcpAdapter(hostFor(),
      () => new Map([['devin', profile(workerLog)], ['compact', compact]]), undefined, undefined, h.bridge)
    await runAdapter(adapter, SESSION)
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    // A compaction request borrows the Worker's DSH session id; its own setup fails.
    const chunks = await runAdapter(adapter, SESSION, { provider: 'compact', purpose: 'compaction' } as Partial<GenerateOptions>)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
    // The Worker's capability is untouched: it still lists (and may call) its real tools.
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    const called = await rpc(h.bridge, `token-${SESSION}`, 'tools/call', { name: 'read', arguments: { path: 'a.ts' } })
    expect(called.body!.result).toEqual({ content: [{ type: 'text', text: 'done' }] })
    adapter.dispose()
  })

  it('never revokes a live Worker capability from an aborted auxiliary turn', async () => {
    const h = harness()
    const workerLog = logPath(), compactionLog = logPath()
    const adapter = new AcpAdapter(hostFor(),
      () => new Map([['devin', profile(workerLog)], ['compact', profile(compactionLog, { ACP_PROMPT_DELAY_MS: '300' })]]),
      undefined, undefined, h.bridge)
    await runAdapter(adapter, SESSION)
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    const controller = new AbortController()
    const consume = (async () => {
      for await (const _chunk of adapter.stream({
        provider: 'compact', model: 'default', purpose: 'compaction',
        sessionId: SESSION as GenerateOptions['sessionId'],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'summarise' }] }], signal: controller.signal,
      } as GenerateOptions)) { /* drain */ }
    })().catch(() => {})
    await until(() => sessionNews(compactionLog).length === 1, 'the compaction session/new')
    controller.abort()
    await consume
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    adapter.dispose()
  })

  it('never revokes a live Worker capability from an auxiliary idle timeout', async () => {
    const h = harness()
    const workerLog = logPath(), compactionLog = logPath()
    const adapter = new AcpAdapter(hostFor(),
      () => new Map([['devin', profile(workerLog)],
        ['compact', profile(compactionLog, { ACP_PROMPT_DELAY_MS: '5000' }, { idleTimeoutMs: 100 })]]),
      undefined, undefined, h.bridge)
    await runAdapter(adapter, SESSION)
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    const chunks = await runAdapter(adapter, SESSION, { provider: 'compact', purpose: 'compaction' } as Partial<GenerateOptions>)
    expect(JSON.stringify(chunks.at(-1))).toContain('TIMEOUT')
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    adapter.dispose()
  })

  it('closes a half-open session exactly once when effort selection fails', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    const closed = vi.spyOn(AcpAgentProcess.prototype, 'closeSession')
    // A freshly opened session never reached `bindings`, so only the failing dispatch can
    // close it — and it must do so exactly once.
    const effort = vi.spyOn(AcpAgentProcess.prototype, 'selectEffort').mockRejectedValue(new Error('effort switch refused'))
    try {
      const chunks = await runAdapter(adapter, SESSION, { reasoningEffort: 'high' } as Partial<GenerateOptions>)
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
      expect(closed).toHaveBeenCalledTimes(1)
      // The declaration was made, and the capability that came with it is gone.
      expect(sessionNews(log)[0]!.mcpServers).toHaveLength(1)
      expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    }
    finally {
      effort.mockRestore()
      closed.mockRestore()
    }
  })

  it('closes a stored session once when effort selection fails on a reused binding', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    const closed = vi.spyOn(AcpAgentProcess.prototype, 'closeSession')
    const effort = vi.spyOn(AcpAgentProcess.prototype, 'selectEffort').mockRejectedValue(new Error('effort switch refused'))
    try {
      // The second turn reuses the stored binding, so #revokeBridge owns the close and the
      // catch must not close it a second time.
      const chunks = await runAdapter(adapter, SESSION, { reasoningEffort: 'high' } as Partial<GenerateOptions>)
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
      expect(closed).toHaveBeenCalledTimes(1)
      expect(sessionNews(log)).toHaveLength(1)
    }
    finally {
      effort.mockRestore()
      closed.mockRestore()
    }
  })

  it('revokes the token before handing the caller a failed prompt', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log, { ACP_FAIL_PROMPT: '1' })
    const controller = new AbortController()
    let revokedBeforeFinish: number | undefined
    let last: StreamChunk | undefined
    for await (const chunk of adapter.stream({
      provider: 'devin', model: 'default', sessionId: SESSION as GenerateOptions['sessionId'],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], signal: controller.signal,
    } as GenerateOptions)) {
      last = chunk
      if (chunk.type === 'finish' && revokedBeforeFinish === undefined) {
        // The caller stops right after the error finish; the grant must already be dead.
        revokedBeforeFinish = (await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error
          ? -32001
          : 0
      }
    }
    expect(last).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
    expect(revokedBeforeFinish).toBe(-32001)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    adapter.dispose()
  })

  it('revokes the bridge when the route profile changes or disappears', async () => {
    const h = harness()
    const log = logPath()
    let profiles = new Map([['devin', profile(log)]])
    const adapter = new AcpAdapter(hostFor(), () => profiles, undefined, undefined, h.bridge)
    await runAdapter(adapter, SESSION)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).status).toBe(200)
    profiles = new Map()
    adapter.sync()
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
    adapter.dispose()
  })

  it('revokes the bridge when the adapter is disposed', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).status).toBe(200)
    adapter.dispose()
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('keeps the bridge across a successful reused turn', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log)
    await runAdapter(adapter, SESSION)
    await runAdapter(adapter, SESSION)
    // One ACP session, one grant, and it still lists the real tools after the second
    // ordinary turn — an unauthorized JSON-RPC error would also answer HTTP 200, so the
    // assertion is the tool list itself.
    expect(sessionNews(log)).toHaveLength(1)
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    adapter.dispose()
    // Disposal is what ends it.
    expect((await rpc(h.bridge, `token-${SESSION}`, 'tools/list')).body!.error).toMatchObject({ code: -32001 })
  })

  it('replaces the ACP session and re-issues the grant when the Worker model changes with the route', async () => {
    const h = harness()
    const log = logPath()
    // This agent offers two models, so the Worker can really be moved between them.
    const adapter = adapterWith(h, log, { ACP_MODELS: 'default,other-model' })
    await runAdapter(adapter, SESSION)
    // Both the requested model and the Worker's route model moved: still authorized.
    h.facts.current = { ...factsFor(), route: { provider: 'devin', model: 'other-model' } }
    const chunks = await runAdapter(adapter, SESSION, { model: 'other-model' })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    const news = sessionNews(log)
    expect(news).toHaveLength(2)
    for (const entry of news) expect(entry.mcpServers).toHaveLength(1)
    expect(await listedTools(h.bridge, `token-${SESSION}`)).toEqual(['read', 'bash'])
    adapter.dispose()
  })

  it('attaches nothing when the requested model is not the Worker’s route model', async () => {
    const h = harness()
    const log = logPath()
    const adapter = adapterWith(h, log, { ACP_MODELS: 'default,other-model' })
    await runAdapter(adapter, SESSION, { model: 'other-model' })
    const news = sessionNews(log)
    expect(news).toHaveLength(1)
    expect(news[0]!.mcpServers).toEqual([])
    adapter.dispose()
  })
})
