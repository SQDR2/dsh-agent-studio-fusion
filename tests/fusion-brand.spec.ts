import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
// The shipped bundle treats the primitive atoms as Host-provided; this checkout
// links no DOM deps for them, so stand them in (same approach as
// tests/agy-activity.spec.ts) and assert on the page's own structure.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  DiffBlock: () => null,
  TerminalBlock: () => null,
  PermissionIconWorkspaceWriteRegular: () => null,
}))
import { FusionSettings } from '../src/client/FusionSettings.js'
import { FUSION_SIDEBAR_LABEL, STUDIO_TITLE } from '../src/client/studio-brand.js'
import { pinLanguage } from './client-locale.js'

const roots: ReactTestRenderer[] = []
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()) })
  vi.unstubAllGlobals()
})

const catalog = { groups: [
  { id: 'llm-deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-v4', name: 'DeepSeek V4' }, { id: 'deepseek-v4-mini', name: 'DeepSeek V4 Mini' }] },
] }
const settings = () => ({
  revision: 3, catalog, maxPairs: 6, authorized: true, policy: 'model-like', managedAuthorization: false,
  pairs: [{ id: 'auto', name: '快', pair: { lead: { provider: 'llm-deepseek', model: 'deepseek-v4' }, worker: { provider: 'llm-deepseek', model: 'deepseek-v4-mini' } }, authorized: true }],
})

/** Every request resolves; the AGY console's own status poll gets a dormant payload. */
function stub() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/plugins/agy-worker/status')) {
      return { ok: true, json: async () => ({ plugin: 'dsh-fusion', bin: null, version: null, enabled: false,
        permissionMode: 'skip', auth: { phase: 'idle' }, poolAuth: { phase: 'idle' }, pool: { accounts: [] },
        catalog: { source: 'fallback', count: 0, lastError: null }, catalogModels: [], hiddenModels: [], lastRun: null }) }
    }
    if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
    if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0,
      totals: { calls: 0, final: 0, provisional: 0, unreported: 0, input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 }, reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } },
      tasks: [], groups: [] }) }
    return { ok: true, json: async () => settings() }
  }))
}

async function render(): Promise<ReactTestRenderer> {
  pinLanguage('en-US')
  stub()
  let root!: ReactTestRenderer
  await act(async () => { root = create(React.createElement(FusionSettings)) })
  roots.push(root)
  return root
}

const nav = (root: ReactTestRenderer) => root.root.findByType('nav')
const navButtons = (root: ReactTestRenderer) => nav(root).findAllByType('button')
const sectionFor = (root: ReactTestRenderer, name: string) => root.root.findByProps({ id: `fusion-section-${name}` })
const settled = async (run: () => void) => { await act(async () => { run() }) }

describe('the combined studio page', () => {
  it('titles the page with the product name and keeps the sidebar row short', async () => {
    const root = await render()
    expect(STUDIO_TITLE).toBe('DSH Agent Studio With Fusion')
    expect(FUSION_SIDEBAR_LABEL).toBe('Fusion')

    const headings = root.root.findAllByType('h2').map(node => String(node.children.join('')))
    expect(headings).toEqual(['DSH Agent Studio With Fusion'])
  })

  it('offers three labelled section buttons with aria-pressed, not a tablist', async () => {
    const root = await render()
    // A button group: it must not claim tab semantics it does not implement.
    expect(nav(root).props['aria-label']).toBe('Page sections')
    expect(root.root.findAllByProps({ role: 'tablist' })).toEqual([])
    expect(root.root.findAllByProps({ role: 'tab' })).toEqual([])

    const buttons = navButtons(root)
    expect(buttons.map(button => String(button.children.join('')))).toEqual(['Fusion combos', 'Antigravity', 'ACP routes'])
    expect(buttons.map(button => button.props['aria-pressed'])).toEqual([true, false, false])
    // Every target the buttons name must actually exist in the document, whether or
    // not that section is the visible one: a dangling aria-controls is a broken
    // reference for assistive tech.
    expect(buttons.map(button => button.props['aria-controls']))
      .toEqual(['fusion-section-fusion', 'fusion-section-antigravity', 'fusion-section-acp'])
    for (const target of buttons.map(button => button.props['aria-controls'] as string)) {
      expect(root.root.findAllByProps({ id: target })).toHaveLength(1)
    }
  })

  it('defaults to the Fusion section and switches on click', async () => {
    const root = await render()
    // Exactly one section is visible at a time; the others exist but are hidden.
    const visible = () => (['fusion', 'antigravity', 'acp'] as const)
      .filter(name => sectionFor(root, name).props.hidden === false)
    expect(visible()).toEqual(['fusion'])

    await settled(() => { navButtons(root)[1]!.props.onClick() })
    expect(navButtons(root).map(button => button.props['aria-pressed'])).toEqual([false, true, false])
    expect(visible()).toEqual(['antigravity'])

    await settled(() => { navButtons(root)[2]!.props.onClick() })
    expect(visible()).toEqual(['acp'])
    expect(root.root.findAllByProps({ id: 'acp-guide-title' })).toHaveLength(1)

    // And `aria-controls` keeps resolving as the selection moves.
    for (const target of navButtons(root).map(button => button.props['aria-controls'] as string)) {
      expect(root.root.findAllByProps({ id: target })).toHaveLength(1)
    }
  })

  it('mounts the AGY console only while Antigravity is selected', async () => {
    const root = await render()
    // The region exists (its aria-controls target), but its contents do not: the
    // console polls every 3s, so an unvisited section must not pay for it.
    expect(sectionFor(root, 'antigravity').props.hidden).toBe(true)
    expect(sectionFor(root, 'antigravity').findAllByProps({ className: 'agy-console' })).toEqual([])
    expect(JSON.stringify(root.toJSON())).not.toContain('agy-console')
    const statusCallsBefore = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter(call => String(call[0]).includes('/plugins/agy-worker/status'))
    expect(statusCallsBefore).toHaveLength(0)

    await settled(() => { navButtons(root)[1]!.props.onClick() })
    expect(sectionFor(root, 'antigravity').findAllByProps({ className: 'agy-console' }).length).toBeGreaterThan(0)

    // Leaving the section unmounts the console again, so its poll stops, while the
    // region itself stays as the nav's target.
    await settled(() => { navButtons(root)[0]!.props.onClick() })
    expect(sectionFor(root, 'antigravity').props.hidden).toBe(true)
    expect(sectionFor(root, 'antigravity').findAllByProps({ className: 'agy-console' })).toEqual([])
    expect(JSON.stringify(root.toJSON())).not.toContain('agy-console')
  })

  it('mounts the ACP guide only while its section is selected', async () => {
    const root = await render()
    expect(sectionFor(root, 'acp').props.hidden).toBe(true)
    expect(sectionFor(root, 'acp').findAllByProps({ id: 'acp-guide-title' })).toEqual([])

    await settled(() => { navButtons(root)[2]!.props.onClick() })
    expect(sectionFor(root, 'acp').props.hidden).toBe(false)
    expect(sectionFor(root, 'acp').findAllByProps({ id: 'acp-guide-title' })).toHaveLength(1)
  })

  it('preserves unsaved combos and the selected row across section changes', async () => {
    const root = await render()
    const rows = () => root.root.findAllByProps({ className: 'fusion-combo' })
    const addButton = () => root.root.findAllByType('button')
      .find(node => String(node.children.join('')).includes('+ Add combo'))!

    // Unsaved work: one added row, renamed, then selected.
    await settled(() => { addButton().props.onClick() })
    const nameInput = root.root.findAllByType('input').find(node => node.props.type === 'text')!
    await settled(() => { nameInput.props.onChange({ target: { value: '未保存的组合' } }) })
    expect(rows()).toHaveLength(2)

    await settled(() => { navButtons(root)[1]!.props.onClick() })
    await settled(() => { navButtons(root)[0]!.props.onClick() })

    // The draft survived the round trip: same row count, same unsaved name.
    expect(rows()).toHaveLength(2)
    expect(rows()[1]!.findAllByProps({ className: 'fusion-combo-name' })[0]!.children.join('')).toBe('未保存的组合')
    expect(rows()[1]!.props['data-active']).toBe(true)
  })

  it('keeps the pairing explanation inside the Fusion section', async () => {
    const root = await render()
    const header = root.root.findByProps({ className: 'fusion-settings' }).findByType('header')
    // Render the header's own paragraph text, without touching the sections below it.
    const headerText = header.findAllByType('p').map(node => String(node.children.join(''))).join('\n')
    // The page header describes the combined workspace, not one section's tips.
    expect(headerText).toContain('One plugin for three capabilities')
    expect(header.findAllByType('b')).toEqual([])

    // The tip stayed with the combos it is about, where the `<b>` lead-in lives.
    const fusionSection = sectionFor(root, 'fusion')
    expect(fusionSection.findAllByType('b').map(node => String(node.children.join('')))).toEqual(['Pairing tip'])
    expect(fusionSection.findAllByType('p').map(node => String(node.children.join(''))).join('\n'))
      .toContain('Fusion saves money because the Sidekick is much cheaper than the Lead')
  })
})

describe('product metadata and the single plugin entry', () => {
  /** A slot registry double: records registrations, so `apply` can be driven headlessly. */
  function slotDouble() {
    const entries: { name: string; options: Record<string, unknown> }[] = []
    const slots = {
      inject(_name: string, run: () => () => void) { run() },
      register(options: Record<string, unknown>, _component: unknown) {
        entries.push({ name: String(options.name), options })
        return () => {}
      },
    }
    const effects: (() => void)[] = []
    const ctx = {
      slots,
      effect(fn: () => (() => void) | void) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose) },
      // `locale`, `modelDirectories` and friends are absent on purpose: the entry
      // must register its core surfaces without them.
      inject(_names: string[], _run: (scope: unknown) => void) {},
    }
    return { ctx, entries }
  }

  it('declares the package icon the Host reads, inside the package and under its size cap', async () => {
    const { readFileSync, statSync } = await import('node:fs')
    const { isAbsolute, join, extname } = await import('node:path')
    const root = join(import.meta.dirname, '..')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { icon?: string; name: string; description: string; exports: Record<string, string> }

    // The Host resolves `icon` relative to the package and refuses anything else.
    expect(typeof pkg.icon).toBe('string')
    const icon = pkg.icon as string
    expect(isAbsolute(icon)).toBe(false)
    expect(/^[A-Za-z][A-Za-z\d+.-]*:/.test(icon)).toBe(false)
    expect(extname(icon).toLowerCase()).toBe('.svg')
    const file = join(root, icon)
    expect(file.startsWith(root)).toBe(true)
    expect(statSync(file).isFile()).toBe(true)
    // 256 KiB is the Host's cap; the mark is a few hundred bytes.
    expect(statSync(file).size).toBeLessThanOrEqual(256 * 1024)
    expect(readFileSync(file, 'utf8')).toMatch(/<svg[^>]*viewBox=/)
    // The same resource is exported, which is the alternative the Host accepts.
    expect(Object.values(pkg.exports)).toContain('./assets/icon.svg')
    // One product name in the metadata, and the agreed one.
    expect(pkg.description).toContain('DSH Agent Studio With Fusion')
  })

  it('registers exactly one main panel and one sidebar entry, and claims no brand slot', async () => {
    const { apply } = await import('../src/client/index.js')
    const { ctx, entries } = slotDouble()
    apply(ctx as never)

    const main = entries.filter(entry => entry.name === 'main')
    const sidebar = entries.filter(entry => entry.name === 'sidebar.panellist')
    expect(main).toHaveLength(1)
    expect(sidebar).toHaveLength(1)
    // Same identity on both: the panel id is what the main slot is keyed by.
    expect(main[0]!.options.key).toBe('fusion')
    expect(sidebar[0]!.options.id).toBe('fusion')
    // The sidebar row keeps the short label; the full title lives on the page.
    expect((sidebar[0]!.options.label as () => string)()).toBe('Fusion')

    // Harness-wide branding stays with the official brand plugin.
    expect(entries.filter(entry => entry.name.startsWith('sidebar.brand.'))).toEqual([])
    // The tool-card registry holds Fusion's own control views plus exactly the two
    // AGY keys, with no duplicate key (the keyed slot would refuse one).
    const { fusionControlTools } = await import('../src/client/FusionTool.js')
    const keys = entries.filter(entry => entry.name === 'tool.call.toolview').map(entry => String(entry.options.key))
    expect(keys).toEqual(expect.arrayContaining(['agy_tool', 'run_code', ...fusionControlTools]))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(fusionControlTools.length + 2)
  })
})
