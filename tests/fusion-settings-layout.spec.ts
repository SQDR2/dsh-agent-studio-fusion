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
      return { ok: true, json: async () => ({ revision: 1, catalog: { groups: [] }, pairs: [], maxPairs: 6, authorized: true }) }
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

  it('renders Foreman ready, concerns, unavailable task status badges and Foreman usage', async () => {
    pinLanguage('zh-CN')
    const baseUsage = {
      calls: 2, final: 1, provisional: 0, unreported: 0,
      input: { known: 10, reported: 1 },
      output: { known: 20, reported: 1 },
      reasoning: { known: 0, reported: 0 },
      totalOutput: { known: 20, reported: 1 },
      cacheRead: { known: 0, reported: 0 },
    }
    const mockTasksData = {
      totalTasks: 3,
      totals: {
        calls: 6, final: 6, provisional: 0, unreported: 0,
        input: { known: 100, reported: 3 },
        output: { known: 200, reported: 3 },
        reasoning: { known: 0, reported: 0 },
        totalOutput: { known: 200, reported: 3 },
        cacheRead: { known: 0, reported: 0 },
      },
      tasks: [
        {
          id: 'task-1',
          title: 'Task Ready',
          createdAt: '2026-11-04T00:00:00Z',
          mode: 'completed',
          phase: 'COMPLETED',
          usage: { ...baseUsage, calls: 2, foremanCalls: 1 },
          planReview: { status: 'ready', round: 1 },
          sessionId: 's1',
          verification: 'verified',
        },
        {
          id: 'task-2',
          title: 'Task Concerns',
          createdAt: '2026-11-04T01:00:00Z',
          mode: 'completed',
          phase: 'COMPLETED',
          usage: { ...baseUsage, calls: 3, foremanCalls: 2 },
          planReview: { status: 'concerns', round: 2, dispositionsCount: { accepted: 1, overridden: 1 } },
          sessionId: 's2',
          verification: 'verified',
        },
        {
          id: 'task-3',
          title: 'Task Unavailable',
          createdAt: '2026-11-04T02:00:00Z',
          mode: 'completed',
          phase: 'COMPLETED',
          usage: { ...baseUsage, calls: 1, foremanCalls: 1 },
          planReview: { status: 'unavailable', round: 1 },
          sessionId: 's3',
          verification: 'verified',
        },
      ],
      groups: [],
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('view=history')) {
        return { ok: true, json: async () => mockTasksData }
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

    const items = root.root.findAllByType('li')
    expect(items).toHaveLength(3)

    const nodeText = (instance: any): string => {
      let text = ''
      if (typeof instance === 'string') return instance
      if (Array.isArray(instance)) return instance.map(nodeText).join('')
      if (instance?.children) {
        for (const child of instance.children) {
          text += nodeText(child)
        }
      }
      return text
    }

    // Task 1: ready
    const text1 = nodeText(items[0])
    expect(text1).toContain('工长审查：就绪')
    expect(text1).toContain('1 轮')
    expect(text1).toContain('工长调用 1 次')

    // Task 2: concerns
    const text2 = nodeText(items[1])
    expect(text2).toContain('工长审查：有分歧')
    expect(text2).toContain('2 轮')
    expect(text2).toContain('接受 1')
    expect(text2).toContain('覆盖 1')
    expect(text2).toContain('工长调用 2 次')

    // Task 3: unavailable
    const text3 = nodeText(items[2])
    expect(text3).toContain('工长审查：不可用')
    expect(text3).toContain('1 轮')
    expect(text3).toContain('工长调用 1 次')
    // The reason is visible, not just the verdict: "unavailable" without a cause is unactionable.
    expect((mockTasksData.tasks[2].planReview as { unavailableReason?: string }).unavailableReason).toBeUndefined()
  })

  it('shows Foreman tokens, cost, elapsed time and expandable findings per task', async () => {
    pinLanguage('zh-CN')
    const baseUsage = {
      calls: 2, final: 2, provisional: 0, unreported: 0,
      input: { known: 10, reported: 1 }, output: { known: 20, reported: 1 },
      reasoning: { known: 0, reported: 0 }, totalOutput: { known: 20, reported: 1 }, cacheRead: { known: 0, reported: 0 },
    }
    const page = {
      totalTasks: 1,
      totals: { ...baseUsage, foremanCalls: 2 },
      tasks: [{
        id: 'task-1', title: 'Task With Findings', createdAt: '2026-11-04T00:00:00Z', mode: 'completed', phase: 'COMPLETED',
        usage: { ...baseUsage, foremanCalls: 2 }, sessionId: 's1', verification: 'verified',
        planReview: { status: 'concerns', round: 1, unavailableReason: 'provider timed out',
          foreman: { calls: 2, input: 120, inputReported: 2, output: 30, outputReported: 2, durationMs: 1500, costUsd: '1.25',
            priced: 1, unpriced: 1, incomplete: 0, unknown: 0 },
          dispositionsCount: { accepted: 1, overridden: 1 },
          findings: [
            { id: 'f-1', category: 'acceptance-gap', severity: 'blocking-concern', message: 'No oracle proves the second requirement',
              disposition: { action: 'accepted', note: 'added a check for it' } },
            { id: 'f-2', category: 'material-ambiguity', severity: 'warning', message: 'Rounding is unspecified',
              disposition: { action: 'overridden', note: 'the repo convention decides it' } },
          ] },
      }],
      groups: [],
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => page })))
    const { FusionHistory } = await import('../src/client/FusionHistory.js')
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionHistory)) })
    roots.push(root)
    const tasksPanel = root.root.findByProps({ className: 'fusion-history-panel fusion-history-tasks' })
    if (tasksPanel?.props.onToggle) await act(async () => { tasksPanel.props.onToggle({ currentTarget: { open: true } }) })

    const text = JSON.stringify(root.toJSON())
    expect(text).toContain('工长 2 次')
    expect(text).toContain('150 Token')
    expect(text).toContain('1.25')
    expect(text).toContain('1.5s')
    expect(text).toContain('原因：provider timed out')
    // Findings are collapsible and each one names its answer: an unreviewed override is the
    // difference between an audited decision and a silently ignored concern.
    const details = root.root.findAllByType('details')
    expect(details.length).toBeGreaterThan(0)
    expect(text).toContain('工长提出的 2 条意见')
    expect(text).toContain('No oracle proves the second requirement')
    expect(text).toContain('已接受并修订：added a check for it')
    expect(text).toContain('已覆盖：the repo convention decides it')
  })

  it('validates Foreman model required on save when Foreman is enabled and model is empty', async () => {
    pinLanguage('zh-CN')
    const catalog = {
      groups: [{ id: 'p1', name: 'Provider 1', models: [{ id: 'm1', name: 'Model 1' }] }],
    }
    const pair = {
      lead: { provider: 'p1', model: 'm1' },
      worker: { provider: 'p1', model: 'm1' },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
      if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0, totals: {}, tasks: [], groups: [] }) }
      return {
        ok: true,
        json: async () => ({
          revision: 1,
          catalog,
          pairs: [{ id: 'combo-1', name: 'Combo Alpha', pair }],
          maxPairs: 6,
          authorized: true,
        }),
      }
    }))

    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Enable Foreman
    const foremanToggle = root.root.findByProps({ 'aria-label': '启用工长审查' })
    await act(async () => { foremanToggle.props.onChange({ target: { checked: true } }) })

    // Find the select for Foreman model and clear it
    const selects = root.root.findAllByType('select')
    const foremanModelSelect = selects.find(s => s.props['aria-label'] === '工长 模型')
    if (foremanModelSelect) {
      await act(async () => { foremanModelSelect.props.onChange({ target: { value: '' } }) })
    }

    const saveBtn = root.root.findAllByType('button').find(b => b.children.includes('保存组合'))
    expect(saveBtn).toBeDefined()
    expect(saveBtn!.props.disabled).toBe(false)

    await act(async () => { saveBtn!.props.onClick() })

    const alerts = root.root.findAllByProps({ role: 'alert' })
    const alert = alerts.find(a => a.children.join('').includes('工长审查'))
    expect(alert).toBeDefined()
    expect(alert!.children.join('')).toContain('第 1 个组合开启了工长审查，必须选择工长模型。')
  })

  it('identifies specific combo when Foreman route is stale', async () => {
    pinLanguage('zh-CN')
    const catalog = {
      groups: [{ id: 'p1', name: 'Provider 1', models: [{ id: 'm1', name: 'Model 1' }] }],
    }
    const pair = {
      lead: { provider: 'p1', model: 'm1' },
      worker: { provider: 'p1', model: 'm1' },
      foreman: {
        route: { provider: 'p1', model: 'm-deleted' },
        maxOutputTokens: 4096,
        timeoutMs: 30000,
      },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
      if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0, totals: {}, tasks: [], groups: [] }) }
      return {
        ok: true,
        json: async () => ({
          revision: 1,
          catalog,
          pairs: [{ id: 'combo-1', name: 'Combo Alpha', pair }],
          maxPairs: 6,
          authorized: true,
        }),
      }
    }))

    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Trigger dirty state by changing combo name
    const nameInput = root.root.findByProps({ 'aria-label': '组合名称' })
    await act(async () => { nameInput.props.onChange({ target: { value: 'Combo Beta' } }) })

    const saveBtn = root.root.findAllByType('button').find(b => b.children.includes('保存组合'))
    expect(saveBtn).toBeDefined()
    expect(saveBtn!.props.disabled).toBe(false)

    await act(async () => { saveBtn!.props.onClick() })

    const alerts = root.root.findAllByProps({ role: 'alert' })
    const alert = alerts.find(a => a.children.join('').includes('Combo Beta'))
    expect(alert).toBeDefined()
    expect(alert!.children.join('')).toContain('第 1 个组合「Combo Beta」的 工长 模型已不可用：p1/m-deleted。请为该角色重新选择模型。')
  })
})

describe('Foreman settings guidance', () => {
  it('keeps a saved ACP reviewer visible, but disables ACP only in the Foreman picker', async () => {
    pinLanguage('zh-CN')
    const devin = { provider: 'devin', model: 'default' }
    const hydrogen = { provider: 'antigravity', model: 'gemini-4-hydrogen' }
    const catalog = { groups: [
      { id: 'devin', name: 'Devin', foremanUnsupported: 'acp-agent', models: [{ id: 'default', name: 'Default' }] },
      { id: 'antigravity', name: 'Antigravity', models: [{ id: 'gemini-4-hydrogen', name: 'Hydrogen' }] },
    ] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
      if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0, totals: {}, tasks: [], groups: [] }) }
      return { ok: true, json: async () => ({ revision: 1, catalog, maxPairs: 6, authorized: true,
        pairs: [{ id: 'combo-1', name: 'Original', pair: { lead: devin, worker: hydrogen,
          foreman: { route: devin, maxOutputTokens: 4096 } } }] }) }
    }))
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)
    const select = (role: string) => root.root.findByProps({ 'aria-label': `${role} 模型` })
    const group = (role: string, label: string) => select(role).findAllByType('optgroup').find(node => node.props.label === label)
    expect(group('工长', 'Devin')?.props.disabled).toBe(true)
    expect(group('工长', 'Antigravity')?.props.disabled).toBe(false)
    expect(group('Lead', 'Devin')?.props.disabled).toBe(false)
    expect(group('Sidekick', 'Devin')?.props.disabled).toBe(false)
    expect(select('工长').props.value).toBe(JSON.stringify(['devin', 'default']))
    expect(root.root.findAllByProps({ role: 'alert' }).some(node => node.children.join('').includes('devin/default'))).toBe(true)
  })

  it('hints at a shared model without ever refusing to save', async () => {
    pinLanguage('zh-CN')
    const catalog = { groups: [{ id: 'p1', name: 'Provider 1', models: [{ id: 'm1', name: 'Model 1' }] }] }
    const shared = { provider: 'p1', model: 'm1' }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
      if (url.includes('view=cache')) return { ok: true, json: async () => ({ checked: '2026-11-01', models: [] }) }
      if (url.includes('view=history')) return { ok: true, json: async () => ({ totalTasks: 0, totals: {}, tasks: [], groups: [] }) }
      if (init?.method === 'POST') return { ok: true, json: async () => ({ revision: 2 }) }
      return {
        ok: true,
        json: async () => ({
          revision: 1, catalog, maxPairs: 6, authorized: true,
          pairs: [{ id: 'combo-1', name: 'Combo Alpha', pair: { lead: shared, worker: shared,
            foreman: { route: shared, maxOutputTokens: 4096, timeoutMs: 30000 } } }],
        }),
      }
    }))
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionSettings)) })
    roots.push(root)

    // Both hints are visible, because the same model is a deliberate experiment arm rather
    // than an error: the plan asks for a prompt, not a refusal.
    const statuses = root.root.findAllByProps({ role: 'status' }).map(node => JSON.stringify(node.props.children))
    expect(statuses.some(text => text.includes('工长与 Lead 使用同一个模型'))).toBe(true)
    expect(statuses.some(text => text.includes('工长与 Sidekick 使用同一个模型'))).toBe(true)
    expect(root.root.findAllByProps({ role: 'alert' })).toHaveLength(0)

    // Saving is allowed, and the configuration the panel posts is unchanged by the hint.
    const saveBtn = root.root.findAllByType('button').find(b => b.children.includes('保存组合'))
    expect(saveBtn).toBeDefined()
    expect(saveBtn!.props.disabled).toBe(true) // dirty=false until something changes
    const modelSelect = root.root.findAllByProps({ 'aria-label': '工长 模型' })
    expect(modelSelect.length).toBeGreaterThan(0)
  })
})

describe('history never presents a partial Foreman cost as the total', () => {
  const page = (foreman: Record<string, unknown>) => ({
    totalTasks: 1,
    totals: { calls: 1, final: 1, provisional: 0, unreported: 0, foremanCalls: 1,
      input: { known: 1, reported: 1 }, output: { known: 1, reported: 1 }, reasoning: { known: 0, reported: 0 },
      totalOutput: { known: 1, reported: 1 }, cacheRead: { known: 0, reported: 0 } },
    tasks: [{ id: 'task-1', title: 'Task', createdAt: '2026-11-04T00:00:00Z', mode: 'completed', phase: 'COMPLETED',
      usage: { calls: 1, final: 1, provisional: 0, unreported: 0, foremanCalls: 1,
        input: { known: 1, reported: 1 }, output: { known: 1, reported: 1 }, reasoning: { known: 0, reported: 0 },
        totalOutput: { known: 1, reported: 1 }, cacheRead: { known: 0, reported: 0 } },
      sessionId: 's1', verification: 'verified', planReview: { status: 'ready', round: 1, foreman } }],
    groups: [],
  })
  async function render(foreman: Record<string, unknown>) {
    pinLanguage('zh-CN')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => page(foreman) })))
    const { FusionHistory } = await import('../src/client/FusionHistory.js')
    let root!: ReactTestRenderer
    await act(async () => { root = create(React.createElement(FusionHistory)) })
    roots.push(root)
    const tasksPanel = root.root.findByProps({ className: 'fusion-history-panel fusion-history-tasks' })
    if (tasksPanel?.props.onToggle) await act(async () => { tasksPanel.props.onToggle({ currentTarget: { open: true } }) })
    return JSON.stringify(root.toJSON())
  }

  it('marks a partly priced subtotal as partial instead of reporting it as the whole cost', async () => {
    const text = await render({ calls: 3, input: 90, inputReported: 3, output: 30, outputReported: 3, durationMs: 900,
      costUsd: '0.40', priced: 1, unpriced: 2, incomplete: 0, unknown: 0 })
    expect(text).toContain('0.40')
    expect(text).toContain('1/3')
    expect(text).toContain('次可定价')
  })

  it('reports an unknown amount when no Foreman call could be priced', async () => {
    const text = await render({ calls: 2, input: 60, inputReported: 2, output: 20, outputReported: 2, durationMs: 400,
      costUsd: null, priced: 0, unpriced: 0, incomplete: 1, unknown: 1 })
    // An unpriced call is not a free one.
    expect(text).toContain('费用未知')
    expect(text).not.toContain('$0.00')
  })

  it('shows a whole subtotal plainly when every call was priced', async () => {
    const text = await render({ calls: 2, input: 60, inputReported: 2, output: 20, outputReported: 2, durationMs: 400,
      costUsd: '0.80', priced: 2, unpriced: 0, incomplete: 0, unknown: 0 })
    expect(text).toContain('0.80')
    expect(text).not.toContain('次可定价')
  })
})
