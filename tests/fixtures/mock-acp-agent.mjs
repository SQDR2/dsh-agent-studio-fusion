/**
 * A minimal ACP agent over stdio, for tests only.
 *
 * It answers the handshake, records the `mcpServers` of every `session/new` to the file
 * named by `ACP_MCP_LOG`, and answers a prompt with one text chunk. Nothing else.
 */
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const log = process.env.ACP_MCP_LOG

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const lines = createInterface({ input: process.stdin })
lines.on('line', line => {
  let message
  try {
    message = JSON.parse(line)
  }
  catch {
    return
  }
  const { id, method, params } = message
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2025-06-18',
      agentCapabilities: { promptCapabilities: { image: false } },
      authMethods: [],
    } })
    return
  }
  if (method === 'session/new') {
    if (log !== undefined) appendFileSync(log, `${JSON.stringify({ mcpServers: params?.mcpServers ?? [] })}\n`)
    send({ jsonrpc: '2.0', id, result: { sessionId: 'acp-session-1', configOptions: [] } })
    return
  }
  if (method === 'session/prompt') {
    const delay = Number(process.env.ACP_PROMPT_DELAY_MS ?? '0')
    setTimeout(() => {
    send({ jsonrpc: '2.0', method: 'session/update', params: {
      sessionId: 'acp-session-1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'agent answer' } },
    } })
    send({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } })
    }, delay)
    return
  }
  if (method === 'session/set_config_option') {
    send({ jsonrpc: '2.0', id, result: { configOptions: [] } })
    return
  }
  if (method === 'session/cancel') return
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${String(method)}` } })
})
