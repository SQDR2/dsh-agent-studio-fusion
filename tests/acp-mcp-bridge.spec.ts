import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { AcpToolBridge, ACP_MCP_PATH, type AcpBridgeAuthority, type AcpWorkerFacts } from '../src/host/acp/bridge.js'
import { AcpAdapter, type AcpBridgeMount } from '../src/host/acp/adapter.js'
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
    origin: () => 'http://127.0.0.1:4123',
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

async function rpc(bridge: AcpToolBridge, token: string, method: string, params?: unknown, id: number | string | null = 1) {
  const res = new FakeResponse()
  await bridge.handle(fakeRequest(token, { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }), res as unknown as ServerResponse)
  return { status: res.status, body: res.payload.length > 0 ? JSON.parse(res.payload) as Record<string, unknown> : undefined }
}

function fakeRequest(token: string, body: unknown): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage & { [Symbol.asyncIterator]: () => AsyncGenerator<Buffer> }
  req.method = 'POST'
  req.url = `${ACP_MCP_PATH}/${token}`
  req.headers = { host: '127.0.0.1:4123', authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  ;(req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: '127.0.0.1' }
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(body))
  }
  return req
}

function profile(log: string, env: Record<string, string> = {}): AcpAgentProfile {
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
  it('gives a live Fusion Worker ACP session exactly one bridge server', () => {
    const h = harness()
    const servers = h.bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    expect(servers).toHaveLength(1)
    expect(servers[0]!.type).toBe('http')
    expect(servers[0]!.url).toBe(`http://127.0.0.1:4123${ACP_MCP_PATH}/token-${SESSION}`)
    expect(servers[0]!.headers).toEqual([{ name: 'Authorization', value: `Bearer token-${SESSION}` }])
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

  it('narrows an explore order to its read-only tools', () => {
    const h = harness({ workerTools: ['read', 'bash', 'write'] })
    expect(h.bridge.allowedTools(h.agents.get(SESSION)!, factsFor('explore'))).toEqual(['read'])
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

  it('refuses an expired token and drops its grant', async () => {
    const now = { value: 1_000 }
    const h = harness()
    const bridge = new AcpToolBridge(h.authority, {
      workerTools: ['read', 'bash'],
      origin: () => 'http://127.0.0.1:4123',
      now: () => now.value,
      ttlMs: 50,
    })
    bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })
    now.value += 100
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

  function adapterWith(h: ReturnType<typeof harness>, log: string): AcpAdapter {
    const bridge: AcpBridgeMount = h.bridge
    return new AcpAdapter(hostFor(), () => new Map([['devin', profile(log)]]), undefined, undefined, bridge)
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
    expect(news[0]!.mcpServers[0]!.url).toContain(`/acp-mcp/token-${SESSION}`)
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
    // A second turn with a different model replaces the ACP session and its grant.
    await runAdapter(adapter, SESSION, { model: 'other-model' })
    adapter.dispose()
    const news = sessionNews(log)
    expect(news).toHaveLength(2)
    for (const entry of news) expect(entry.mcpServers).toHaveLength(1)
  })
})
