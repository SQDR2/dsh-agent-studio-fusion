import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { FusionSettings } from '../src/client/FusionSettings.js'
import { pinLanguage } from './client-locale.js'

const roots: ReactTestRenderer[] = []
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()) })
  vi.unstubAllGlobals()
})

/** The settings read never resolves: this page is asserted on its structure only. */
const pendingFetch = () => vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
  })))

async function renderPage(): Promise<ReactTestRenderer> {
  pinLanguage('en-US')
  pendingFetch()
  let root!: ReactTestRenderer
  await act(async () => { root = create(React.createElement(FusionSettings)) })
  roots.push(root)
  return root
}

const textOf = (root: ReactTestRenderer): string => JSON.stringify(root.toJSON())

/** Open the Antigravity region through the page's own section buttons. */
async function openAntigravity(root: ReactTestRenderer): Promise<void> {
  const button = root.root.findByType('nav').findAllByType('button')
    .find(node => String(node.children.join('')) === 'Antigravity')!
  await act(async () => { button.props.onClick() })
}

describe('the Antigravity region of the combined page', () => {
  it('lives inside the Fusion page as one of its three sections, not as its own panel', async () => {
    const root = await renderPage()

    // One page, one column: the region is a child of `.fusion-settings`.
    const page = root.root.findByProps({ className: 'fusion-page' })
    const settings = page.findByProps({ className: 'fusion-settings' })
    expect(settings).toBeDefined()

    await openAntigravity(root)
    const region = settings.findByProps({ id: 'fusion-section-antigravity' })
    expect(region.props.role).toBe('region')
    expect(region.findAllByType('h3').map(node => String(node.children.join('')))).toEqual(['Antigravity'])

    // The console mounts inline (`isModal: false`) below that heading.
    expect(textOf(root)).toContain('agy-console')
    // And this page still owns exactly one product title: no second panel, no
    // Antigravity entry of its own in the sidebar.
    const headings = root.root.findAllByType('h2').map(node => String(node.children.join('')))
    expect(headings).toEqual(['DSH Agent Studio With Fusion'])
  })

  it('is not mounted until it is selected, so its status poll stays idle', async () => {
    const root = await renderPage()
    // Default section is Fusion: the region is present (aria-controls resolves) but
    // its console is not mounted, so no status request is made.
    expect(root.root.findByProps({ id: 'fusion-section-antigravity' }).props.hidden).toBe(true)
    expect(textOf(root)).not.toContain('agy-console')
    expect(vi.mocked(globalThis.fetch).mock.calls.some(call => String(call[0]).includes('/plugins/agy-worker/status'))).toBe(false)

    await openAntigravity(root)
    expect(textOf(root)).toContain('agy-console')
  })

  it('describes the route and the command so the section is self-explanatory', async () => {
    const root = await renderPage()
    await openAntigravity(root)
    const json = textOf(root)
    // The route name and the slash command are part of the copy, verbatim.
    expect(json).toContain('antigravity')
    expect(json).toContain('/agy')
  })

  it('keeps the AGY stylesheet scoped to the console instead of the document root', async () => {
    const root = await renderPage()
    await openAntigravity(root)
    const css = root.root.findAllByType('style').map(node => String(node.children.join(''))).join('\n')
    // The theme variables are declared on the console root, not on :root/body, so
    // porting the Antigravity palette cannot repaint Fusion's own pages.
    expect(css).toMatch(/\.agy-console\s*\{/)
    expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/)
    expect(css).not.toMatch(/(^|\n)\s*body\s*\{/)
    // The nav and section vocabulary this page adds stays its own.
    expect(css).toMatch(/\.fusion-nav button\[aria-pressed=true\]/)
    expect(css).toMatch(/\.fusion-section\[hidden\]\{display:none\}/)
  })

  it('hides the Fusion region rather than unmounting it, so drafts survive', async () => {
    const root = await renderPage()
    const fusion = root.root.findByProps({ id: 'fusion-section-fusion' })
    expect(fusion.props.hidden).toBe(false)

    await openAntigravity(root)
    // Still mounted (its draft state lives in the parent component), just hidden.
    expect(root.root.findByProps({ id: 'fusion-section-fusion' }).props.hidden).toBe(true)
    // Every section the nav names exists at all times, hidden or not.
    for (const name of ['fusion', 'antigravity', 'acp']) {
      expect(root.root.findAllByProps({ id: `fusion-section-${name}` })).toHaveLength(1)
    }
  })
})
