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
const main = (root: ReactTestRenderer, index: number) => rows(root)[index]!.findByProps({ className: 'fusion-combo-main' })
const remove = (root: ReactTestRenderer, index: number) => rows(root)[index]!.findByProps({ className: 'fusion-combo-actions' })
const click = () => ({ stopPropagation: vi.fn() })
const selected = (root: ReactTestRenderer) => rows(root).map(row => row.props['data-active'] === true)

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

    await act(async () => { remove(root, 2).props.onClick(click()) })
    expect(rows(root)).toHaveLength(2)
  })

  it('selects a combo from anywhere on its row, never from the Delete button', async () => {
    pinLanguage('zh-CN')
    stub([])
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    expect(selected(root)).toEqual([true, false])

    // The row is one selection target: the button carries the whole row's padding, not just the text.
    const css = root.root.findAllByType('style').map(node => String(node.children.join(''))).join('\n')
    expect(css).toMatch(/\.fusion-settings \.fusion-combo-main\{[^}]*flex:1 1 auto/)
    expect(css).toMatch(/\.fusion-settings \.fusion-combo-main\{[^}]*padding:11px 12px/)
    expect(css).toMatch(/\.fusion-settings \.fusion-combo-main\{[^}]*background:none/)
    // The row itself no longer carries the click; it only frames the two buttons.
    expect(css).toMatch(/\.fusion-settings \.fusion-combo\{[^}]*padding:0/)

    await act(async () => { main(root, 1).props.onClick() })
    expect(selected(root)).toEqual([false, true])
    expect(main(root, 1).props['aria-pressed']).toBe(true)

    // Delete keeps its own hit area and does not change the selection: the surviving row stays selected.
    await act(async () => { remove(root, 0).props.onClick(click()) })
    expect(rows(root)).toHaveLength(1)
    expect(selected(root)).toEqual([true])
    expect(rows(root)[0]!.findAllByProps({ className: 'fusion-combo-name' })[0]!.children.join('')).toBe('稳')
  })

  it('saves the whole list, keeping the ids the Host already issued', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    stub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Delete the second combo: the remaining one is saved as a full list.
    await act(async () => { remove(root, 1).props.onClick(click()) })
    await act(async () => { button(root, '保存组合').props.onClick() })

    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ action: 'configure', revision: 3, pairs: [{ id: 'auto', name: '快' }] })
  })
})
