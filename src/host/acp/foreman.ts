import type { ContentBlock as AcpContentBlock, PromptResponse } from '@agentclientprotocol/sdk'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { AcpAgentProcess, AcpSession } from './agent-process.js'
import type { ContextWindows } from './context-windows.js'
import type { PermissionTurn } from './permission.js'
import type { AcpAgentProfile } from './types.js'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import { applyConfigOptions } from './agent-process.js'
import { addUsage, metaUsage, usageDelta } from './chunk-translator.js'
import { noteToolCall } from './permission.js'

const MAX_OUTPUT_CHARS = 2_000_000
const CANCEL_GRACE_MS = 5_000

type ForemanOutcome =
  | { kind: 'response'; response: PromptResponse }
  | { kind: 'error'; error: unknown }
  | { kind: 'aborted' }
  | { kind: 'timeout' }

function instruction(options: GenerateOptions): string {
  const tools = options.tools ?? []
  return `${options.system ?? ''}\n\n`
    + 'CRITICAL execution constraint: You are running inside an isolated empty sandbox directory with all native agent tools, shell execution, file tools, and MCP tools disabled and forbidden. '
    + 'Do NOT call or invoke any native agent tool or MCP tool; any native tool call will immediately abort the review. '
    + (tools.length === 0
      ? 'Return the final assessment now. No inspections are available.'
      : 'To request an inspection, return exactly {"foremanTool":{"name":"tool_name","arguments":{...}}} as your entire response (a single JSON object, no markdown code fences, no prose). Request one inspection at a time. The host will send its result in the transcript on the next request. Otherwise return the final assessment JSON as instructed. Tool definitions: ' + JSON.stringify(tools))
}

function transcript(options: GenerateOptions): string {
  // Only the audit request's transcript, never the Lead session or any ACP session history.
  return JSON.stringify(options.messages.map(message => ({
    role: message.role,
    ...('toolCallId' in message ? { toolCallId: message.toolCallId } : {}),
    content: message.content,
  })))
}

function foremanPrompt(options: GenerateOptions): AcpContentBlock[] {
  const tools = options.tools ?? []
  const protocol = '<response_protocol>\n'
    + 'IMPORTANT: Do NOT invoke any native agent tool or function call (such as read, grep, find_file_by_name, glob, exec, bash, mcp, skill, or subagent). Emit zero native tool calls; any native tool call will immediately abort the review.\n'
    + (tools.length === 0
      ? 'Return the final ForemanAssessment JSON object now (schemaVersion 1, single JSON object, no markdown code fences, no prose).\n'
      : 'Reply in plain text with ONLY a single JSON object (no markdown code fences, no prose): either {"foremanTool":{"name":"<read|grep|glob|bash>","arguments":{...}}} to request one host-mediated inspection of the target repository, or the final ForemanAssessment JSON object (schemaVersion 1) once you have inspected the required evidence.\n')
    + '</response_protocol>'
  return [{
    type: 'text',
    text: `<system_instructions>\n${instruction(options)}\n</system_instructions>\n\n<audit_transcript>\n${transcript(options)}\n</audit_transcript>\n\n${protocol}`,
  }]
}

/**
 * Run one Foreman audit turn on an ACP route in an isolated ephemeral session.
 *
 * Isolation properties:
 * - Opens a fresh ACP session in a newly created empty temporary directory (`cwd`), never in
 *   the project workspace, and removes that directory and closes the session on exit.
 * - Passes an empty `mcpServers: []` list so the session receives no Host-tool bridge, and
 *   never touches or revokes any Lead/Sidekick binding on the same route.
 * - Overrides the turn's permission policy to `'reject'`, and immediately cancels and fails
 *   closed with `ACP_AUDIT_PROTOCOL` if the agent emits any `tool_call` or `tool_call_update`
 *   event.
 * - Uses the same text-encoded `{"foremanTool":...}` protocol as Antigravity Foreman so all
 *   workspace inspections are executed and citation-verified by the Fusion Host.
 */
export async function* streamAcpForeman(
  options: GenerateOptions,
  profile: AcpAgentProfile,
  agent: AcpAgentProcess,
  turns: Map<string, PermissionTurn>,
  contextWindows: ContextWindows,
): AsyncIterable<StreamChunk> {
  const route = options.provider
  const signal = options.signal
  if (signal?.aborted) {
    yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'request aborted before start' } } }
    return
  }

  const root = mkdtempSync(join(tmpdir(), 'dsh-fusion-acp-foreman-'))
  let session: AcpSession | undefined
  try {
    session = await agent.newSession(root, signal, [])
    await agent.selectModel(session, options.model, signal)
    const wantedEffort = (options.reasoningEffort as string | undefined) ?? session.efforts?.initial
    if (wantedEffort !== undefined)
      await agent.selectEffort(session, wantedEffort, signal)

    const prompt = foremanPrompt(options)
    let started = false
    let text = ''
    let usage: TokenUsage | undefined
    let outcome: ForemanOutcome | undefined
    let wake: (() => void) | undefined
    const queue: StreamChunk[] = []
    const notify = (): void => {
      wake?.()
      wake = undefined
    }
    const settle = (next: ForemanOutcome): void => {
      outcome ??= next
      notify()
    }

    const permissions: PermissionTurn = {
      dshSessionId: undefined,
      signal,
      policy: 'reject',
      tools: new Map(),
    }

    let idleTimer: NodeJS.Timeout | undefined
    const armIdle = (): void => {
      if (profile.idleTimeoutMs <= 0)
        return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (session !== undefined)
          agent.cancel(session)
        settle({ kind: 'timeout' })
      }, profile.idleTimeoutMs)
    }
    let cancelTimer: NodeJS.Timeout | undefined
    const onAbort = (): void => {
      if (session !== undefined)
        agent.cancel(session)
      cancelTimer = setTimeout(() => settle({ kind: 'aborted' }), CANCEL_GRACE_MS)
    }

    turns.set(session.sessionId, permissions)
    signal?.addEventListener('abort', onAbort, { once: true })
    armIdle()
    const activeSession = session
    const model = options.model

    agent.prompt(activeSession, prompt, (update) => {
      armIdle()
      noteToolCall(permissions.tools, update)
      if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
        const title = update.title ?? update.toolCallId
        agent.cancel(activeSession)
        settle({
          kind: 'error',
          error: new LlmError(`ACP Foreman on "${route}" attempted a native tool call ("${title}") instead of the host inspection protocol`, 'ACP_AUDIT_PROTOCOL'),
        })
        return
      }
      if (update.sessionUpdate === 'usage_update') {
        if (update.size > 0)
          contextWindows.set(route, model, update.size)
        const call = metaUsage(update._meta)
        if (call !== undefined)
          usage = addUsage(usage, call)
        return
      }
      if (update.sessionUpdate === 'config_option_update') {
        applyConfigOptions(activeSession, update.configOptions)
        return
      }
      if (update.sessionUpdate === 'agent_thought_chunk' || update.sessionUpdate === 'agent_message_chunk') {
        if (update.content.type !== 'text' || update.content.text.length === 0)
          return
        if (!started) {
          started = true
          queue.push({ type: 'block-start', index: 0, blockType: 'reasoning' })
        }
        if (update.sessionUpdate === 'agent_message_chunk') {
          text += update.content.text
          if (text.length > MAX_OUTPUT_CHARS) {
            agent.cancel(activeSession)
            settle({
              kind: 'error',
              error: new LlmError('ACP Foreman response exceeded its size limit', 'ACP_AUDIT_PROTOCOL'),
            })
            return
          }
        }
        notify()
      }
    }).then(
      response => settle({ kind: 'response', response }),
      error => settle({ kind: 'error', error }),
    )

    try {
      while (true) {
        while (queue.length > 0)
          yield queue.shift()!
        if (outcome !== undefined)
          break
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    }
    finally {
      clearTimeout(idleTimer)
      clearTimeout(cancelTimer)
      signal?.removeEventListener('abort', onAbort)
      turns.delete(activeSession.sessionId)
      if (outcome === undefined)
        agent.cancel(activeSession)
    }

    if (started)
      yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: '' } }

    if (outcome.kind === 'error') {
      if (signal?.aborted) {
        yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'request aborted' } } }
        return
      }
      throw outcome.error
    }
    if (outcome.kind === 'response' && outcome.response.usage != null)
      usage = usageDelta(outcome.response.usage, undefined)
    if (usage !== undefined)
      yield { type: 'usage', usage }
    if (outcome.kind === 'timeout') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TIMEOUT', message: 'ACP agent was idle for longer than the configured idleTimeoutMs' } } }
      return
    }
    if (outcome.kind === 'aborted') {
      yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'request aborted' } } }
      return
    }

    const { response } = outcome
    if (response.stopReason === 'max_tokens') {
      yield { type: 'finish', reason: { kind: 'max-tokens' } }
      return
    }
    if (response.stopReason === 'refusal') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'REFUSAL', message: 'ACP agent refused the request' } } }
      return
    }
    if (response.stopReason !== 'end_turn') {
      if (permissions.denied !== undefined) {
        throw new LlmError(`ACP Foreman attempted a denied tool action: ${permissions.denied}`, 'ACP_AUDIT_PROTOCOL')
      }
      throw new LlmError(`ACP Foreman did not return a complete response (stopReason: ${response.stopReason})`, 'ACP_AUDIT_PROTOCOL')
    }
    const trimmed = text.trim()
    if (!trimmed)
      throw new LlmError('ACP Foreman ended the turn without any content', 'EMPTY_RESPONSE')

    let parsed: unknown
    try { parsed = JSON.parse(trimmed) } catch { /* Assessment parser supplies the canonical error. */ }
    if (parsed && typeof parsed === 'object' && 'foremanTool' in parsed) {
      const call = (parsed as { foremanTool?: unknown }).foremanTool as { name?: unknown; arguments?: unknown } | null
      if (Object.keys(parsed).length !== 1 || !call || typeof call.name !== 'string'
        || !options.tools?.some(tool => tool.name === call.name)
        || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) {
        throw new LlmError('ACP Foreman requested an unavailable or invalid inspection', 'ACP_AUDIT_PROTOCOL')
      }
      yield { type: 'block-start', index: 1, blockType: 'tool-call' }
      yield {
        type: 'block-end',
        index: 1,
        block: {
          type: 'tool-call',
          id: ToolCallId(`foreman:${randomUUID()}`),
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    yield { type: 'block-start', index: 1, blockType: 'text' }
    yield { type: 'block-end', index: 1, block: { type: 'text', text: trimmed } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  finally {
    if (session !== undefined)
      agent.closeSession(session)
    rmSync(root, { recursive: true, force: true })
  }
}
