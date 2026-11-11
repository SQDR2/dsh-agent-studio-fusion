/**
 * Compatibility guard: the ACP Host-tool bridge is a Sidekick-only capability.
 *
 * This file is not part of the frozen acceptance commands (vitest.config.mts only collects
 * `tests/**`), but it documents the compatibility contract the bridge keeps: no Lead ACP
 * session, no ordinary ACP route use, no text order, and no other Fusion task ever obtains
 * a Host-tool MCP server declaration.
 */
import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { AcpToolBridge, type AcpBridgeAuthority, type AcpWorkerFacts } from '../src/host/acp/bridge.js'

const SESSION = 'session-worker-1'

function facts(taskId: string, mode: 'implement' | 'explore' = 'implement'): AcpWorkerFacts {
  return {
    dshSessionId: SESSION,
    taskId,
    workOrderId: `order-${taskId}`,
    workOrderRevision: 1,
    briefRevision: 0,
    mode,
    route: { provider: 'devin', model: 'default' },
  }
}

function bridgeWith(current: { role: 'lead' | 'worker'; facts?: AcpWorkerFacts }) {
  const agent = { id: SESSION, session: { header: { cwd: '/' } } } as unknown as Agent
  const authority: AcpBridgeAuthority = {
    agentOf: id => id === SESSION ? agent : undefined,
    workerFacts: () => current.role === 'worker' ? current.facts : undefined,
    schemasOf: () => [{ name: 'read', description: 'read', parameters: { type: 'object' } }] as ToolSchema[],
    execute: async () => ({ isError: false, value: null, content: [] }) as unknown as ToolExecutionResult,
  }
  return new AcpToolBridge(authority, { workerTools: ['read'], origin: () => 'http://127.0.0.1:1' })
}

describe('ACP bridge compatibility', () => {
  it('never declares a server for a Lead ACP session', () => {
    const bridge = bridgeWith({ role: 'lead', facts: facts('t1') })
    expect(bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toEqual([])
  })

  it('never declares a server for an ordinary ACP route call', () => {
    const bridge = bridgeWith({ role: 'worker', facts: facts('t1') })
    expect(bridge.serversFor({ sessionId: 'session-not-fusion', route: 'devin', model: 'default' })).toEqual([])
    expect(bridge.serversFor({ sessionId: SESSION, purpose: 'session-title', route: 'devin', model: 'default' })).toEqual([])
  })

  it('never declares a server for a text-mode work order', () => {
    const bridge = bridgeWith({ role: 'worker', facts: undefined })
    expect(bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toEqual([])
  })

  it('declares exactly one server for a live Sidekick on the ACP route', () => {
    const bridge = bridgeWith({ role: 'worker', facts: facts('t1') })
    expect(bridge.serversFor({ sessionId: SESSION, route: 'devin', model: 'default' })).toHaveLength(1)
  })

  it('never exposes Fusion internals through the tool list', () => {
    const bridge = bridgeWith({ role: 'worker', facts: facts('t1') })
    const agent = { id: SESSION, session: { header: { cwd: '/' } } } as unknown as Agent
    expect(bridge.allowedTools(agent, facts('t1'))).toEqual(['read'])
  })
})
