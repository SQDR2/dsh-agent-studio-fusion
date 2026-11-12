import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { NativeFusionScopes } from '../src/host/native-scopes.js'
import type { SessionBinding } from '../src/host/bindings.js'

/**
 * A resumed session hands the same id to a fresh Agent object. The previous
 * object keeps whatever phase it was in, so `install`'s "must settle" refusal
 * became permanent and the LIVE Agent ran with no Fusion scope at all: the
 * Host's own tool table, no role prompt, `fusion_delegate` merely "unknown"
 * (session-a5409fb4 — abort a turn, switch model, 14 tools became 50). These
 * cases pin the distinction the fix rests on: a retired holder is replaceable,
 * a live one is not.
 */

/** Minimal Agent surface `install`/`detach` touch; the scope never runs here. */
function fakeAgent(id: string, status: 'idle' | 'running'): Agent {
  const disposer = (): (() => void) => () => {}
  return {
    id,
    status,
    ctx: {
      tools: { restrict: disposer, presentAs: disposer, guard: disposer },
      on: disposer,
      systemPrompt: { section: disposer },
    },
  } as unknown as Agent
}

const binding = {
  taskId: 'task-1',
  role: 'lead',
  profile: { context: { lead: {}, worker: {} }, interactionMode: 'model-like', lead: { provider: 'fixture', model: 'lead' } },
  prompts: { lead: 'lead prompt', worker: 'worker prompt' },
} as unknown as SessionBinding

function scopes(live: (agent: Agent) => boolean): NativeFusionScopes {
  return new NativeFusionScopes({
    live,
    canExecute: () => undefined,
    canRequest: () => undefined,
    beforeRequest: () => {},
    readOnlyTools: () => [],
    alwaysTools: () => [],
    installTools: () => [],
  })
}

describe('NativeFusionScopes replacement', () => {
  it('installs one scope per Agent and returns early for the same Agent', () => {
    const agent = fakeAgent('session-1', 'idle')
    const fusion = scopes(() => true)
    fusion.install(agent, binding, 'lead')
    expect(fusion.get(agent)?.binding.taskId).toBe('task-1')
    fusion.install(agent, binding, 'lead')
    expect(fusion.get(agent)?.binding.taskId).toBe('task-1')
  })

  it('replaces a holder this Host no longer runs instead of refusing forever', () => {
    const retired = fakeAgent('session-1', 'running')
    const live = fakeAgent('session-1', 'running')
    // The registry already answers with the new object: the old one is retired.
    const fusion = scopes(agent => agent === live)
    fusion.install(retired, binding, 'lead')
    expect(() => fusion.install(live, binding, 'lead')).not.toThrow()
    expect(fusion.get(retired)).toBeUndefined()
    expect(fusion.get(live)?.binding.taskId).toBe('task-1')
  })

  it('still refuses to replace a scope whose live Agent has not settled', () => {
    const settled = fakeAgent('session-1', 'idle')
    const busy = fakeAgent('session-1', 'running')
    const fusion = scopes(agent => agent === busy)
    fusion.install(busy, binding, 'lead')
    expect(() => fusion.install(settled, binding, 'lead'))
      .toThrow('An existing Fusion scope must settle and detach before replacement')
  })
})
