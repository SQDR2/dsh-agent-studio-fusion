import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The shipped bundle treats the primitive atoms as Host-provided; only their
// presence in the chip matters here, and this checkout links no DOM deps for them.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  PermissionIconReadOnlyRegular: () => null,
  PermissionIconWorkspaceWriteRegular: () => null,
  PermissionIconFullAccessRegular: () => null,
  DiffBlock: () => null,
  TerminalBlock: () => null,
}))
import { Context } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { FusionPermission } from '../src/client/FusionPermission.js'
import type { FusionStatus } from '../src/status.js'
import { pinLanguage } from './client-locale.js'

type Task = NonNullable<FusionStatus['task']>
type Permissions = NonNullable<Task['permissions']>

const base = { id: 'task-1', revision: 1, stage: '执行', detail: null, attention: false, verification: 'unverified' as const,
  workerId: null, models: { lead: { provider: 'p', model: 'lead' }, worker: { provider: 'p', model: 'worker' }, compactor: null },
  usage: { calls: 0, finalCalls: 0, provisionalCalls: 0, unreportedCalls: 0, compactionCalls: 0, keepaliveCalls: 0,
    input: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, cacheRead: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 },
    output: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, actualBilledUsd: null, upstreamHttpCalls: null,
    byRole: { lead: { calls: 0, input: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, cacheRead: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, output: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 } },
      worker: { calls: 0, input: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, cacheRead: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, output: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 } } } },
  automatedChecks: null, requests: [], tools: [], contexts: [], pendingApprovals: 0, unsettledTools: 0 }

function status(permissions?: Permissions, selected = true): FusionStatus {
  return { schemaVersion: 1, sessionId: 's', selected, observedAt: '2026-11-06T00:00:00.000Z',
    ...(permissions && selected ? { task: { ...base, permissions } } : {}) }
}

const roots: ReactTestRenderer[] = []
afterEach(async () => { await act(async () => { roots.forEach(root => root.unmount()) }); roots.length = 0; vi.useRealTimers(); vi.unstubAllGlobals() })

function setup(value: FusionStatus, delay = 0) {
  vi.useFakeTimers()
  const doc = new EventTarget(); Object.assign(doc, { visibilityState: 'visible' }); vi.stubGlobal('document', doc)
  const fetch = vi.fn(async (_url: unknown, { signal }: { signal: AbortSignal }) => {
    if (delay) await new Promise((resolve, reject) => { setTimeout(resolve, delay); signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }) })
    return { ok: true, json: async () => value }
  })
  vi.stubGlobal('fetch', fetch)
  const selection = { current: { provider: 'dsh-fusion', model: 'auto' } }
  const directory = { subscribe: () => () => {}, getSnapshot: () => selection } as unknown as ObservableSnapshot<ModelDirectoryState>
  return { fetch, directory }
}

async function mount(value: FusionStatus, delay = 0) {
  pinLanguage('en-US')
  const { fetch, directory } = setup(value, delay)
  let root!: ReactTestRenderer
  await act(async () => { root = create(React.createElement(FusionPermission, { sessionId: 's', directory, load: () => {} })) })
  roots.push(root)
  return { root, fetch }
}

const text = (root: ReactTestRenderer) => JSON.stringify(root.toJSON())

describe('Fusion permission chip', () => {
  it('names the permission of the role working now', async () => {
    const lead = await mount(status({ lead: 'read-only', worker: 'danger-full-access', active: 'lead' }))
    expect(text(lead.root)).toContain('Lead')
    expect(text(lead.root)).toContain('Read Only')
    await act(async () => { lead.root.unmount() })

    const worker = await mount(status({ lead: 'read-only', worker: 'workspace-write', active: 'worker' }))
    expect(text(worker.root)).toContain('Sidekick')
    expect(text(worker.root)).toContain('Workspace Write')
  })

  it('explains the composer control that reads Custom while Fusion confines the Lead', async () => {
    const { root } = await mount(status({ lead: 'read-only', worker: 'danger-full-access', active: 'worker' }))
    expect(root.root.findByProps({ className: 'fusion-permission' }).props.title)
      .toContain('Lead Read Only, Sidekick Full access')
  })

  it('renders nothing outside a role-separated Fusion task', async () => {
    const notSelected = await mount(status({ lead: 'read-only', worker: 'danger-full-access', active: 'lead' }, false))
    expect(notSelected.root.toJSON()).toBeNull()
    await act(async () => { notSelected.root.unmount() })
    const noIntent = await mount(status())
    expect(noIntent.root.toJSON()).toBeNull()
  })

  it('polls fast while the task runs, so the shown role follows the work', async () => {
    const { fetch, root } = await mount(status({ lead: 'read-only', worker: 'danger-full-access', active: 'lead' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(text(root)).toContain('Lead')
  })
})

describe('Fusion permission chip registration', () => {
  it('mounts additively in the composer tool row and leaves the native permission slot alone', async () => {
    const { apply } = await import('../src/client/index.js')
    const ctx = new Context()
    const injected: string[] = []
    const registered: { name: string; options: Record<string, unknown>; component: unknown }[] = []
    ctx.provide('slots', {
      inject: (name: string, callback: () => unknown) => { injected.push(name); callback(); return () => {} },
      register: (options: Record<string, unknown>, component: unknown) => {
        registered.push({ name: options.name as string, options, component }); return () => {}
      },
    } as never)
    const store = { subscribe: () => () => {}, getSnapshot: () => ({ current: { provider: 'dsh-fusion', model: 'auto' } }) }
    const loads: string[] = []
    ctx.provide('modelDirectories', { directoryFor: (sessionId: string) => ({ store, load: async () => { loads.push(sessionId) } }) } as never)
    apply(ctx)
    await act(async () => { await Promise.resolve() })

    expect(injected).toContain('conversation.input.left')
    expect(injected).not.toContain('conversation.input.permission')
    const entry = registered.find(value => value.name === 'conversation.input.left')
    expect(entry?.options).toMatchObject({ name: 'conversation.input.left', id: 'fusion-permission' })
    expect(typeof entry?.options.order).toBe('number')
    expect(entry?.component).toBe(FusionPermission)
    expect((entry?.options.inject as (sessionId: string) => unknown)('session-1'))
      .toMatchObject({ sessionId: 'session-1', directory: store })
  })
})
