import { createServer } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { McpServer, PromptResponse, SessionUpdate } from '@agentclientprotocol/sdk'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { PlanReviewCandidate } from '../src/contracts.js'
import { AcpAdapter } from '../src/host/acp/adapter.js'
import type { AcpSession } from '../src/host/acp/agent-process.js'
import type { AcpAgentProfile } from '../src/host/acp/types.js'
import type { SessionBinding } from '../src/host/bindings.js'
import { NativeAuxiliaryRequests } from '../src/host/native-auxiliary.js'
import { NativePlanReviewService } from '../src/host/plan-review.js'
import { foremanAssessmentSchema } from '../src/plan-review.js'
import { hostPlugin } from './host-plugin.js'

const models = ['gpt-6.2-sol', 'deepseek-v4.1-flash'] as const
const digest = '3'.repeat(64)
const evidence = 'SYNTHETIC_EVIDENCE_47'
const path = 'audit.txt'
const assessment = {
  schemaVersion: 1, candidateDigest: digest, verdict: 'ready',
  inspected: [{ path, startLine: 1, endLine: 1 }],
  acceptanceAudit: { uncoveredRequirements: [], weakOracles: [], falseGreenScenarios: [] },
  decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
  materialAmbiguities: [],
}

async function runReview(ctx: Context, model: string, provider = 'gz') {
  const root = await mkdtemp(join(tmpdir(), 'fusion-foreman-routes-'))
  if (dirname(root) !== tmpdir()) throw new Error('Fixture directory is outside the temporary root')
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, path), `${evidence}\n`)
  const agent = { id: 'fixture-lead', session: { header: { cwd: root } } } as unknown as Agent
  const binding = { taskId: 'fixture-task', profile: { digest: 'fixture-profile', foreman: {
    route: { provider, model }, maxOutputTokens: 16_384, timeoutMs: 180_000,
  } } } as unknown as SessionBinding
  const candidate = { schemaVersion: 1, order: { candidateDigest: digest, mode: 'text', goal: 'Confirm what the one-line fixture contains' },
    brief: 'Read audit.txt line 1 first. Return a normal verdict with that inspected line. This is an isolated Foreman smoke test; do not run commands.',
    requirementCoverage: [], checkDefinitions: [], assessmentSchema: foremanAssessmentSchema(),
  } as unknown as PlanReviewCandidate
  let evidenceReturned = false
  const auditContext = { llm: { stream: (request: Parameters<typeof ctx.llm.stream>[0]) => {
    evidenceReturned ||= request.messages.some(message => message.role === 'tool' && JSON.stringify(message.content).includes(evidence))
    return ctx.llm.stream(request)
  } } } as unknown as Context
  const outcome = await new NativePlanReviewService(auditContext, agent, binding, new NativeAuxiliaryRequests()).review(candidate)
  return { outcome, evidenceReturned, root }
}

it.each(models)('completes the real Chat Completions adapter + Foreman loop with reasoning_content replay for gz/%s against a synthetic gateway', async (model) => {
  type Wire = { model: string; messages: { role: string; content: unknown; reasoning_content?: string; tool_call_id?: string }[]; tools: { function: { name: string } }[] }
  const requests: Wire[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push(JSON.parse(body))
    const read = requests.length === 1
    const delta = read ? {
      role: 'assistant',
      reasoning_content: 'First I must inspect audit.txt line 1.',
      tool_calls: [{ index: 0, id: 'call_read', type: 'function', function: {
        name: 'read', arguments: JSON.stringify({ file_path: path, offset: 1, limit: 1 }),
      } }],
    } : {
      role: 'assistant',
      reasoning_content: 'Evidence verified; returning ready assessment.',
      content: JSON.stringify(assessment),
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const event of [
      { choices: [{ index: 0, delta, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: read ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } },
    ]) res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model, ...event })}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  onTestFinished(() => { server.closeAllConnections(); server.close() })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No fixture gateway address')
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(hostPlugin(LlmRuntime))
  vi.stubEnv('FUSION_FIXTURE_GATEWAY_KEY', 'fixture-key')
  onTestFinished(() => vi.unstubAllEnvs())
  await ctx.plugin(hostPlugin(PiAi), { providers: { gz: {
    api: 'openai-completions', apiKeyEnv: 'FUSION_FIXTURE_GATEWAY_KEY', transport: 'sse', baseURL: `http://127.0.0.1:${address.port}/v1`,
    models: [{ id: model, reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' } }],
  } } })
  const { outcome, evidenceReturned } = await runReview(ctx, model)
  expect(evidenceReturned, 'Foreman should request and receive the fixture evidence').toBe(true)
  if (outcome.kind === 'unavailable') throw new Error(outcome.reason)
  expect(outcome).toMatchObject({ kind: 'ready', assessment: { inspected: [{ path, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }] } })
  expect(requests.map(request => request.model)).toEqual([model, model])
  expect(requests[0]?.tools.map(tool => tool.function.name)).toContain('read')
  expect(requests[1]?.messages).toContainEqual(expect.objectContaining({
    role: 'assistant',
    reasoning_content: 'First I must inspect audit.txt line 1.',
  }))
  expect(requests[1]?.messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'call_read', content: expect.stringContaining(evidence) }))
})

it('runs an ACP Foreman audit in an isolated empty directory without MCP bridges and verifies citations', async () => {
  const seenSessions: { cwd: string; entries: string[]; mcpServers: readonly McpServer[]; closed: boolean }[] = []
  let prompts = 0
  const profile: AcpAgentProfile = {
    command: 'devin', args: ['acp'], env: {}, models: [], discoverModels: true,
    permission: 'allow', imageInput: 'off', systemPrompt: 'drop', showToolCalls: true,
    contextWindow: 200_000, startupTimeoutMs: 10_000, idleTimeoutMs: 60_000,
  }
  const fakeProcess = {
    generation: 1,
    newSession: async (cwd: string, _signal?: AbortSignal, mcpServers: readonly McpServer[] = []): Promise<AcpSession> => {
      seenSessions.push({ cwd, entries: readdirSync(cwd), mcpServers, closed: false })
      return {
        sessionId: `acp-foreman-${seenSessions.length}`,
        generation: 1,
        models: { configId: 'model', legacy: false, current: 'swe-2-flash-medium', available: [{ id: 'swe-2-flash-medium', name: 'SWE-2 Flash Medium' }] },
      }
    },
    selectModel: async () => {},
    selectEffort: async () => {},
    prompt: async (_session: AcpSession, prompt: { type: string; text?: string }[], onUpdate: (update: SessionUpdate) => void): Promise<PromptResponse> => {
      prompts += 1
      const promptText = prompt.map(block => block.text ?? '').join('\n')
      expect(promptText).toContain('<system_instructions>')
      expect(promptText).toContain('<response_protocol>')
      expect(promptText).toContain('foremanTool')
      const reply = prompts === 1
        ? JSON.stringify({ foremanTool: { name: 'read', arguments: { file_path: path, offset: 1, limit: 1 } } })
        : JSON.stringify(assessment)
      if (prompts === 2) expect(promptText).toContain(evidence)
      onUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Auditing candidate.' } } as SessionUpdate)
      onUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } } as SessionUpdate)
      return { stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 } } as PromptResponse
    },
    cancel: () => {},
    closeSession: () => {
      if (seenSessions.at(-1)) seenSessions.at(-1)!.closed = true
    },
    dispose: () => {},
  }
  const bridgeRevoked = vi.fn()
  const adapter = new AcpAdapter(
    { logger: { info: () => {}, warn: () => {}, error: () => {} }, agentOf: () => ({ session: { header: { cwd: '/should-not-use-workspace-cwd' } } }) },
    () => new Map([['devin', profile]]),
    undefined,
    undefined,
    { serversFor: () => { throw new Error('Foreman must never request Sidekick MCP servers') }, revokeSession: bridgeRevoked, cancelInflight: bridgeRevoked },
  )
  ;(adapter as unknown as { agents: Map<string, unknown> }).agents.set('devin', { process: fakeProcess, facts: 'fixture' })

  const ctx = { llm: { stream: (request: Parameters<typeof adapter.stream>[0]) => adapter.stream(request) } } as unknown as Context
  const { outcome, evidenceReturned, root } = await runReview(ctx, 'swe-2-flash-medium', 'devin')
  expect(evidenceReturned).toBe(true)
  if (outcome.kind === 'unavailable') throw new Error(outcome.reason)
  expect(outcome).toMatchObject({ kind: 'ready', assessment: { inspected: [{ path, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }] } })
  expect(seenSessions).toHaveLength(2)
  for (const session of seenSessions) {
    expect(session.cwd).not.toBe(root)
    expect(session.cwd).not.toBe('/should-not-use-workspace-cwd')
    expect(session.entries).toEqual([])
    expect(session.mcpServers).toEqual([])
    expect(session.closed).toBe(true)
    expect(existsSync(session.cwd)).toBe(false)
  }
  expect(bridgeRevoked).not.toHaveBeenCalled()
})

it('cancels and fails closed when an ACP agent attempts a native tool call during a Foreman audit', async () => {
  let cancelled = false
  let closed = false
  const profile: AcpAgentProfile = {
    command: 'devin', args: ['acp'], env: {}, models: [], discoverModels: true,
    permission: 'allow', imageInput: 'off', systemPrompt: 'drop', showToolCalls: true,
    contextWindow: 200_000, startupTimeoutMs: 10_000, idleTimeoutMs: 60_000,
  }
  const fakeProcess = {
    generation: 1,
    newSession: async (): Promise<AcpSession> => ({
      sessionId: 'acp-foreman-native-tool',
      generation: 1,
      models: { legacy: false, available: [] },
    }),
    selectModel: async () => {},
    selectEffort: async () => {},
    prompt: async (_session: AcpSession, _prompt: unknown, onUpdate: (update: SessionUpdate) => void): Promise<PromptResponse> => {
      onUpdate({ sessionUpdate: 'tool_call', toolCallId: 'native-1', title: 'bash: ls', kind: 'execute' } as SessionUpdate)
      return { stopReason: 'end_turn' } as PromptResponse
    },
    cancel: () => { cancelled = true },
    closeSession: () => { closed = true },
    dispose: () => {},
  }
  const adapter = new AcpAdapter(
    { logger: { info: () => {}, warn: () => {}, error: () => {} }, agentOf: () => undefined },
    () => new Map([['devin', profile]]),
  )
  ;(adapter as unknown as { agents: Map<string, unknown> }).agents.set('devin', { process: fakeProcess, facts: 'fixture' })

  const ctx = { llm: { stream: (request: Parameters<typeof adapter.stream>[0]) => adapter.stream(request) } } as unknown as Context
  const { outcome } = await runReview(ctx, 'default', 'devin')
  expect(outcome.kind).toBe('unavailable')
  if (outcome.kind === 'unavailable') {
    expect(outcome.reason).toContain('attempted a native tool call')
  }
  expect(cancelled).toBe(true)
  expect(closed).toBe(true)
})

// Opt-in: routes against the user's gateway, with only the synthetic candidate
// and disposable audit.txt above. Never use credentials in ordinary test runs.
it.skipIf(process.env.FUSION_FOREMAN_LIVE !== '1').each(models)('gets a live Foreman verdict from gz/%s', async model => {
  const baseURL = process.env.FUSION_FOREMAN_GATEWAY_URL
  if (!baseURL || !process.env.GZ_API_KEY) throw new Error('Set FUSION_FOREMAN_GATEWAY_URL and GZ_API_KEY for the opted-in Foreman smoke test')
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(hostPlugin(LlmRuntime))
  await ctx.plugin(hostPlugin(PiAi), { providers: { gz: {
    api: 'openai-completions', apiKeyEnv: 'GZ_API_KEY', transport: 'sse', baseURL,
    models: [{ id: model, reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' } }],
  } } })
  const { outcome, evidenceReturned } = await runReview(ctx, model)
  // Do not dump provider diagnostics: gateways may include request metadata.
  if (outcome.kind === 'unavailable') {
    const category = [/^Markdown code fences/, /^Foreman output must/, /^Invalid JSON/, /^Invalid schemaVersion/, /^candidateDigest mismatch/, /^Invalid verdict/, /^acceptanceAudit/, /^decisionChallenges/, /^materialAmbiguities/, /^Unknown field/, /^Foreman output exceeded/, /^Foreman model stream failed/, /^Foreman review aborted/].find(pattern => pattern.test(outcome.reason))?.source ?? 'other validation failure'
    throw new Error(`${model} did not return a review verdict: ${category}`)
  }
  expect(evidenceReturned, 'Foreman should request and receive the fixture evidence').toBe(true)
  expect(outcome.assessment.inspected).toContainEqual(expect.objectContaining({ path, startLine: 1, endLine: 1, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }))
}, 180_000)

it.skipIf(process.env.FUSION_FOREMAN_ACP_LIVE !== '1')('gets a live Foreman verdict from devin ACP in an isolated empty directory', async () => {
  const command = process.env.FUSION_FOREMAN_ACP_BIN ?? '/home/zlw/.local/share/devin/cli/_versions/current/bin/devin'
  const profile: AcpAgentProfile = {
    command, args: ['acp'], env: {}, models: [], discoverModels: true,
    permission: 'ask', imageInput: 'auto', systemPrompt: 'drop', showToolCalls: true,
    contextWindow: 200_000, startupTimeoutMs: 60_000, idleTimeoutMs: 600_000,
  }
  const adapter = new AcpAdapter(
    { logger: { info: () => {}, warn: () => {}, error: () => {} }, agentOf: () => undefined },
    () => new Map([['devin', profile]]),
  )
  onTestFinished(() => adapter.dispose())
  const ctx = { llm: { stream: (request: Parameters<typeof adapter.stream>[0]) => adapter.stream(request) } } as unknown as Context
  const { outcome, evidenceReturned } = await runReview(ctx, 'default', 'devin')
  if (outcome.kind === 'unavailable') throw new Error(outcome.reason)
  expect(evidenceReturned, 'Devin ACP Foreman should request and receive the fixture evidence').toBe(true)
  expect(outcome.assessment.inspected).toContainEqual(expect.objectContaining({ path, startLine: 1, endLine: 1, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }))
}, 120_000)
