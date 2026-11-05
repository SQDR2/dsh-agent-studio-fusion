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

  it('displays row-level error feedback and allows retry/cancel when deletion fails with 409', async () => {
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
        id: 'task-running-1',
        title: 'Running Task',
        createdAt: '2026-11-04T00:00:00Z',
        mode: 'running',
        phase: 'WORKER_RUNNING',
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
        verification: 'unverified',
      }],
      groups: [],
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'Cannot delete a running task', blocker: 'agent' }),
        }
      }
      if (url.includes('view=history')) {
        return { ok: true, json: async () => mockData }
      }
      return { ok: true, json: async () => ({}) }
    }))

    const { FusionHistory } = await import('../src/client/FusionHistory.js')
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionHistory)) })
    roots.push(root)

    const clearBtn = root.root.findByProps({ 'aria-label': '清除任务 Running Task' })
    await act(async () => { clearBtn.props.onClick() })

    const confirmBtn = root.root.findAllByType('button').find(b => b.children.includes('确认'))
    expect(confirmBtn).toBeDefined()

    // Trigger delete which fails with 409
    await act(async () => { confirmBtn!.props.onClick() })

    // Row-level error feedback is shown
    const rowError = root.root.findByProps({ className: 'fusion-history-row-error' })
    expect(rowError).toBeDefined()
    expect(rowError.props.role).toBe('alert')
    expect(rowError.children.join('')).toContain('当前任务仍在运行或尚未安全终止，无法清除')
    expect(rowError.children.join('')).toContain('Lead 或 Sidekick 仍在运行')

    // Task is not removed from the list
    expect(root.root.findAllByType('li')).toHaveLength(1)

    // User can cancel and clear the row error
    const cancelBtn = root.root.findByProps({ className: 'fusion-btn-subtle' })
    await act(async () => { cancelBtn.props.onClick() })
    expect(root.root.findAllByProps({ className: 'fusion-history-row-error' })).toHaveLength(0)
    expect(root.root.findByProps({ 'aria-label': '清除任务 Running Task' })).toBeDefined()
  })

  it('optimistically converges state and refreshes without full-page loading flicker when deletion succeeds', async () => {
    pinLanguage('zh-CN')
    let historyCallCount = 0
    const mockDataInitial = {
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
        id: 'task-done-1',
        title: 'Finished Task',
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
    const mockDataAfterDelete = {
      ...mockDataInitial,
      totalTasks: 0,
      tasks: [],
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return { ok: true, json: async () => ({ ok: true, taskId: 'task-done-1' }) }
      }
      if (url.includes('view=history')) {
        historyCallCount++
        return { ok: true, json: async () => historyCallCount > 1 ? mockDataAfterDelete : mockDataInitial }
      }
      return { ok: true, json: async () => ({}) }
    }))

    const { FusionHistory } = await import('../src/client/FusionHistory.js')
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionHistory)) })
    roots.push(root)

    expect(root.root.findAllByType('li')).toHaveLength(1)

    const clearBtn = root.root.findByProps({ 'aria-label': '清除任务 Finished Task' })
    await act(async () => { clearBtn.props.onClick() })

    const confirmBtn = root.root.findAllByType('button').find(b => b.children.includes('确认'))
    await act(async () => { confirmBtn!.props.onClick() })

    // Task is removed and no full-page loading message flickers
    expect(root.root.findAllByType('li')).toHaveLength(0)
    expect(root.root.findAllByProps({ role: 'status' })).toHaveLength(0)
  })
})
