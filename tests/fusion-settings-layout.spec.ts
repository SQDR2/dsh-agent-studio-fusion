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

function styleText(root: ReactTestRenderer): string {
  const styles = root.root.findAllByType('style')
  return styles.map(node => String(node.children.join(''))).join('\n')
}

describe('FusionSettings layout after sidebar integration', () => {
  it('renders a full-height scroll surface wrapping centered fusion settings', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    })))

    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Root element is .fusion-page
    const page = root.root.findByProps({ className: 'fusion-page' })
    expect(page).toBeDefined()

    // Inner settings container
    const settings = page.findByProps({ className: 'fusion-settings' })
    expect(settings).toBeDefined()

    // Header has window drag support
    const header = settings.findByType('header')
    expect(header.props['data-window-drag']).toBe(true)

    const css = styleText(root)

    // Full-height scroll surface (.fusion-page)
    expect(css).toMatch(/\.fusion-page\{[^}]*width:\s*100%/)
    expect(css).toMatch(/\.fusion-page\{[^}]*height:\s*100%/)
    expect(css).toMatch(/\.fusion-page\{[^}]*min-width:\s*0/)
    expect(css).toMatch(/\.fusion-page\{[^}]*min-height:\s*0/)
    expect(css).toMatch(/\.fusion-page\{[^}]*flex:\s*1 1 auto/)
    expect(css).toMatch(/\.fusion-page\{[^}]*overflow:\s*auto/)
    expect(css).toMatch(/\.fusion-page\{[^}]*scrollbar-gutter:\s*stable/)
    expect(css).toMatch(/\.fusion-page\{[^}]*padding:\s*0 clamp\(24px,\s*4vw,\s*48px\)\s*48px/)

    // Centered content column (.fusion-settings)
    expect(css).toMatch(/\.fusion-settings\{[^}]*max-width:\s*680px/)
    expect(css).toMatch(/\.fusion-settings\{[^}]*margin:\s*0 auto/)
    expect(css).toMatch(/\.fusion-settings\{[^}]*width:\s*100%/)

    // Header top insets and macOS titlebar clearance
    expect(css).toMatch(/\.fusion-settings header\{[^}]*padding-top:\s*28px/)
    expect(css).toMatch(/\[data-platform='darwin'\] \.fusion-settings header\{[^}]*padding-top:\s*calc\(28px \+ var\(--dsh-frame-top-clearance,\s*0px\)\)/)

    // Narrow viewport adaptation
    expect(css).toMatch(/@media\(max-width:480px\)\{[^}]*\.fusion-page\{padding:\s*0 16px 32px\}/)

    // History item header and action styles
    expect(css).toMatch(/\.fusion-history-item-header\{[^}]*display:\s*flex/)
    expect(css).toMatch(/\.fusion-history-actions\{[^}]*display:\s*flex/)
    expect(css).toMatch(/\.fusion-history-confirm-text\{/)
  })

  it('renders history delete buttons and toggles secondary confirmation on click', async () => {
    pinLanguage('zh-CN')
    const mockData = {
      totalTasks: 1,
      totals: {
        calls: 1, final: 1, provisional: 0, unreported: 0,
        input: { known: 10, reported: 1 },
        output: { known: 20, reported: 1 },
        reasoning: { known: 0, reported: 0 },
        totalOutput: { known: 0, reported: 0 },
        cacheRead: { known: 0, reported: 0 },
      },
      tasks: [{
        id: 'task-test-1',
        title: 'Test Task',
        createdAt: '2026-11-04T00:00:00Z',
        mode: 'completed',
        phase: 'COMPLETED',
        usage: {
          calls: 1, final: 1, provisional: 0, unreported: 0,
          input: { known: 10, reported: 1 },
          output: { known: 20, reported: 1 },
          reasoning: { known: 0, reported: 0 },
          totalOutput: { known: 0, reported: 0 },
          cacheRead: { known: 0, reported: 0 },
        },
        takeovers: 0,
        sessionId: 's1',
        verification: 'verified',
      }],
      groups: [],
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('view=history')) {
        return { ok: true, json: async () => mockData }
      }
      return { ok: true, json: async () => ({}) }
    }))

    const { FusionHistory } = await import('../src/client/FusionHistory.js')
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionHistory)) })
    roots.push(root)

    // Find the clear button
    const clearBtn = root.root.findByProps({ 'aria-label': '清除任务 Test Task' })
    expect(clearBtn).toBeDefined()

    // Click clear button to open confirmation
    await act(async () => { clearBtn.props.onClick() })

    // Secondary confirmation is now shown
    const confirmText = root.root.findByProps({ className: 'fusion-history-confirm-text' })
    expect(confirmText).toBeDefined()
    expect(confirmText.children).toContain('确定清除？')

    const cancelBtn = root.root.findByProps({ className: 'fusion-btn-subtle' })
    expect(cancelBtn).toBeDefined()

    // Click cancel to close confirmation
    await act(async () => { cancelBtn.props.onClick() })

    // Clear button is back
    const restoredClearBtn = root.root.findByProps({ 'aria-label': '清除任务 Test Task' })
    expect(restoredClearBtn).toBeDefined()
  })
})
