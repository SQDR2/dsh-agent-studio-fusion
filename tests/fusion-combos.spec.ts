import React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import { FusionSettings } from '../src/client/FusionSettings.js'
import { pinLanguage } from './client-locale.js'
import { FOREMAN_DEFAULT_TIMEOUT_MS } from '../src/profile/foreman.js'

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

/** A Host that stores exactly what it was sent, issuing an id to every new row. */
function echoStub(posts: unknown[]) {
  let saved: unknown
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body ?? '{}') as { pairs: { id?: string }[] }
      posts.push(body)
      let issued = 0
      saved = { ...settings(), revision: 4, pairs: body.pairs.map(item => ({ ...item, id: item.id ?? `pair-new${++issued}`, authorized: true })) }
      return { ok: true, json: async () => ({ ok: true, revision: 4 }) }
    }
    if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
    if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0,
      totals: { calls: 0, final: 0, provisional: 0, unreported: 0, input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 }, reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } },
      tasks: [], groups: [] }) }
    return { ok: true, json: async () => saved ?? settings() }
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

  // The save re-reads the whole list from the Host. Resetting the selection to the first
  // row dropped the user out of the combo they had just edited, which reads as "the save
  // replaced my combo": the row on screen changed and the one they saved was not visible.
  it('keeps the combo the user was editing selected after a successful save', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    echoStub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Edit the second combo, not the first: the first row is the one the old bug fell back to.
    await act(async () => { main(root, 1).props.onClick() })
    await act(async () => { nameInput(root).props.onChange({ target: { value: '稳二号' } }) })
    await act(async () => { button(root, '保存组合').props.onClick() })

    expect(posts).toHaveLength(1)
    expect((posts[0] as any).pairs[1]).toMatchObject({ id: 'pair-a1b2c3d4', name: '稳二号' })
    // Still on the saved row, and its editor shows what was saved.
    expect(selected(root)).toEqual([false, true])
    expect(nameInput(root).props.value).toBe('稳二号')
  })

  // A row that has never been saved carries no id: the Host issues one in the reply, so the
  // selection falls back to the position that row was saved at instead of jumping to the top.
  it('stays on a newly added combo after the Host issues it an id', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    echoStub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    await act(async () => { button(root, '新增组合').props.onClick() })
    const model = (role: string) => root.root.findAllByProps({ 'aria-label': `${role} 模型` })[0]!
    await act(async () => { model('Lead').props.onChange({ target: { value: JSON.stringify(['llm-deepseek', 'deepseek-v4']) } }) })
    await act(async () => { model('Sidekick').props.onChange({ target: { value: JSON.stringify(['llm-deepseek', 'deepseek-v4-mini']) } }) })
    await act(async () => { button(root, '保存组合').props.onClick() })

    expect(posts).toHaveLength(1)
    expect((posts[0] as any).pairs[2]).not.toHaveProperty('id')
    expect(selected(root)).toEqual([false, false, true])
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

  it('configures optional foreman with model requirement and token/timeout limits, and no policy', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    stub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Initially, foreman is disabled
    const foremanCheckbox = root.root.findByProps({ 'aria-label': '启用工长审查' })
    expect(foremanCheckbox.props.checked).toBe(false)
    expect(root.root.findAllByProps({ 'aria-label': '工长输出 Token 上限' })).toHaveLength(0)

    // Toggle foreman on
    await act(async () => { foremanCheckbox.props.onChange({ target: { checked: true } }) })
    expect(root.root.findAllByProps({ 'aria-label': '工长输出 Token 上限' })).toHaveLength(1)
    // A configured Foreman reviews every plan, so there is no policy control to pick.
    expect(root.root.findAllByProps({ 'aria-label': '工长审查策略' })).toHaveLength(0)

    // Change tokens and timeout
    const tokenInput = root.root.findByProps({ 'aria-label': '工长输出 Token 上限' })
    await act(async () => { tokenInput.props.onChange({ target: { value: '2048' } }) })
    const timeoutInput = root.root.findByProps({ 'aria-label': '工长超时毫秒' })
    await act(async () => { timeoutInput.props.onChange({ target: { value: '15000' } }) })

    // Save with valid foreman configuration
    await act(async () => { button(root, '保存组合').props.onClick() })
    expect(posts).toHaveLength(1)
    expect((posts[0] as any).action).toBe('configure')
    expect((posts[0] as any).pairs[0].pair.foreman).toEqual({
      route: pair('deepseek-v4').lead,
      maxOutputTokens: 2048,
      timeoutMs: 15000,
    })

    // Toggle foreman off: pair.foreman is deleted
    await act(async () => { foremanCheckbox.props.onChange({ target: { checked: false } }) })
    expect(root.root.findAllByProps({ 'aria-label': '工长输出 Token 上限' })).toHaveLength(0)

    posts.length = 0
    await act(async () => { button(root, '保存组合').props.onClick() })
    expect(posts).toHaveLength(1)
    expect((posts[0] as any).pairs[0].pair).not.toHaveProperty('foreman')
  })

  // A review that finds many problems must still fit its output budget, and a slow reviewer
  // must be allowed to finish: 4096 tokens and 30 seconds turned real reviews into
  // `max-tokens` and `TimeoutError` discards, and every policy reads a discard as approval.
  it('starts a new Foreman at a budget and timeout a real review can finish within', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    stub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    await act(async () => { root.root.findByProps({ 'aria-label': '启用工长审查' }).props.onChange({ target: { checked: true } }) })
    expect(root.root.findByProps({ 'aria-label': '工长输出 Token 上限' }).props.value).toBe(16384)
    expect(root.root.findByProps({ 'aria-label': '工长超时毫秒' }).props.value).toBe(FOREMAN_DEFAULT_TIMEOUT_MS)

    await act(async () => { button(root, '保存组合').props.onClick() })
    expect(root.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
    expect((posts[0] as any).pairs[0].pair.foreman).toMatchObject({ maxOutputTokens: 16384, timeoutMs: FOREMAN_DEFAULT_TIMEOUT_MS })
  })

  // A five-minute review timeout was refused with one sentence that listed the
  // model, the output limit and the timeout together, so the page could not say
  // that a single number was out of range.
  it('saves a multi-minute review timeout instead of failing without a reason', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    stub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    await act(async () => { root.root.findByProps({ 'aria-label': '启用工长审查' }).props.onChange({ target: { checked: true } }) })
    await act(async () => { root.root.findByProps({ 'aria-label': '工长超时毫秒' }).props.onChange({ target: { value: '300000' } }) })

    // Nothing is flagged, and the value survives the save unchanged.
    expect(root.root.findAllByProps({ className: 'fusion-field-error' })).toHaveLength(0)
    await act(async () => { button(root, '保存组合').props.onClick() })
    expect(root.root.findAllByProps({ role: 'alert' })).toHaveLength(0)
    expect(posts).toHaveLength(1)
    expect((posts[0] as any).pairs[0].pair.foreman.timeoutMs).toBe(300000)
  })

  it('flags an out-of-range field while typing and refuses to save it', async () => {
    pinLanguage('zh-CN')
    const posts: unknown[] = []
    stub(posts)
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    await act(async () => { root.root.findByProps({ 'aria-label': '启用工长审查' }).props.onChange({ target: { checked: true } }) })
    await act(async () => { root.root.findByProps({ 'aria-label': '工长超时毫秒' }).props.onChange({ target: { value: '1000000' } }) })

    // The field itself is marked, and the message names the field, its range and the value.
    const timeoutInput = root.root.findByProps({ 'aria-label': '工长超时毫秒' })
    expect(timeoutInput.props['aria-invalid']).toBe(true)
    const inline = root.root.findAllByProps({ className: 'fusion-field-error' }).map(node => String(node.children.join('')))
    expect(inline.join(' ')).toContain('超时')
    expect(inline.join(' ')).toContain('1000000')

    await act(async () => { button(root, '保存组合').props.onClick() })
    expect(posts).toHaveLength(0)
    const alert = root.root.findAllByProps({ role: 'alert' }).map(node => String(node.children.join(''))).join(' ')
    expect(alert).toContain('工长超时')
    expect(alert).toContain('1000000')

    // Correcting it clears the flag and lets the save through.
    await act(async () => { root.root.findByProps({ 'aria-label': '工长超时毫秒' }).props.onChange({ target: { value: '30000' } }) })
    expect(root.root.findAllByProps({ className: 'fusion-field-error' })).toHaveLength(0)
    await act(async () => { button(root, '保存组合').props.onClick() })
    expect(posts).toHaveLength(1)
  })

  // The page re-reads the saved list after a save and again when it is reopened,
  // so a Foreman the Host stores but does not hand back looks like "I enabled it
  // and it disappeared". This drives exactly that round trip.
  it('shows the Foreman again after reopening the page on a saved combo', async () => {
    pinLanguage('zh-CN')
    const foreman = { route: { provider: 'pi-anthropic', model: 'claude-opus-5' }, maxOutputTokens: 2048, timeoutMs: 15000 }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return { ok: true, json: async () => ({ ok: true, revision: 4 }) }
      if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
      if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0,
        totals: { calls: 0, final: 0, provisional: 0, unreported: 0, input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 }, reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } },
        tasks: [], groups: [] }) }
      // What the Host returns once it keeps the foreman through its own read.
      return { ok: true, json: async () => ({ ...settings(), pairs: [
        { id: 'auto', name: '快', pair: { ...pair('deepseek-v4'), foreman }, authorized: true },
      ] }) }
    }))

    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // The saved Foreman is on, configured and visible without the user re-entering it.
    expect(root.root.findByProps({ 'aria-label': '启用工长审查' }).props.checked).toBe(true)
    expect(root.root.findByProps({ 'aria-label': '工长输出 Token 上限' }).props.value).toBe(2048)
    expect(root.root.findByProps({ 'aria-label': '工长超时毫秒' }).props.value).toBe(15000)
    // The closed-state row already names the model, so the combo list is not silent about it.
    expect(JSON.stringify(root.toJSON())).toContain('Claude Opus 5')
    expect(JSON.stringify(root.toJSON())).toContain('工长：')
  })
})
