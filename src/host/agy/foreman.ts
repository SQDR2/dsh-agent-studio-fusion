import { randomUUID } from 'node:crypto'
import { LlmError, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { agyFetch } from './net.js'
import { AGY_ENDPOINTS } from './oauth.js'
import { agyUserAgent } from './quota.js'
import { toCanonicalWarmupModel } from './warmup.js'

interface Connection {
  accessToken: string
  project: string
  proxy?: string
  version: string | null
}

// Use text for the tool protocol too: the upstream receives NO callable tools,
// and Fusion's normal audit loop handles requests, budgets and citations.
function instruction(options: GenerateOptions): string {
  const tools = options.tools ?? []
  return `${options.system ?? ''}\n\n${tools.length === 0
    ? 'Return the final assessment now. No inspections are available.'
    : 'To request an inspection, return exactly {"foremanTool":{"name":"tool_name","arguments":{...}}} as your entire response. Request one inspection at a time. The host will send its result in the transcript on the next request. Otherwise return the final assessment JSON as instructed. Tool definitions: ' + JSON.stringify(tools)}`
}

function transcript(options: GenerateOptions) {
  // Only the audit request's transcript, never the Lead session or any CLI history.
  return [{ role: 'user', parts: [{ text: JSON.stringify(options.messages.map(message => ({
    role: message.role,
    ...('toolCallId' in message ? { toolCallId: message.toolCallId } : {}),
    content: message.content,
  }))) }] }]
}

const MAX_FRAME_CHARS = 2_000_000
const MAX_OUTPUT_CHARS = 2_000_000

interface Frame {
  error?: unknown
  response?: Frame
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean; functionCall?: unknown }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number }
}

async function* frames(response: Response, signal?: AbortSignal): AsyncIterable<Frame> {
  if (!response.body) throw new LlmError('Antigravity Foreman received an empty response', 'AGY_AUDIT_PROTOCOL')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const cancel = () => { void reader.cancel(signal?.reason).catch(() => undefined) }
  signal?.addEventListener('abort', cancel, { once: true })
  let buffer = ''
  try {
    signal?.throwIfAborted()
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      buffer += decoder.decode(value, { stream: !done })
      if (done && buffer.trim()) buffer += '\n\n'
      for (;;) {
        signal?.throwIfAborted()
        const split = /\r?\n\r?\n/.exec(buffer)
        if ((split?.index ?? buffer.length) > MAX_FRAME_CHARS) {
          throw new LlmError('Antigravity Foreman stream event exceeded its size limit', 'AGY_AUDIT_PROTOCOL')
        }
        if (!split) break
        const lines = buffer.slice(0, split.index).split(/\r?\n/)
        buffer = buffer.slice(split.index + split[0].length)
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (data && data !== '[DONE]') {
          let frame: Frame
          try { frame = JSON.parse(data) as Frame } catch {
            throw new LlmError('Antigravity Foreman received invalid stream data', 'AGY_AUDIT_PROTOCOL')
          }
          yield frame
        }
      }
      if (done) return
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
    // Cancelling wakes a blocked read; don't let a slow underlying teardown
    // keep the review's semaphore slot occupied past its deadline.
    cancel()
    reader.releaseLock()
  }
}

export async function* streamAgyForeman(options: GenerateOptions, connection: Connection, fetch = agyFetch): AsyncIterable<StreamChunk> {
  const requestId = randomUUID()
  const model = toCanonicalWarmupModel(options.model)
  const isClaude = model.toLowerCase().includes('claude')
  const effort = options.reasoningEffort
  const thinkingLevel = effort === 'low' ? 'LOW' : effort === 'medium' ? 'MEDIUM'
    : effort === 'high' || effort === 'xhigh' || effort === 'max' ? 'HIGH' : undefined
  const body = JSON.stringify({
    project: connection.project,
    model,
    requestId: `agent/${requestId}`,
    request: {
      sessionId: `foreman_${requestId}`,
      systemInstruction: { parts: [{ text: instruction(options) }] },
      contents: transcript(options),
      generationConfig: {
        maxOutputTokens: options.maxTokens,
        ...(!isClaude && { responseModalities: ['TEXT'] }),
        ...(/^gemini-[34][.-]/.test(model) && thinkingLevel && { thinkingConfig: { thinkingLevel } }),
      },
    },
  })
  let response: Response | undefined
  for (const endpoint of AGY_ENDPOINTS) {
    options.signal?.throwIfAborted()
    try {
      response = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
        method: 'POST', redirect: 'error', signal: options.signal,
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'User-Agent': agyUserAgent(connection.version),
          'Client-Metadata': '{"ideType":"ANTIGRAVITY"}',
          ...(isClaude && { 'anthropic-beta': 'claude-code-20250219' }),
        },
        body,
      }, connection.proxy, null)
    } catch {
      options.signal?.throwIfAborted()
      continue
    }
    if (response.ok) break
    // HTTP status is sufficient; draining or waiting for teardown must not mask it.
    void response.body?.cancel().catch(() => undefined)
    // Never retry an auth or eligibility denial with another endpoint/account.
    if (response.status !== 404 && response.status < 500) break
  }
  if (!response?.ok) {
    const detail = response?.status === 429 ? ' (HTTP 429: upstream rate or quota limit)'
      : response ? ` (HTTP ${response.status})` : ' (network error)'
    throw new LlmError(`Antigravity Foreman inference failed${detail}`, 'AGY_AUDIT_INFERENCE')
  }
  let text = ''
  let started = false
  let finish: string | undefined
  let usage: Frame['usageMetadata']
  for await (const frame of frames(response, options.signal)) {
    if (!frame || typeof frame !== 'object' || frame.error || frame.response?.error) {
      throw new LlmError('Antigravity Foreman inference returned an upstream error', 'AGY_AUDIT_INFERENCE')
    }
    const value = frame.response ?? frame
    usage = value.usageMetadata ?? usage
    const candidate = value.candidates?.[0]
    finish = candidate?.finishReason ?? finish
    for (const part of candidate?.content?.parts ?? []) {
      if (part.functionCall !== undefined) throw new LlmError('Antigravity Foreman received an unexpected native tool call', 'AGY_AUDIT_PROTOCOL')
      if (typeof part.text !== 'string' || !part.text) continue
      // Heartbeat for the review clock without exposing internal reasoning or
      // emitting tool JSON as answer text before we've classified it.
      if (!started) {
        started = true
        yield { type: 'block-start', index: 0, blockType: 'reasoning' }
      }
      if (!part.thought) {
        text += part.text
        if (text.length > MAX_OUTPUT_CHARS) throw new LlmError('Antigravity Foreman response exceeded its size limit', 'AGY_AUDIT_PROTOCOL')
      }
    }
  }
  if (started) yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: '' } }
  if (usage) {
    const cached = usage.cachedContentTokenCount ?? 0
    const reasoning = usage.thoughtsTokenCount ?? 0
    yield { type: 'usage', usage: {
      inputTokens: Math.max(0, (usage.promptTokenCount ?? 0) - cached),
      outputTokens: (usage.candidatesTokenCount ?? 0) + reasoning,
      ...(cached ? { cacheReadTokens: cached } : {}),
      ...(reasoning ? { reasoningTokens: reasoning } : {}),
      ...(usage.totalTokenCount !== undefined ? { totalTokens: usage.totalTokenCount } : {}),
    } }
  }
  if (finish === 'MAX_TOKENS') {
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
    return
  }
  if (finish !== 'STOP' || !text.trim()) throw new LlmError('Antigravity Foreman did not return a complete response', 'AGY_AUDIT_PROTOCOL')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { /* Assessment parser supplies the canonical error. */ }
  if (parsed && typeof parsed === 'object' && 'foremanTool' in parsed) {
    const call = parsed.foremanTool as { name?: unknown; arguments?: unknown } | null
    if (Object.keys(parsed).length !== 1 || !call || typeof call.name !== 'string'
      || !options.tools?.some(tool => tool.name === call.name)
      || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) {
      throw new LlmError('Antigravity Foreman requested an unavailable or invalid inspection', 'AGY_AUDIT_PROTOCOL')
    }
    yield { type: 'block-start', index: 1, blockType: 'tool-call' }
    yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: ToolCallId(`foreman:${randomUUID()}`), name: call.name, arguments: JSON.stringify(call.arguments) } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
    return
  }
  yield { type: 'block-start', index: 1, blockType: 'text' }
  yield { type: 'block-end', index: 1, block: { type: 'text', text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
