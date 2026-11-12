import React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  routeOf,
  parseAgentImport,
  importOpsOf,
  bindAcpConfigForm,
  getAcpConfigFormSnapshot,
  subscribeAcpConfigForm,
  type AgentImportEntry,
  type SettingsPathOpView,
} from '../src/client/acp-import.js'
import { AcpSettingsGuide, configuredRoutesOf } from '../src/client/AcpSettingsGuide.js'
import { pinLanguage } from './client-locale.js'

const PATH = '/opt/homebrew/bin:/usr/bin:/bin'

const ZED_JSON = JSON.stringify({
  default_mcp_settings: { use_idea_mcp: true },
  agent_servers: {
    'CodeBuddy Code': { command: 'codebuddy', args: ['--acp'], env: {} },
    'Trae': { command: 'traecli', args: ['--acp'] },
    'Claude': {
      command: 'npx',
      args: ['-y', '@agentclientprotocol/claude-agent-acp'],
      env: { PATH, CLAUDE_CODE_EXECUTABLE: '/Users/you/.local/bin/claude' },
    },
    'Codex': { command: 'npx', args: ['-y', '@agentclientprotocol/codex-acp'], env: { PATH } },
  },
})

function createMockForm(options?: {
  status?: 'loading' | 'ready' | 'unavailable'
  writable?: boolean
  revision?: number
  value?: any
  user?: any
  mutateResult?: boolean | Promise<boolean> | (() => Promise<boolean>)
}) {
  const listeners = new Set<() => void>()
  let currentSnapshot: ConfigFormSnapshot<any> = {
    status: options?.status ?? 'ready',
    writable: options?.writable ?? true,
    revision: options?.revision !== undefined ? options.revision : 1,
    value: options?.value ?? { acp: { agents: {} } },
    base: {},
    user: options?.user ?? { acp: { agents: {} } },
    mode: 'host',
  }

  const mutate = vi.fn(async (_ops: readonly SettingsPathOpView[], _rev?: number) => {
    if (typeof options?.mutateResult === 'function') {
      return options.mutateResult()
    }
    if (typeof options?.mutateResult === 'boolean') {
      return options.mutateResult
    }
    if (options?.mutateResult !== undefined) {
      return options.mutateResult
    }
    return true
  })

  const form: ConfigForm<any> & { setSnapshot: (next: Partial<ConfigFormSnapshot<any>>) => void } = {
    getSnapshot: () => currentSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setSnapshot: (next: Partial<ConfigFormSnapshot<any>>) => {
      currentSnapshot = { ...currentSnapshot, ...next }
      for (const l of listeners) l()
    },
    mutate,
    set: vi.fn(),
    unset: vi.fn(),
  }

  return form
}

describe('routeOf', () => {
  it('converts display names into route IDs according to specification', () => {
    expect(routeOf('CodeBuddy Code')).toBe('codebuddy-code')
    expect(routeOf('  Claude (ACP)!  ')).toBe('claude-acp')
    expect(routeOf('通义')).toBe('')
    expect(routeOf('my---agent')).toBe('my-agent')
    expect(routeOf('--leading-trailing--')).toBe('leading-trailing')
    expect(routeOf('Mixed_CASE.1-test')).toBe('mixed_case.1-test')
  })
})

describe('parseAgentImport', () => {
  it('imports Zed agent_servers format and ignores unrelated keys', () => {
    const result = parseAgentImport(ZED_JSON, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.skipped).toEqual([])
    expect(result.entries.map(e => [e.name, e.route, e.replaces])).toEqual([
      ['CodeBuddy Code', 'codebuddy-code', false],
      ['Trae', 'trae', false],
      ['Claude', 'claude', false],
      ['Codex', 'codex', false],
    ])

    // Empty args and empty env should be omitted so schema defaults apply
    expect(result.entries[0]!.profile).toEqual({
      permission: 'ask',
      displayName: 'CodeBuddy Code',
      command: 'codebuddy',
      args: ['--acp'],
    })

    expect(result.entries[2]!.profile).toMatchObject({
      permission: 'ask',
      displayName: 'Claude',
      command: 'npx',
      args: ['-y', '@agentclientprotocol/claude-agent-acp'],
      env: { PATH, CLAUDE_CODE_EXECUTABLE: '/Users/you/.local/bin/claude' },
    })
  })

  it('imports camelCase agentServers', () => {
    const json = JSON.stringify({
      agentServers: {
        'Claude': { command: 'claude-agent' },
      },
    })
    const result = parseAgentImport(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.route).toBe('claude')
  })

  it('imports agents section preserving valid route-id keys as-is', () => {
    const json = JSON.stringify({
      agents: {
        MyCustomAgent: { displayName: 'Custom Display', command: 'run-custom' },
        'valid.route_1': { command: 'node agent.js' },
      },
    })
    const result = parseAgentImport(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map(e => [e.route, e.profile.displayName])).toEqual([
      ['MyCustomAgent', 'Custom Display'],
      ['valid.route_1', undefined],
    ])
  })

  it('imports bare server maps and handles de-duplication with suffixes', () => {
    const json = JSON.stringify({
      'My Agent': { command: 'a' },
      'my-agent': { command: 'b' },
      '通义': { command: 'c' },
      'Another 通义': { command: 'd' },
    })
    const result = parseAgentImport(json, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map(e => e.route)).toEqual([
      'my-agent',
      'my-agent-2',
      'agent',
      'another',
    ])
  })

  it('reports invalid JSON and non-object root', () => {
    expect(parseAgentImport('{')).toMatchObject({ ok: false })
    expect(parseAgentImport('[]')).toEqual({ ok: false, error: 'expected a JSON object' })
    expect(parseAgentImport('"string"')).toEqual({ ok: false, error: 'expected a JSON object' })
    expect(parseAgentImport('123')).toEqual({ ok: false, error: 'expected a JSON object' })
  })

  it('skips invalid command, args, and env with descriptive reasons', () => {
    const json = JSON.stringify({
      agent_servers: {
        MissingCommand: {},
        EmptyCommand: { command: '   ' },
        BadArgs: { command: 'node', args: '--acp' },
        BadEnv: { command: 'node', env: { PORT: 8080 } },
        Valid: { command: 'valid-cmd' },
      },
    })
    const result = parseAgentImport(json)
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          name: 'Valid',
          route: 'valid',
          replaces: false,
          profile: { permission: 'ask', displayName: 'Valid', command: 'valid-cmd' },
        },
      ],
      skipped: [
        { name: 'MissingCommand', reason: 'importMissingCommand' },
        { name: 'EmptyCommand', reason: 'importMissingCommand' },
        { name: 'BadArgs', reason: 'importBadArgs' },
        { name: 'BadEnv', reason: 'importBadEnv' },
      ],
    })
  })

  it('replaces existing routes while preserving current raw config fields', () => {
    const existing = [
      {
        route: 'codex',
        user: {
          displayName: 'Codex (Old)',
          command: 'old-command',
          args: ['old-arg'],
          permission: 'read-only',
          authMethod: 'custom-auth',
          models: [{ id: 'gpt-5' }],
          contextWindow: 64000,
        },
        profile: {
          command: 'old-command',
          permission: 'read-only',
        },
      },
    ]

    const result = parseAgentImport(ZED_JSON, existing)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const codex = result.entries.find(e => e.route === 'codex')
    expect(codex).toBeDefined()
    expect(codex!.replaces).toBe(true)
    expect(codex!.profile).toEqual({
      permission: 'read-only',
      authMethod: 'custom-auth',
      models: [{ id: 'gpt-5' }],
      contextWindow: 64000,
      displayName: 'Codex',
      command: 'npx',
      args: ['-y', '@agentclientprotocol/codex-acp'],
      env: { PATH },
    })
  })

  it('extracts existing routes from a ConfigFormSnapshot object with acp.agents', () => {
    const snapshot = {
      value: {
        acp: {
          agents: {
            trae: {
              command: 'old-trae',
              models: [{ id: 'trae-model' }],
            },
          },
        },
      },
      user: {
        acp: {
          agents: {
            trae: {
              command: 'old-trae',
              models: [{ id: 'trae-model' }],
            },
          },
        },
      },
    }

    const result = parseAgentImport(ZED_JSON, snapshot)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const trae = result.entries.find(e => e.route === 'trae')
    expect(trae?.replaces).toBe(true)
    expect(trae?.profile.models).toEqual([{ id: 'trae-model' }])
    expect(trae?.profile.command).toBe('traecli')
  })

  it('merges resolved base with partial raw user overrides, keeping raw authoritative and preserving resolved advanced fields', () => {
    // Route has partial raw user override (only command and custom permission),
    // while effective/schema-resolved profile provides models, contextWindow, authMethod
    const snapshot = {
      value: {
        acp: {
          agents: {
            claude: {
              command: 'old-claude',
              permission: 'ask',
              models: [{ id: 'claude-3-opus' }],
              contextWindow: 200000,
              authMethod: 'api-key',
            },
          },
        },
      },
      user: {
        acp: {
          agents: {
            claude: {
              command: 'old-claude-user',
              permission: 'reject', // raw user override must take precedence over resolved 'ask'
            },
          },
        },
      },
    }

    const result = parseAgentImport(ZED_JSON, snapshot)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const claude = result.entries.find(e => e.route === 'claude')
    expect(claude).toBeDefined()
    expect(claude!.replaces).toBe(true)
    // Preserves resolved-only fields (models, contextWindow, authMethod)
    // Preserves raw authoritative override (permission: 'reject' instead of 'ask')
    // Overlays imported command, args, env, displayName
    expect(claude!.profile).toEqual({
      permission: 'reject',
      models: [{ id: 'claude-3-opus' }],
      contextWindow: 200000,
      authMethod: 'api-key',
      displayName: 'Claude',
      command: 'npx',
      args: ['-y', '@agentclientprotocol/claude-agent-acp'],
      env: { PATH, CLAUDE_CODE_EXECUTABLE: '/Users/you/.local/bin/claude' },
    })
  })
})

describe('importOpsOf', () => {
  it('generates set ops targeting ["acp", "agents", route]', () => {
    const entries: AgentImportEntry[] = [
      {
        name: 'Agent 1',
        route: 'agent-1',
        replaces: false,
        profile: { command: 'run-1', permission: 'ask' },
      },
      {
        name: 'Agent 2',
        route: 'agent-2',
        replaces: true,
        profile: { command: 'run-2', permission: 'read-only' },
      },
    ]

    const ops = importOpsOf(entries)
    expect(ops).toEqual([
      {
        op: 'set',
        path: ['acp', 'agents', 'agent-1'],
        value: { command: 'run-1', permission: 'ask' },
      },
      {
        op: 'set',
        path: ['acp', 'agents', 'agent-2'],
        value: { command: 'run-2', permission: 'read-only' },
      },
    ])
  })
})

describe('bindAcpConfigForm and external store', () => {
  it('tracks snapshot changes and notifies subscribers', () => {
    const form = createMockForm({ status: 'ready', writable: true, revision: 10 })
    const cleanup = bindAcpConfigForm(form)

    expect(getAcpConfigFormSnapshot().status).toBe('ready')
    expect(getAcpConfigFormSnapshot().revision).toBe(10)

    let notified = 0
    const unsub = subscribeAcpConfigForm(() => {
      notified++
    })

    form.setSnapshot({ revision: 11 })
    expect(notified).toBe(1)
    expect(getAcpConfigFormSnapshot().revision).toBe(11)

    unsub()
    cleanup()

    expect(getAcpConfigFormSnapshot().status).toBe('unavailable')
  })
})

describe('configuredRoutesOf', () => {
  it('returns empty array when snapshot is missing or empty', () => {
    expect(configuredRoutesOf(null)).toEqual([])
    expect(configuredRoutesOf(undefined)).toEqual([])
    expect(configuredRoutesOf({})).toEqual([])
    expect(configuredRoutesOf({ value: {}, user: {} })).toEqual([])
  })

  it('extracts and sorts routes alphabetically by route id', () => {
    const snapshot = {
      value: {
        acp: {
          agents: {
            zeta: { command: 'zeta-cmd', displayName: 'Zeta Agent' },
            alpha: { command: 'alpha-cmd', args: ['--serve'] },
            beta: { command: 'beta-cmd' },
          },
        },
      },
    }
    const routes = configuredRoutesOf(snapshot)
    expect(routes).toHaveLength(3)
    expect(routes[0]).toEqual({
      route: 'alpha',
      displayName: 'alpha',
      command: 'alpha-cmd',
      args: ['--serve'],
    })
    expect(routes[1]).toEqual({
      route: 'beta',
      displayName: 'beta',
      command: 'beta-cmd',
      args: [],
    })
    expect(routes[2]).toEqual({
      route: 'zeta',
      displayName: 'Zeta Agent',
      command: 'zeta-cmd',
      args: [],
    })
  })

  it('merges user overrides with resolved base values, keeping user overrides on conflict', () => {
    const snapshot = {
      value: {
        acp: {
          agents: {
            devin: {
              command: '/usr/local/bin/devin',
              args: ['acp'],
              displayName: 'Devin Base',
            },
          },
        },
      },
      user: {
        acp: {
          agents: {
            devin: {
              displayName: 'Devin Custom',
              args: ['acp', '--verbose'],
            },
          },
        },
      },
    }
    const routes = configuredRoutesOf(snapshot)
    expect(routes).toHaveLength(1)
    expect(routes[0]).toEqual({
      route: 'devin',
      displayName: 'Devin Custom',
      command: '/usr/local/bin/devin',
      args: ['acp', '--verbose'],
    })
  })
})

describe('AcpSettingsGuide component UI', () => {
  const roots: ReactTestRenderer[] = []

  afterEach(async () => {
    await act(async () => {
      roots.splice(0).forEach(r => r.unmount())
    })
    vi.restoreAllMocks()
  })

  it('renders textarea with gray placeholder and disables parse when empty', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm()
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const textarea = root.root.findByProps({ className: 'acp-import-textarea' })
    expect(textarea.props.placeholder).toContain('"agent_servers"')
    expect(textarea.props.value).toBe('')

    const parseBtn = root.root.findByProps({ children: '解析配置' })
    expect(parseBtn.props.disabled).toBe(true)

    cleanup()
  })

  it('parses pasted JSON, displays route preview, tags, and toggles selection', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm({
      value: {
        acp: {
          agents: {
            trae: { command: 'old-trae' },
          },
        },
      },
      user: {
        acp: {
          agents: {
            trae: { command: 'old-trae' },
          },
        },
      },
    })
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const textarea = root.root.findByProps({ className: 'acp-import-textarea' })
    await act(async () => {
      textarea.props.onChange({ target: { value: ZED_JSON } })
    })

    const parseBtn = root.root.findByProps({ children: '解析配置' })
    expect(parseBtn.props.disabled).toBe(false)

    await act(async () => {
      parseBtn.props.onClick()
    })

    // Entries should be rendered
    const importList = root.root.findByProps({ 'aria-label': '解析得到的线路列表' })
    const rows = importList.findAllByProps({ className: 'acp-entry-row' })
    expect(rows).toHaveLength(4)

    // Check replacement vs new tags
    const newTags = root.root.findAllByProps({ className: 'acp-tag acp-tag-success' })
    const replaceTags = root.root.findAllByProps({ className: 'acp-tag acp-tag-warning' })
    expect(newTags).toHaveLength(3) // CodeBuddy, Claude, Codex
    expect(replaceTags).toHaveLength(1) // Trae

    // Toggle deselection of one route
    const checkboxes = root.root.findAllByType('input').filter(i => i.props.type === 'checkbox')
    expect(checkboxes).toHaveLength(4)
    expect(checkboxes.every(c => c.props.checked)).toBe(true)

    // When all are selected, toggle button shows "全不选"
    const deselectAllBtn = root.root.findByProps({ children: '全不选' })
    expect(deselectAllBtn).toBeDefined()

    // Deselect Trae -> selected.length < entries.length -> button switches to "全选"
    const traeCheckbox = root.root.findByProps({ 'aria-label': '选择导入 Trae' })
    await act(async () => {
      traeCheckbox.props.onChange({ target: { checked: false } })
    })

    expect(traeCheckbox.props.checked).toBe(false)

    // Select all button
    const selectAllBtn = root.root.findByProps({ children: '全选' })
    await act(async () => {
      selectAllBtn.props.onClick()
    })

    const finalCheckboxes = root.root.findAllByType('input').filter(i => i.props.type === 'checkbox')
    expect(finalCheckboxes.every(c => c.props.checked)).toBe(true)

    // Deselect all
    const deselectAllAgain = root.root.findByProps({ children: '全不选' })
    await act(async () => {
      deselectAllAgain.props.onClick()
    })
    const noneChecked = root.root.findAllByType('input').filter(i => i.props.type === 'checkbox')
    expect(noneChecked.every(c => !c.props.checked)).toBe(true)

    cleanup()
  })

  it('performs atomic mutation via form.mutate and displays explicit restart notice on success', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm({ revision: 42, mutateResult: true })
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const textarea = root.root.findByProps({ className: 'acp-import-textarea' })
    await act(async () => {
      textarea.props.onChange({ target: { value: ZED_JSON } })
    })

    const parseBtn = root.root.findByProps({ children: '解析配置' })
    await act(async () => {
      parseBtn.props.onClick()
    })

    const importBtn = root.root.findByProps({ className: 'acp-btn-primary' })
    expect(importBtn.props.disabled).toBe(false)
    expect(importBtn.children).toContain('导入 4 个 Agent')

    await act(async () => {
      await importBtn.props.onClick()
    })

    expect(form.mutate).toHaveBeenCalledTimes(1)
    const [ops, revision] = (form.mutate as any).mock.calls[0]
    expect(revision).toBe(42)
    expect(ops).toHaveLength(4)
    expect(ops[0].path).toEqual(['acp', 'agents', 'codebuddy-code'])

    // Success banner and restart notice
    const successBanner = root.root.findByProps({ className: 'acp-banner acp-banner-success' })
    expect(successBanner).toBeDefined()
    const restartNotice = root.root.findByProps({ className: 'acp-restart-notice' })
    expect(restartNotice.children.join('')).toContain('必须重启 Host 才能使新线路生效')

    cleanup()
  })

  it('displays host refusal on mutate false and does not claim success', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm({ revision: 42, mutateResult: false })
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const textarea = root.root.findByProps({ className: 'acp-import-textarea' })
    await act(async () => {
      textarea.props.onChange({ target: { value: ZED_JSON } })
    })

    const parseBtn = root.root.findByProps({ children: '解析配置' })
    await act(async () => {
      parseBtn.props.onClick()
    })

    const importBtn = root.root.findByProps({ className: 'acp-btn-primary' })
    await act(async () => {
      await importBtn.props.onClick()
    })

    const errorBanner = root.root.findByProps({ className: 'acp-banner acp-banner-error' })
    const innerDiv = errorBanner.children[0] as unknown as { props: { children: string } }
    expect(innerDiv.props.children).toContain('Host 拒绝了配置写入')
    expect(root.root.findAllByProps({ className: 'acp-restart-notice' })).toHaveLength(0)

    cleanup()
  })

  it('displays caught error message when form.mutate rejects', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm({
      revision: 42,
      mutateResult: () => Promise.reject(new Error('Network transport failed')),
    })
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const textarea = root.root.findByProps({ className: 'acp-import-textarea' })
    await act(async () => {
      textarea.props.onChange({ target: { value: ZED_JSON } })
    })

    const parseBtn = root.root.findByProps({ children: '解析配置' })
    await act(async () => {
      parseBtn.props.onClick()
    })

    const importBtn = root.root.findByProps({ className: 'acp-btn-primary' })
    await act(async () => {
      await importBtn.props.onClick()
    })

    const errorBanner = root.root.findByProps({ className: 'acp-banner acp-banner-error' })
    const innerDiv = errorBanner.children[0] as unknown as { props: { children: string } }
    expect(innerDiv.props.children).toContain('导入失败：Network transport failed')

    cleanup()
  })

  it('disables import button and shows status hint when form is unavailable or read-only', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm({ status: 'unavailable', writable: false })
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const statusHint = root.root.findByProps({ role: 'status' })
    expect(statusHint.children.join('')).toContain('不可用')

    const importBtn = root.root.findByProps({ className: 'acp-btn-primary' })
    expect(importBtn.props.disabled).toBe(true)

    cleanup()
  })

  it('renders textarea with Devin JSON example placeholder', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm()
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const textarea = root.root.findByProps({ className: 'acp-import-textarea' })
    expect(textarea.props.placeholder).toContain('"devin"')
    expect(textarea.props.placeholder).toContain('/home/zlw/.local/share/devin/cli/_versions/current/bin/devin')
    expect(textarea.props.placeholder).toContain('"acp"')

    cleanup()
  })

  it('fills Devin example on button click and allows parsing it', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm()
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const fillBtn = root.root.findByProps({ children: '填入 Devin 示例' })
    await act(async () => {
      fillBtn.props.onClick()
    })

    const textarea = root.root.findByProps({ className: 'acp-import-textarea' })
    expect(textarea.props.value).toContain('"devin"')

    const parseBtn = root.root.findByProps({ children: '解析配置' })
    expect(parseBtn.props.disabled).toBe(false)

    await act(async () => {
      parseBtn.props.onClick()
    })

    const rows = root.root.findAllByProps({ className: 'acp-entry-row' })
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const devinName = root.root.findByProps({ className: 'acp-entry-name', children: 'devin' })
    expect(devinName).toBeDefined()

    cleanup()
  })

  it('displays configured ACP routes from the form snapshot', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm({
      value: {
        acp: {
          agents: {
            devin: {
              displayName: 'Devin Agent',
              command: '/home/zlw/.local/share/devin/cli/_versions/current/bin/devin',
              args: ['acp'],
            },
            claude: {
              command: 'claude-acp',
              args: [],
            },
          },
        },
      },
    })
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const configuredSection = root.root.findByProps({
      role: 'region',
      'aria-label': '已配置的 ACP 线路',
    })
    expect(configuredSection).toBeDefined()

    const list = root.root.findByProps({ 'aria-label': '已配置线路清单' })
    expect(list).toBeDefined()

    const names = root.root.findAllByProps({ className: 'acp-entry-name' })
    const textNames = names.map(n => n.children.join(''))
    expect(textNames).toContain('claude')
    expect(textNames).toContain('Devin Agent')

    const configuredTags = root.root.findAllByProps({ className: 'acp-tag acp-tag-info' })
    expect(configuredTags).toHaveLength(2)
    expect(configuredTags[0].children).toContain('已配置')

    // Disclaims live process probe
    const disclaimer = configuredSection.findAllByType('p').find(p => p.children.join('').includes('不代表当前 agent 进程正在运行'))
    expect(disclaimer).toBeDefined()

    cleanup()
  })

  it('displays empty hint when no ACP routes are configured', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm({ value: { acp: { agents: {} } } })
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const emptyHint = root.root.findByProps({ className: 'acp-empty-hint' })
    expect(emptyHint.children.join('')).toContain('当前未配置任何 ACP 线路')

    cleanup()
  })

  it('does not render migration reminder card in the DOM', async () => {
    pinLanguage('zh-CN')
    const form = createMockForm()
    const cleanup = bindAcpConfigForm(form)

    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(AcpSettingsGuide))
    })
    roots.push(root)

    const h4Elements = root.root.findAllByType('h4')
    const titles = h4Elements.map(h => h.children.join(''))
    expect(titles).not.toContain('迁移提醒')
    expect(titles).not.toContain('Before you migrate')

    cleanup()
  })
})
