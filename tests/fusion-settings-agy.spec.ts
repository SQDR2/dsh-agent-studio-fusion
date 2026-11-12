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

describe('FusionSettings is the only entry the Antigravity console has', () => {
  it('renders the AGY console inside the Fusion page, not as its own panel', async () => {
    const root = await renderPage()

    // One page, one column: the console is a child of `.fusion-settings`.
    const page = root.root.findByProps({ className: 'fusion-page' })
    const settings = page.findByProps({ className: 'fusion-settings' })
    const section = settings.findByProps({ className: 'fusion-agy' })
    expect(section).toBeDefined()

    // It is a collapsible section of this page, titled with the product name.
    const summary = section.findByProps({ className: 'fusion-agy-summary' })
    expect(summary.findAllByType('h3').map(node => String(node.children.join('')))).toEqual(['Antigravity'])

    // The console mounts inline (`isModal: false`) below that summary.
    expect(textOf(root)).toContain('agy-console')
    // And this page still owns the one sidebar label and panel title the plugin
    // registers: no second "Fusion" page, no Antigravity panel of its own.
    const headings = root.root.findAllByType('h2').map(node => String(node.children.join('')))
    expect(headings).toEqual(['Fusion'])
  })

  it('describes the route and the command so the section is self-explanatory', async () => {
    const root = await renderPage()
    const json = textOf(root)
    // The route name and the slash command are part of the copy, verbatim.
    expect(json).toContain('antigravity')
    expect(json).toContain('/agy')
  })

  it('keeps the AGY stylesheet scoped to the console instead of the document root', async () => {
    const root = await renderPage()
    const css = root.root.findAllByType('style').map(node => String(node.children.join(''))).join('\n')
    // The theme variables are declared on the console root, not on :root/body, so
    // porting the Antigravity palette cannot repaint Fusion's own pages.
    expect(css).toMatch(/\.agy-console\s*\{/)
    expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/)
    expect(css).not.toMatch(/(^|\n)\s*body\s*\{/)
    // The section itself is a bordered card in the page's own vocabulary.
    expect(css).toMatch(/\.fusion-agy\{[^}]*border:\s*1px solid var\(--dsw-alias-border-l2\)/)
    expect(css).toMatch(/\.fusion-agy\{[^}]*border-radius:\s*8px/)
  })
})
