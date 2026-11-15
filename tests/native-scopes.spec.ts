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

describe('agent/request route preservation and effort pinning', () => {
  function agentWithEvents(id: string, opts?: { model?: { current(): any; select(s: any): void } }) {
    const handlers = new Map<string, Function[]>()
    const disposer = (): (() => void) => () => {}
    const on = (event: string, handler: Function) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event)!.push(handler)
      return () => {}
    }
    const agent = {
      id,
      status: 'running',
      ctx: {
        tools: { restrict: disposer, presentAs: disposer, guard: disposer, schemas: () => [] },
        on,
        systemPrompt: { section: disposer },
      },
      model: opts?.model,
    } as unknown as Agent
    return { agent, handlers }
  }

  it('preserves reasoning effort in agent/request proposal on 0.2.2', async () => {
    let currentSelection: any = { provider: 'aihub', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' }
    const model = {
      current: () => currentSelection,
      select: (s: any) => { currentSelection = s },
    }
    const { agent, handlers } = agentWithEvents('session-a206402e', { model })
    const fusion = scopes(() => true)
    const effortBinding = {
      ...binding,
      profile: {
        ...binding.profile,
        lead: { provider: 'aihub', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
      },
    } as unknown as SessionBinding

    fusion.install(agent, effortBinding, 'lead')
    const requestHandler = handlers.get('agent/request')?.[0]
    expect(requestHandler).toBeDefined()

    const outcome = await requestHandler!({
      agent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }, async () => ({
      provider: 'aihub',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'high',
    }))

    // In 0.2.2, proposedConfig must match the pinned route, including reasoningEffort
    expect(outcome.provider).toBe('aihub')
    expect(outcome.model).toBe('deepseek-v4.1-flash')
    expect(outcome.reasoningEffort).toBe('high')
  })

  it('preserves reasoning effort in model-like mode on 0.2.2', async () => {
    let currentSelection: any = { provider: 'aihub', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' }
    const model = {
      current: () => currentSelection,
      select: (s: any) => { currentSelection = s },
    }
    const { agent, handlers } = agentWithEvents('session-a206402e', { model })
    const fusion = scopes(() => true)
    const effortBinding = {
      ...binding,
      profile: {
        interactionMode: 'model-like',
        context: { lead: {}, worker: {} },
        lead: { provider: 'aihub', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
      },
    } as unknown as SessionBinding

    fusion.install(agent, effortBinding, 'lead')
    const requestHandler = handlers.get('agent/request')?.[0]
    expect(requestHandler).toBeDefined()

    const outcome = await requestHandler!({
      agent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }, async () => ({
      provider: 'aihub',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'high',
    }))

    expect(outcome.provider).toBe('aihub')
    expect(outcome.model).toBe('deepseek-v4.1-flash')
    expect(outcome.reasoningEffort).toBe('high')
  })

  it('proposes physical route with reasoning effort on 0.2.1 legacy host', async () => {
    const { agent, handlers } = agentWithEvents('session-021')
    const fusion = scopes(() => true)
    const effortBinding = {
      ...binding,
      profile: {
        ...binding.profile,
        lead: { provider: 'aihub', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
      },
    } as unknown as SessionBinding

    fusion.install(agent, effortBinding, 'lead')
    const requestHandler = handlers.get('agent/request')?.[0]
    expect(requestHandler).toBeDefined()

    const outcome = await requestHandler!({
      agent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }, async () => ({
      provider: 'dsh-fusion',
      model: 'combo-1',
    }))

    expect(outcome.provider).toBe('aihub')
    expect(outcome.model).toBe('deepseek-v4.1-flash')
    expect(outcome.reasoningEffort).toBe('high')
  })

  it('throws diagnostic error on 0.2.2 when route was not pinned before step preparation', async () => {
    let currentSelection: any = { provider: 'wrong-provider', model: 'wrong-model' }
    const model = {
      current: () => currentSelection,
      select: (s: any) => { currentSelection = s },
    }
    const { agent, handlers } = agentWithEvents('session-unpinned', { model })
    const fusion = scopes(() => true)
    const effortBinding = {
      ...binding,
      profile: {
        ...binding.profile,
        lead: { provider: 'aihub', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
      },
    } as unknown as SessionBinding

    fusion.install(agent, effortBinding, 'lead')
    const requestHandler = handlers.get('agent/request')?.[0]
    expect(requestHandler).toBeDefined()

    await expect(requestHandler!({
      agent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }, async () => ({
      provider: 'wrong-provider',
      model: 'wrong-model',
    }))).rejects.toThrow('Fusion route was not pinned before step preparation')
  })
})
