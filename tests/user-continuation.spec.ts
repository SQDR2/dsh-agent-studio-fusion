import { afterEach, describe, expect, it } from 'vitest'
import { BindingRepository } from '../src/host/bindings.js'
import { NativeModelControl, explicitContinuation, hardWait, readModelControl, userContinuationWaits } from '../src/host/native-model-control.js'
import { NativeFusionScopes } from '../src/host/native-scopes.js'
import { blockedNoticeText } from '../src/host/coordinator.js'
import { completeProfile } from '../src/profile/resolve.js'
import { SqliteFusionStore } from '../src/task/sqlite-store.js'
import { TaskId } from '../src/contracts.js'

const stores: SqliteFusionStore[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close() })

const prompts = { lead: 'Lead', worker: 'Worker', compact: 'Checkpoint' }
const profile = completeProfile({ id: 'fusion-auto', version: '0.2.0-enforced-v3', enabled: true,
  interactionMode: 'model-like', workflowPolicy: 'enforced-v3',
  lead: { provider: 'configured', model: 'lead' }, worker: { provider: 'configured', model: 'worker' } }, prompts)

const TASK = 'task-a'

function paused(code: string) {
  const store = new SqliteFusionStore(':memory:')
  stores.push(store)
  const bindings = new BindingRepository(store)
  const session = bindings.select('lead-a', TaskId(TASK), { profile, prompts })
  // The control listener is what lifts a pause; keep only the handlers this test drives.
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  const ctx = { on: (event: string, handler: (...args: unknown[]) => void) => {
    handlers.set(event, [...handlers.get(event) ?? [], handler])
    return () => undefined
  } }
  const control = new NativeModelControl(ctx as never, store, {
    owner: () => undefined, resolve: async () => { throw new Error('unused') },
    pause: async () => undefined, resume: async () => undefined, settled: () => true, stopAuxiliary: () => undefined,
  })
  control.failure(session, 'lead', { code, message: code })
  return { store, session, control, fire: (event: unknown) => {
    for (const handler of handlers.get('session/event') ?? []) handler({ id: 'lead-a' }, event)
  } }
}

describe('an explicit user message lifts a paused Lead', () => {
  it('lifts a timeout pause so the same conversation can continue', () => {
    const { store, session, fire } = paused('TIMEOUT')
    // The fixture must survive the frozen-profile round trip the Host reads back.
    expect(session.profile.interactionMode).toBe('model-like')
    expect(readModelControl(store, session)!.waits.lead?.code).toBe('TIMEOUT')
    fire({ type: 'agent/inbox/spliced', seq: 3, data: { inserted: [{ id: 'm1', source: { kind: 'composer-plus-continue' }, content: [] }] } })
    expect(readModelControl(store, session)!.waits.lead).toBeUndefined()
  })

  it('lifts a pause for an ordinary user message, never for another task', () => {
    const { store, session, fire } = paused('TRANSPORT')
    fire({ type: 'user/message', seq: 3, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'continue' }] } })
    expect(readModelControl(store, session)!.waits.lead).toBeUndefined()

    const other = paused('TIMEOUT')
    other.fire({ type: 'agent/inbox/spliced', seq: 3, data: { inserted: [{ id: 's1', source: { kind: 'subagent-settled' }, content: [{ type: 'text', text: 'done' }] }] } })
    expect(readModelControl(other.store, other.session)!.waits.lead?.code).toBe('TIMEOUT')
  })

  it('keeps quota and credential stops until the route changes', () => {
    for (const code of ['QUOTA', 'ACCOUNT_QUOTA', 'INVALID_CREDENTIAL']) {
      const { store, session, fire } = paused(code)
      fire({ type: 'user/message', seq: 3, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'continue' }] } })
      expect(readModelControl(store, session)!.waits.lead?.code).toBe(code)
    }
  })

  it('does not lift a Sidekick pause: that stays behind the bounded Lead recovery', () => {
    const waits = { worker: { taskId: TASK, code: 'TIMEOUT', at: '2026-11-09T06:31:01.581Z', quotaResetAt: null as null } }
    expect(userContinuationWaits(waits, TASK)).toBeUndefined()
  })
})

describe('explicit continuation and the blocked-step notice', () => {
  it('counts only a user-authored or empty message as a human continuation', () => {
    expect(explicitContinuation({ content: [{ type: 'text', text: 'hi' }] })).toBe(true)
    expect(explicitContinuation({ source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] })).toBe(true)
    expect(explicitContinuation({ source: { kind: 'composer-plus-continue' }, content: [] })).toBe(true)
    expect(explicitContinuation({ source: { kind: 'subagent-settled' }, content: [{ type: 'text', text: 'report' }] })).toBe(false)
  })

  it('classifies hard stops by code', () => {
    expect(hardWait('QUOTA')).toBe(true)
    expect(hardWait('INVALID_CREDENTIAL')).toBe(true)
    expect(hardWait('TIMEOUT')).toBe(false)
    expect(hardWait('UNKNOWN')).toBe(false)
  })

  it('names the pause, the role and the control that lifts it, in both languages', () => {
    const text = blockedNoticeText('lead', 'lead is paused (TIMEOUT); use local Fusion controls to continue')
    expect(text).toContain('Lead')
    expect(text).toContain('继续一次')
    expect(text).toContain('Continue once')
    expect(text).toMatch(/TIMEOUT/)
    expect(text).toContain(' / ')
  })
})

describe('a rejected step reports the gate instead of ending silently', () => {
  it('rejects the pre-step and hands the reason to the notice channel', async () => {
    const store = new SqliteFusionStore(':memory:')
    stores.push(store)
    const binding = new BindingRepository(store).select('lead-a', TaskId(TASK), { profile, prompts })
    const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>()
    const scope = {
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(event, [...handlers.get(event) ?? [], handler])
        return () => undefined
      },
      tools: { guard: () => () => undefined, restrict: () => () => undefined, presentAs: () => () => undefined, schemas: () => [] },
      systemPrompt: { section: () => () => undefined },
    }
    const agent = { id: 'lead-a', status: 'idle', ctx: scope, session: {} }
    const notices: { role: string; reason: string }[] = []
    const scopes = new NativeFusionScopes({
      canRequest: () => 'lead is paused (TIMEOUT); use local Fusion controls to continue',
      canExecute: () => undefined, beforeRequest: () => undefined, installTools: () => [],
      blockedNotice: (_agent, _binding, role, reason) => { notices.push({ role, reason }) },
    })
    scopes.install(agent as never, binding, 'lead')
    const preStep = handlers.get('agent/pre-step')![0]! as (payload: unknown, next: () => unknown) => Promise<unknown>
    const decision = await preStep({ agent, messages: [], turn: 2, step: 1, signal: new AbortController().signal },
      () => { throw new Error('a gated step must never reach the next handler') })
    expect(decision).toEqual({ kind: 'reject' })
    expect(notices).toEqual([{ role: 'lead', reason: 'lead is paused (TIMEOUT); use local Fusion controls to continue' }])
  })
})
