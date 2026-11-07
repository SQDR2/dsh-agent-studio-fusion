import React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import { FusionSettings } from '../src/client/FusionSettings.js'
import { pinLanguage } from './client-locale.js'

const roots: ReactTestRenderer[] = []
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()) })
  vi.unstubAllGlobals()
})

const catalog = { groups: [
  { id: 'llm-deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-v4', name: 'DeepSeek V4' }, { id: 'deepseek-v4-mini', name: 'DeepSeek V4 Mini' }] },
  { id: 'pi-anthropic', name: 'Anthropic', models: [{ id: 'claude-opus-5', name: 'Claude Opus 5' }] },
] }
const pair = (lead: string) => ({ lead: { provider: 'llm-deepseek', model: lead }, worker: { provider: 'llm-deepseek', model: 'deepseek-v4-mini' } })
const settings = () => ({
  revision: 3, catalog, maxPairs: 6, authorized: true, policy: 'model-like', managedAuthorization: false,
  pairs: [
    { id: 'auto', name: '快', pair: pair('deepseek-v4'), authorized: true },
    { id: 'pair-a1b2c3d4', name: '稳', pair: pair('deepseek-v4'), authorized: true },
  ],
})

function stub(posts: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(init.body ?? '{}'))
      return { ok: true, json: async () => ({ ok: true, revision: 4 }) }
    }
    if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
    if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0,
      totals: { calls: 0, final: 0, provisional: 0, unreported: 0, input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 }, reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } },
      tasks: [], groups: [] }) }
    return { ok: true, json: async () => settings() }
  }))
}

const rows = (root: ReactTestRenderer) => root.root.findAllByProps({ className: 'fusion-combo' })
const button = (root: ReactTestRenderer, label: string) => root.root.findAllByType('button')
  .find(node => String(node.children.join('')).includes(label))!
const nameInput = (root: ReactTestRenderer) => root.root.findAllByType('input').find(node => node.props.type === 'text')!

describe('FusionSettings combo list', () => {
  it('lists every saved combo and lets one be added, renamed and removed', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    stub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    expect(rows(root).map(row => row.findAllByProps({ className: 'fusion-combo-name' })[0]!.children.join(''))).toEqual(['快', '稳'])

    await act(async () => { button(root, '新增组合').props.onClick() })
    expect(rows(root)).toHaveLength(3)

    await act(async () => { nameInput(root).props.onChange({ target: { value: '便宜' } }) })
    expect(rows(root)[2]!.findAllByProps({ className: 'fusion-combo-name' })[0]!.children.join('')).toBe('便宜')

    // Saving an incomplete row explains which one is wrong instead of writing.
    await act(async () => { button(root, '保存组合').props.onClick() })
    expect(root.root.findAllByProps({ role: 'alert' })[0]!.children.join('')).toContain('第 3 个组合')
    expect(posts).toHaveLength(0)

    await act(async () => { rows(root)[2]!.findAllByType('button').find(node => String(node.children.join('')) === '删除')!.props.onClick() })
    expect(rows(root)).toHaveLength(2)
  })

  it('saves the whole list, keeping the ids the Host already issued', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    stub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Delete the second combo: the remaining one is saved as a full list.
    await act(async () => { rows(root)[1]!.findAllByType('button').find(node => String(node.children.join('')) === '删除')!.props.onClick() })
    await act(async () => { button(root, '保存组合').props.onClick() })

    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ action: 'configure', revision: 3, pairs: [{ id: 'auto', name: '快' }] })
  })

  it('flags a saved route the catalog dropped and refuses to save until it is replaced', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    // A provider renamed after the combo was saved: the route is still stored,
    // but the catalog no longer offers it.
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(init.body ?? '{}'))
        return { ok: true, json: async () => ({ ok: true, revision: 4 }) }
      }
      if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
      if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0,
        totals: { calls: 0, final: 0, provisional: 0, unreported: 0, input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 }, reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } },
        tasks: [], groups: [] }) }
      return { ok: true, json: async () => ({ ...settings(), pairs: [
        { id: 'auto', name: '快', pair: pair('deepseek-v4'), authorized: true },
        { id: 'pair-a1b2c3d4', name: '稳', authorized: false,
          pair: { lead: { provider: 'pi-anthropic-old', model: 'claude-opus-5' }, worker: pair('deepseek-v4').worker } },
      ] }) }
    }))
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // The stale row is marked in the list, and its route stays readable rather
    // than silently collapsing to the "choose a model" placeholder.
    expect(rows(root)[1]!.findAllByProps({ className: 'fusion-combo-stale' })).toHaveLength(1)
    expect(rows(root)[0]!.findAllByProps({ className: 'fusion-combo-stale' })).toHaveLength(0)
    expect(rows(root)[1]!.findAllByProps({ className: 'fusion-combo-routes' })[0]!.children.join('')).toContain('pi-anthropic-old/claude-opus-5')

    // Saving names the combo and the exact route, and writes nothing.
    await act(async () => { button(root, '保存组合').props.onClick() })
    const alert = root.root.findAllByProps({ role: 'alert' }).map(node => node.children.join('')).join(' ')
    expect(alert).toContain('第 2 个组合')
    expect(alert).toContain('稳')
    expect(alert).toContain('pi-anthropic-old/claude-opus-5')
    expect(posts).toHaveLength(0)
  })
})
