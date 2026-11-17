import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The shipped bundle treats the primitive atoms as Host-provided; only their
// presence in the chip matters here, and this checkout links no DOM deps for them.
// The shipped bundle treats the primitive atoms as Host-provided. They still have to be
// inspectable here: a badge that was "preserved" is only preserved if the rendered tree
// carries its text, its tone and its place beside the name.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react')
  const Never = () => null
  const Tag = ({ tone, children }: { tone?: string; children?: unknown }) =>
    createElement('span', { 'data-fusion-tag': '', 'data-tone': tone ?? 'outline' }, children as never)
  return { PermissionIconReadOnlyRegular: Never, PermissionIconWorkspaceWriteRegular: Never,
    PermissionIconFullAccessRegular: Never, Tag, DiffBlock: Never, TerminalBlock: Never }
})
import { Context } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { FusionPermission } from '../src/client/FusionPermission.js'
import { FusionModelLabel, type ComposerModelLabelModel } from '../src/client/FusionModelLabel.js'
import type { FusionStatus } from '../src/status.js'
import { pinLanguage } from './client-locale.js'

type Task = NonNullable<FusionStatus['task']>
type Permissions = NonNullable<Task['permissions']>
type Group = ModelDirectoryState['groups'][number]

const base = { id: 'task-1', revision: 1, stage: '执行', detail: null, attention: false, verification: 'unverified' as const,
  workerId: null, models: { lead: { provider: 'p', model: 'lead' }, worker: { provider: 'p', model: 'worker' }, compactor: null },
  usage: { calls: 0, finalCalls: 0, provisionalCalls: 0, unreportedCalls: 0, compactionCalls: 0, keepaliveCalls: 0,
    input: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, cacheRead: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 },
    output: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, actualBilledUsd: null, upstreamHttpCalls: null,
    byRole: { lead: { calls: 0, input: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, cacheRead: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, output: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 } },
      worker: { calls: 0, input: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, cacheRead: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 }, output: { knownTokens: 0, reportedRequests: 0, totalRequests: 0 } } } },
  automatedChecks: null, requests: [], tools: [], contexts: [], pendingApprovals: 0, unsettledTools: 0 }

function status(permissions?: Permissions, selected = true, models?: Task['models']): FusionStatus {
  return { schemaVersion: 1, sessionId: 's', selected, observedAt: '2026-11-06T00:00:00.000Z',
    ...(selected ? { selection: { provider: 'dsh-fusion', model: 'pair-abc123' } } : {}),
    ...(permissions && selected ? { task: { ...base, ...(models ? { models } : {}), permissions } } : {}) }
}

const roots: ReactTestRenderer[] = []
afterEach(async () => { await act(async () => { roots.forEach(root => root.unmount()) }); roots.length = 0; vi.useRealTimers(); vi.unstubAllGlobals() })

function setup(value: FusionStatus, delay = 0, current: ModelDirectoryState['current'] = { provider: 'dsh-fusion', model: 'auto' },
  groups: readonly Group[] = []) {
  vi.useFakeTimers()
  const doc = new EventTarget(); Object.assign(doc, { visibilityState: 'visible' }); vi.stubGlobal('document', doc)
  const fetch = vi.fn(async (_url: unknown, { signal }: { signal: AbortSignal }) => {
    if (delay) await new Promise((resolve, reject) => { setTimeout(resolve, delay); signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }) })
    return { ok: true, json: async () => value }
  })
  vi.stubGlobal('fetch', fetch)
  const selection = { current, groups }
  const directory = { subscribe: () => () => {}, getSnapshot: () => selection } as unknown as ObservableSnapshot<ModelDirectoryState>
  return { fetch, directory }
}

async function mount(value: FusionStatus, delay = 0, current?: ModelDirectoryState['current'], groups?: readonly Group[]) {
  pinLanguage('en-US')
  const { fetch, directory } = setup(value, delay, current, groups)
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

  it('names the model of the role working now beside its permission', async () => {
    const models: Task['models'] = { lead: { provider: 'gz', model: 'gpt-6.1-sol' },
      worker: { provider: 'gz', model: 'deepseek-v4.1-flash' }, compactor: null }
    const groups: Group[] = [{ id: 'gz', name: 'Antigravity', models: [
      { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol' }, { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }] }]
    const { root } = await mount(status({ lead: 'read-only', worker: 'danger-full-access', active: 'worker' }, true, models),
      0, { provider: 'dsh-fusion', model: 'auto' }, groups)
    const rendered = text(root)
    expect(rendered).toContain('Sidekick')
    expect(rendered).toContain('DeepSeek V4.1 Flash')
    expect(rendered).toContain('Full access')
  })

  it('falls back to the exact model id when the catalog names no such route', async () => {
    const models: Task['models'] = { lead: { provider: 'gz', model: 'gpt-6.1-sol' },
      worker: { provider: 'gz', model: 'deepseek-v4.1-flash' }, compactor: null }
    const { root } = await mount(status({ lead: 'read-only', worker: 'danger-full-access', active: 'lead' }, true, models))
    expect(text(root)).toContain('gpt-6.1-sol')
  })

  it('stays visible while a pinned turn makes the pair Lead the composer selection', async () => {
    // Requirement: 原本是权限变为custom, 在对应的lead、sidekick干活的时候，custom旁边会展示
    // 是什么模型什么权限，现在没了 — the chip read the composer's selection, which a pin
    // replaces with the physical route, so it vanished for the whole running turn.
    const { root } = await mount(status({ lead: 'read-only', worker: 'danger-full-access', active: 'lead' }),
      0, { provider: 'gz', model: 'gpt-6.1-sol' })
    expect(text(root)).toContain('Lead')
    expect(text(root)).toContain('Read Only')
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

describe('Fusion model label', () => {
  const comboName = 'Fusion · 6.1 --> Gemini 3.8 --> V4.1 Flash'
  const combo = { provider: 'dsh-fusion', model: 'pair-abc123' }
  const groups: Group[] = [
    { id: 'dsh-fusion', name: 'Fusion', models: [{ id: 'pair-abc123', name: comboName }] },
    { id: 'gz', name: 'Antigravity', models: [
      { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol' }, { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
      { id: 'claude-9', name: 'Claude 9' }] },
  ]
  const models: Task['models'] = { lead: { provider: 'gz', model: 'gpt-6.1-sol' },
    worker: { provider: 'gz', model: 'deepseek-v4.1-flash' }, compactor: null }
  // The badge rides the owner's own entry (the catalog type this checkout publishes has no
  // such field yet); the label must render it instead of replacing it.
  const physical = { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', badge: { text: { en: 'Beta' }, tone: 'info' as const } }

  /** Read the rendered tree as one string: `[badge]` for a Tag, `|` between children. */
  const flat = (node: unknown): string => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(flat).join('|')
    return `[${((node as { children?: unknown[] }).children ?? []).map(flat).join('|')}]`
  }

  async function mountLabel(value: FusionStatus, placement: 'trigger' | 'menu' | 'option', selected: boolean,
    model: ComposerModelLabelModel = physical, lang: 'en-US' | 'zh-CN' = 'en-US') {
    pinLanguage(lang)
    const { directory } = setup(value, 0, { provider: 'gz', model: 'gpt-6.1-sol' }, groups)
    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(FusionModelLabel, {
        sessionId: 's', directory, load: () => {}, provider: { id: 'gz', name: 'Antigravity' }, model, placement, selected,
      }))
    })
    roots.push(root)
    return root
  }

  const pinned = (permissions?: Permissions, taskModels: Task['models'] = models) =>
    status(permissions ?? { lead: 'read-only', worker: 'danger-full-access', active: 'lead' }, true, taskModels)

  it('names the bound combo on the trigger while the physical route is pinned', async () => {
    expect(flat((await mountLabel(pinned(), 'trigger', true)).toJSON())).toBe(`[${comboName}]`)
  })

  it('names the bound combo in the root menu value too', async () => {
    expect(flat((await mountLabel(pinned(), 'menu', true)).toJSON())).toBe(`[${comboName}]`)
  })

  it('keeps every option row on the model it would select, badge and all', async () => {
    // The pin does not move the rows: a row names the model it would select, in the owner's
    // order (name first in a menu/option, then the badge, with the separating space).
    expect(flat((await mountLabel(pinned(), 'option', true)).toJSON())).toBe('GPT 6.1 Sol| |[Beta]')
  })

  it('puts the badge before the name on the trigger and after it in the menu, as the owner does', async () => {
    const off = status(undefined, false)
    expect(flat((await mountLabel(off, 'trigger', true)).toJSON())).toBe('[Beta]| |GPT 6.1 Sol')
    await act(async () => { roots.forEach(root => root.unmount()); roots.length = 0 })
    expect(flat((await mountLabel(off, 'menu', true)).toJSON())).toBe('GPT 6.1 Sol| |[Beta]')
  })

  it('localizes the badge text and keeps the entry\'s tone', async () => {
    const localized = { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', badge: { text: { en: 'Beta', zh: '测试版' }, tone: 'success' as const } }
    const root = await mountLabel(status(undefined, false), 'trigger', true, localized, 'zh-CN')
    expect(flat(root.toJSON())).toBe('[测试版]| |GPT 6.1 Sol')
    expect(JSON.stringify(root.toJSON())).toContain('"data-tone":"success"')
    expect(JSON.stringify(root.toJSON())).not.toContain('Beta')
  })

  it('adds no badge to an entry that carries none', async () => {
    const plain = { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }
    const root = await mountLabel(status(undefined, false), 'trigger', true, plain)
    expect(flat(root.toJSON())).toBe('DeepSeek V4.1 Flash')
    expect(JSON.stringify(root.toJSON())).not.toContain('data-fusion-tag')
  })

  it('shows a model the pair does not answer on at once, even while the status still reports the task', async () => {
    // A user switch that the poll has not caught up with yet: `selected` is still true and the
    // task still lists the pair's routes, but this row is not one of them.
    const root = await mountLabel(pinned(), 'trigger', true, { id: 'claude-9', name: 'Claude 9' })
    expect(flat(root.toJSON())).toBe('Claude 9')
  })

  it('leaves the combo row itself alone once the combo is the recorded selection again', async () => {
    // The owner is already naming the combo, so no override is involved.
    const root = await mountLabel(pinned(), 'trigger', true, { id: combo.model, name: comboName }, 'en-US')
    // The catalog row here has no badge, and nothing rewrites it.
    expect(flat(root.toJSON())).toBe(comboName)
    expect(JSON.stringify(root.toJSON())).not.toContain('data-fusion-combo')
  })
})

describe('Fusion composer registrations', () => {
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

  it('contributes the inline model label through the owner\'s own slot', async () => {
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
    const store = { subscribe: () => () => {}, getSnapshot: () => ({ current: null }) }
    ctx.provide('modelDirectories', { directoryFor: () => ({ store, load: async () => {} }) } as never)
    apply(ctx)
    await act(async () => { await Promise.resolve() })

    expect(injected).toContain('conversation.input.model.label')
    const entry = registered.find(value => value.name === 'conversation.input.model.label')
    expect(entry?.component).toBe(FusionModelLabel)
    expect((entry?.options.inject as (sessionId: string) => unknown)('session-1'))
      .toMatchObject({ sessionId: 'session-1', directory: store })
  })
})

describe('live status shows the Foreman review state', () => {
  const withReview = (planReview: NonNullable<Task['planReview']>): FusionStatus => ({
    schemaVersion: 1, sessionId: 's', selected: true, observedAt: '2026-11-06T00:00:00.000Z',
    task: { ...base, planReview },
  })

  async function mountStatus(value: FusionStatus) {
    pinLanguage('zh-CN')
    const { default: ReactDefault } = await import('react')
    const { FusionStatus: StatusComponent } = await import('../src/client/FusionStatus.js')
    const doc = new EventTarget(); Object.assign(doc, { visibilityState: 'visible' }); vi.stubGlobal('document', doc)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => value })))
    let root!: ReactTestRenderer
    await act(async () => { root = create(ReactDefault.createElement(StatusComponent, { sessionId: 's' })) })
    roots.push(root)
    return root
  }

  it('shows reviewing, ready, concerns and unavailable, with the reason and unanswered findings', async () => {
    const reviewing = await mountStatus(withReview({ status: 'reviewing', round: 1 }))
    expect(JSON.stringify(reviewing.toJSON())).toContain('审查中')
    await act(async () => { reviewing.unmount() })

    const concerns = await mountStatus(withReview({ status: 'concerns', round: 1, policy: 'gate',
      findings: [{ id: 'f-1', category: 'acceptance-gap', severity: 'blocking-concern', message: 'no oracle' }] }))
    const concernsText = JSON.stringify(concerns.toJSON())
    expect(concernsText).toContain('有分歧')
    expect(concernsText).toContain('第 1 轮')
    expect(concernsText).toContain('no oracle')
    // The reviewer's prompt must never reach a status poll.
    expect(concernsText).not.toContain('independent plan auditor')
    await act(async () => { concerns.unmount() })

    const unavailable = await mountStatus(withReview({ status: 'unavailable', round: 1, unavailableReason: 'provider timed out' }))
    const unavailableText = JSON.stringify(unavailable.toJSON())
    expect(unavailableText).toContain('不可用')
    expect(unavailableText).toContain('provider timed out')
  })
})
