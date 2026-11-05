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

    // Bordered panel containers with <= 8px radius
    expect(css).toMatch(/\.fusion-history-panel\{[^}]*border:\s*1px solid var\(--dsw-alias-border-l2\)/)
    expect(css).toMatch(/\.fusion-history-panel\{[^}]*border-radius:\s*8px/)
    expect(css).toMatch(/\.fusion-history-tasks-summary\{[^}]*display:\s*flex/)
    expect(css).toMatch(/\.fusion-history-tasks-chevron\{/)

    // Cache keepalive and history outer collapsible boxes with <= 8px radius and no top rule
    expect(css).toMatch(/\.fusion-cache\{[^}]*border:\s*1px solid var\(--dsw-alias-border-l2\)/)
    expect(css).toMatch(/\.fusion-cache\{[^}]*border-radius:\s*8px/)
    expect(css).toMatch(/\.fusion-cache-summary\{[^}]*display:\s*flex/)
    expect(css).toMatch(/\.fusion-cache-chevron\{/)
    expect(css).toMatch(/\.fusion-history\{[^}]*border:\s*1px solid var\(--dsw-alias-border-l2\)/)
    expect(css).toMatch(/\.fusion-history\{[^}]*border-radius:\s*8px/)
    expect(css).toMatch(/\.fusion-history-summary\{[^}]*display:\s*flex/)
    expect(css).toMatch(/\.fusion-history-chevron\{/)
    expect(css).not.toMatch(/\.fusion-cache\{[^}]*border-top:/)
    expect(css).not.toMatch(/\.fusion-history\{[^}]*border-top:/)
  })

  it('renders cache keepalive and history/statistics as two independent bordered collapsible boxes, both collapsed by default and expandable', async () => {
    pinLanguage('zh-CN')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('view=cache')) {
        return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
      }
      if (url.includes('view=history')) {
        return { ok: true, json: async () => ({ totalTasks: 0, totals: { calls: 0, final: 0, provisional: 0, unreported: 0, input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 }, reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } }, tasks: [], groups: [] }) }
      }
      return { ok: true, json: async () => ({ revision: 1, catalog: { groups: [] }, pair: null, authorized: true }) }
    }))

    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    const cacheBox = root.root.findByProps({ className: 'fusion-cache' })
    const historyBox = root.root.findByProps({ className: 'fusion-history' })

    // Both are distinct bordered collapsible containers
    expect(cacheBox).toBeDefined()
    expect(historyBox).toBeDefined()
    expect(cacheBox.type).toBe('details')
    expect(historyBox.type).toBe('details')

    // Both collapsed by default (no open attribute)
    expect(cacheBox.props.open).toBeUndefined()
    expect(historyBox.props.open).toBeUndefined()

    // Cache summary title and indicator
    const cacheSummary = cacheBox.findByProps({ className: 'fusion-cache-summary' })
    expect(cacheSummary.findByType('h3').children).toContain('缓存保活')
    expect(cacheSummary.findByType('small').children).toContain('点击展开')
    expect(cacheSummary.findByProps({ className: 'fusion-cache-chevron' })).toBeDefined()

    // History summary title and indicator
    const historySummary = historyBox.findByProps({ className: 'fusion-history-summary' })
    expect(historySummary.findByType('h3').children).toContain('历史与统计')
    expect(historySummary.findByType('small').children).toContain('点击展开')
    expect(historySummary.findByProps({ className: 'fusion-history-chevron' })).toBeDefined()

    // Expanding cache keeps history collapsed (independent)
    await act(async () => {
      cacheBox.props.onToggle({ currentTarget: { open: true } })
    })
    expect(cacheBox.props.open).toBe(true)
    expect(historyBox.props.open).toBeUndefined()
    expect(cacheSummary.findByType('small').children).toContain('点击收起')

    // Expanding history
    await act(async () => {
      historyBox.props.onToggle({ currentTarget: { open: true } })
    })
    expect(historyBox.props.open).toBe(true)
    expect(historySummary.findByType('small').children).toContain('点击收起')
  })

  it('renders usage statistics and tasks as two distinct bordered panels with tasks collapsed by default and accessible after expanding', async () => {
    pinLanguage('zh-CN')
    const mockData = {
      totalTasks: 2,
      totals: {
        calls: 5, final: 5, provisional: 0, unreported: 0,
        input: { known: 100, reported: 5 },
        output: { known: 200, reported: 5 },
        reasoning: { known: 50, reported: 5 },
        totalOutput: { known: 250, reported: 5 },
        cacheRead: { known: 10, reported: 5 },
      },
      tasks: [
        {
          id: 'task-panel-1',
          title: 'Panel Task 1',
          createdAt: '2026-11-04T00:00:00Z',
          mode: 'completed',
          phase: 'COMPLETED',
          usage: {
            calls: 2, final: 2, provisional: 0, unreported: 0,
            input: { known: 40, reported: 2 },
            output: { known: 80, reported: 2 },
            reasoning: { known: 0, reported: 0 },
            totalOutput: { known: 80, reported: 2 },
            cacheRead: { known: 0, reported: 0 },
          },
          takeovers: 0,
          sessionId: 's1',
          verification: 'verified',
        },
        {
          id: 'task-panel-2',
          title: 'Panel Task 2',
          createdAt: '2026-11-04T01:00:00Z',
          mode: 'running',
          phase: 'WORKER_RUNNING',
          usage: {
            calls: 3, final: 3, provisional: 0, unreported: 0,
            input: { known: 60, reported: 3 },
            output: { known: 120, reported: 3 },
            reasoning: { known: 50, reported: 3 },
            totalOutput: { known: 170, reported: 3 },
            cacheRead: { known: 10, reported: 3 },
          },
          takeovers: 1,
          sessionId: 's2',
          verification: 'unverified',
        },
      ],
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

    // Outer FusionHistory container is a bordered collapsible details, collapsed by default
    const historyOuter = root.root.findByProps({ className: 'fusion-history' })
    expect(historyOuter.type).toBe('details')
    expect(historyOuter.props.open).toBeUndefined()
    const historySummary = historyOuter.findByProps({ className: 'fusion-history-summary' })
    expect(historySummary.findByType('h3').children).toContain('历史与统计')
    expect(historySummary.findByType('small').children).toContain('点击展开')

    // Expanding outer history details
    await act(async () => {
      historyOuter.props.onToggle({ currentTarget: { open: true } })
    })
    expect(historyOuter.props.open).toBe(true)
    expect(historySummary.findByType('small').children).toContain('点击收起')

    // Two distinct bordered containers inside
    const usagePanel = root.root.findByProps({ className: 'fusion-history-panel fusion-history-usage' })
    expect(usagePanel).toBeDefined()
    expect(usagePanel.findByType('h3').children).toContain('用量统计')

    const tasksPanel = root.root.findByProps({ className: 'fusion-history-panel fusion-history-tasks' })
    expect(tasksPanel).toBeDefined()
    expect(tasksPanel.type).toBe('details')

    // Task records are collapsed by default (no open attribute on the details element)
    expect(tasksPanel.props.open).toBeUndefined()

    // Summary displays "任务记录" and task count clearly
    const summary = tasksPanel.findByProps({ className: 'fusion-history-tasks-summary' })
    const title = summary.findByProps({ className: 'fusion-history-tasks-title' })
    expect(title.findByType('strong').children).toContain('任务记录')
    expect(title.findByProps({ className: 'fusion-history-count' }).children.join('')).toBe('(2)')
    expect(summary.findByType('small').children).toContain('点击展开')

    // Expansion indicator exists
    const chevron = summary.findByProps({ className: 'fusion-history-tasks-chevron' })
    expect(chevron).toBeDefined()

    // Expanding the details panel reveals tasks and their full functionality
    await act(async () => {
      tasksPanel.props.onToggle({ currentTarget: { open: true } })
    })
    expect(tasksPanel.props.open).toBe(true)

    // Both tasks are present
    const taskItems = tasksPanel.findAllByType('li')
    expect(taskItems).toHaveLength(2)

    // Clear buttons and per-task details remain accessible
    const clearBtn1 = tasksPanel.findByProps({ 'aria-label': '清除任务 Panel Task 1' })
    expect(clearBtn1).toBeDefined()
    const clearBtn2 = tasksPanel.findByProps({ 'aria-label': '清除任务 Panel Task 2' })
    expect(clearBtn2).toBeDefined()

    // Pagination actions are present
    const pagination = tasksPanel.findByProps({ className: 'fusion-actions' })
    expect(pagination).toBeDefined()
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

    // Expand overall tasks panel before accessing task actions
    const tasksPanel = root.root.findByProps({ className: 'fusion-history-panel fusion-history-tasks' })
    if (tasksPanel?.props.onToggle) {
      await act(async () => { tasksPanel.props.onToggle({ currentTarget: { open: true } }) })
    }

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

    const tasksPanel = root.root.findByProps({ className: 'fusion-history-panel fusion-history-tasks' })
    if (tasksPanel?.props.onToggle) {
      await act(async () => { tasksPanel.props.onToggle({ currentTarget: { open: true } }) })
    }

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

    const tasksPanel = root.root.findByProps({ className: 'fusion-history-panel fusion-history-tasks' })
    if (tasksPanel?.props.onToggle) {
      await act(async () => { tasksPanel.props.onToggle({ currentTarget: { open: true } }) })
    }

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
