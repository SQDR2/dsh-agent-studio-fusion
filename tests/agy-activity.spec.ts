import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The shipped bundle treats the primitive atoms as Host-provided; this checkout
// links no DOM deps for them, so assert the props the card passes instead.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  DiffBlock: () => null,
  TerminalBlock: () => null,
}))
import { DiffBlock, TerminalBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { mirrorStepInvocation, presentsActivity } from '../src/activity.js'
import type { FusionActivity } from '../src/activity.js'
import { activityRows } from '../src/client/activity-model.js'
import { ActivityCard } from '../src/client/ActivityRows.js'
import { presentedCall, presentedCommand, presentedExitCode, presentedPath, presentsTerminal } from '../src/client/agy-activity.js'

const exitOf = (name: string, args: unknown, output: string) =>
  presentedExitCode(presentedCall(name, JSON.stringify(args)), output)
import { pinLanguage } from './client-locale.js'

const roots: ReactTestRenderer[] = []
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()) }); vi.unstubAllGlobals() })

/** The wrapper dsh-agy-worker's buildMirrorRunCode emits for a recorded step. */
const wrapperCode = (run: string, step: number, tool: string) =>
  '// dsh-agy-worker mirror: replay recorded agy tool step ' + step + ' (' + tool + ')\n' +
  "return await tools['agy_tool'](" + JSON.stringify({ run, step }) + ')'

const callEvent = (name: string, args: unknown, callId = 'call-1', seq = 1): FusionActivity => ({
  schemaVersion: 1, taskId: 'task-1', childSessionId: 'child-1', parentCallId: 'parent-call', turn: 1, step: 1, anchorSeq: 1,
  source: { type: 'tool/call', seq, time: 0, data: { turn: 1, step: 1, callId,
    name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } },
} as unknown as FusionActivity)

const resultEvent = (text: string, isError = false, callId = 'call-1', seq = 2): FusionActivity => ({
  schemaVersion: 1, taskId: 'task-1', childSessionId: 'child-1', parentCallId: 'parent-call', turn: 1, step: 1, anchorSeq: 1,
  source: { type: 'tool/result', seq, time: 0, data: { turn: 1, step: 1,
    message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId,
      content: [{ type: 'text', text }], isError } } },
} as unknown as FusionActivity)

const rowOf = (call: FusionActivity, result?: FusionActivity) => activityRows(result ? [call, result] : [call])[0]!

async function renderRow(call: FusionActivity, result?: FusionActivity) {
  pinLanguage('zh-CN')
  let root!: ReactTestRenderer
  await act(async () => {
    root = create(React.createElement(ActivityCard, { row: rowOf(call, result), done: Boolean(result), cwd: '/workspace', openFile: () => {} }))
  })
  roots.push(root)
  await act(async () => { root.root.findAllByType('button')[0]!.props.onClick() })
  return root
}

const text = (root: ReactTestRenderer) => JSON.stringify(root.toJSON())

describe('agy activity projection predicate', () => {
  it('accepts the registered bridge transport but no arbitrary unknown tool', () => {
    expect(presentsActivity('agy_tool', '{"run":"r","step":1,"tool":"run_command"}')).toBe(true)
    expect(presentsActivity('agy_tool', 'not json')).toBe(true)
    for (const name of ['bash', 'pwsh', 'read', 'write', 'edit', 'glob', 'grep', 'job_output', 'job_kill', 'str_replace_editor']) {
      expect(presentsActivity(name, '{}'), name).toBe(true)
    }
    expect(presentsActivity('mystery_tool', '{}')).toBe(false)
    expect(presentsActivity('fusion_submit_result', '{}')).toBe(false)
    expect(presentsActivity('run_code', '{}')).toBe(false)
  })

  it('accepts only the generated Code Mode mirror wrapper, never general run_code', () => {
    const code = wrapperCode('run-1', 3, 'run_command')
    expect(mirrorStepInvocation(code)).toEqual({ run: 'run-1', step: 3, tool: 'run_command' })
    expect(presentsActivity('run_code', JSON.stringify({ code }))).toBe(true)
    expect(presentsActivity('run_code', JSON.stringify({ code: 'while (true) {}' }))).toBe(false)
    expect(presentsActivity('run_code', JSON.stringify({ code: code + '\nprocess.exit(1)' }))).toBe(false)
    expect(presentsActivity('run_code', JSON.stringify({ code:
      "return await tools['agy_tool']({\"run\":\"r\",\"step\":1}); process.exit(1)" }))).toBe(false)
    const other = code.replace("tools['agy_tool']", "tools['other_tool']")
    expect(mirrorStepInvocation(other)).toBeUndefined()
    expect(presentsActivity('run_code', JSON.stringify({ code: other }))).toBe(false)
    expect(mirrorStepInvocation('// dsh-agy-worker mirror: replay recorded agy tool step 3 (run_command)')).toBeUndefined()
    // The step in the comment must agree with the recorded cursor.
    expect(mirrorStepInvocation(wrapperCode('run-1', 3, 'run_command').replace('step 3', 'step 4'))).toBeUndefined()
  })
})

describe('agy activity rows decode the recorded operation', () => {
  it('unwraps agy shell fields, including Cwd', () => {
    const call = presentedCall('agy_tool', JSON.stringify({ run: 'run-1', step: 1, tool: 'run_command',
      input: { CommandLine: 'pytest -q', Cwd: '/repo', Description: 'Run the suite' } }))
    expect(call).toMatchObject({ tool: 'run_command', transport: 'agy_tool', malformed: false })
    expect(presentedCommand(call)).toBe('pytest -q')
    expect(presentsTerminal(call)).toBe(true)
  })

  it('unwraps PascalCase file operations and MCP-shaped steps', () => {
    expect(presentedPath(presentedCall('agy_tool', JSON.stringify({ tool: 'view_file', input: { AbsolutePath: '/repo/calc.py' } }))))
      .toBe('/repo/calc.py')
    const write = presentedCall('agy_tool', JSON.stringify({ tool: 'write_to_file',
      input: { TargetFile: '/repo/calc.py', CodeContent: 'return a + b' } }))
    expect(presentedPath(write)).toBe('/repo/calc.py')
    expect(presentsTerminal(write)).toBe(false)
    const edit = presentedCall('agy_tool', JSON.stringify({ tool: 'replace_file_content',
      input: { TargetFile: '/repo/calc.py', TargetContent: 'return a - b', ReplacementContent: 'return a + b' } }))
    expect(presentedPath(edit)).toBe('/repo/calc.py')
    const meta = presentedCall('agy_tool', JSON.stringify({ tool: 'call_mcp_tool',
      input: { ServerName: 'fs', ToolName: 'read_file', Arguments: { AbsolutePath: '/repo/a.py' } } }))
    expect(meta).toMatchObject({ tool: 'read_file', server: 'fs' })
    expect(presentedPath(meta)).toBe('/repo/a.py')
    expect(presentedCall('agy_tool', JSON.stringify({ tool: 'mcp__fs__edit',
      input: { TargetFile: '/repo/b.py' } }))).toMatchObject({ tool: 'edit', server: 'fs' })
  })

  it('keeps a readable original tool name and raw arguments for anything unknown or malformed', () => {
    const unknown = presentedCall('agy_tool', JSON.stringify({ tool: 'custom_operation', input: { Anything: 1 } }))
    expect(unknown).toMatchObject({ tool: 'custom_operation', malformed: false })
    expect(unknown.arguments).toEqual({ Anything: 1 })
    const malformed = presentedCall('agy_tool', '{not json')
    expect(malformed).toMatchObject({ tool: 'agy_tool', malformed: true })
    expect(malformed.raw).toBe('{not json')
    const noTool = presentedCall('agy_tool', JSON.stringify({ run: 'r', step: 1 }))
    expect(noTool).toMatchObject({ tool: 'agy_tool', malformed: false })
  })

  it('recovers the real tool from a Code Mode mirror wrapper without reading its input', () => {
    const call = presentedCall('run_code', JSON.stringify({ code: wrapperCode('run-1', 2, 'view_file'), description: 'calc.py · view_file' }))
    expect(call).toMatchObject({ tool: 'view_file', transport: 'run_code', malformed: false })
    expect(call.arguments).toEqual({ Description: 'calc.py · view_file' })
  })

  it('reads an agy shell exit code from the agy format, and `Command` as its command line', () => {
    expect(exitOf('agy_tool', { tool: 'run_command' }, 'ok\n[exit code 0]')).toBe(0)
    expect(exitOf('agy_tool', { tool: 'run_command' }, 'boom\nThe command exited with code 2')).toBe(2)
    expect(exitOf('agy_tool', { tool: 'run_command' }, '[command timed out after 60s]')).toBeUndefined()
    expect(exitOf('agy_tool', { tool: 'run_command' }, 'all good')).toBeUndefined()
    expect(presentedCommand(presentedCall('agy_tool', JSON.stringify({ tool: 'run_command', input: { Command: 'npm test' } }))))
      .toBe('npm test')
    expect(presentsTerminal(presentedCall('agy_tool', JSON.stringify({ tool: 'run_command' })))).toBe(true)
    // An agy step that happens to be named like a Host tool still uses agy's format.
    expect(exitOf('agy_tool', { tool: 'bash' }, 'done\nThe command exited with code 3')).toBe(3)
  })

  it('keeps the native exit marker semantics and does not read a code out of file content', () => {
    // The Host writes its marker on the last line only; a quoted marker mid-output
    // is command output, not this command's status.
    expect(exitOf('bash', { command: 'git log -1' }, 'quoted [exit code: 3]\nreal work\n[exit code: 0]')).toBe(0)
    expect(exitOf('bash', { command: 'echo "[exit code: 7]"' }, 'echoing\n[exit code: 0]')).toBe(0)
    expect(exitOf('bash', { command: 'x' }, 'no marker at all')).toBeUndefined()
    // Reading a file that happens to contain an exit line is not a terminal step.
    const readArgs = { tool: 'view_file', input: { AbsolutePath: '/repo/test.py' } }
    const source = 'subprocess.run(["-c", "exit 1"])\nassert proc.returncode == 1\nThe command exited with code 1\n[exit code: 1]'
    expect(exitOf('agy_tool', readArgs, source)).toBeUndefined()
    expect(presentsTerminal(presentedCall('agy_tool', JSON.stringify(readArgs)))).toBe(false)
    expect(exitOf('read', { file_path: '/repo/test.py' }, source)).toBeUndefined()
    expect(exitOf('grep', { pattern: 'exit' }, '[exit code: 4]')).toBeUndefined()
  })

  it('keeps pwsh a terminal card', () => {
    expect(presentsTerminal(presentedCall('pwsh', JSON.stringify({ command: 'Get-ChildItem' })))).toBe(true)
    expect(exitOf('pwsh', { command: 'Get-ChildItem' }, 'ok\n[exit code: 0]')).toBe(0)
  })
})

describe('agy activity rendering', () => {
  it('renders a shell step as a terminal card with its command, cwd and real exit code', async () => {
    const root = await renderRow(
      callEvent('agy_tool', { run: 'run-1', step: 1, tool: 'run_command', input: { CommandLine: 'pytest -q', Cwd: '/repo/app' } }),
      resultEvent('2 passed\nThe command exited with code 1'))
    const terminal = root.root.findByType(TerminalBlock)
    expect(terminal.props.command).toBe('pytest -q')
    expect(terminal.props.cwd).toBe('/repo/app')
    expect(terminal.props.exitCode).toBe(1)
    expect(root.root.findByProps({ role: 'status' }).props['data-failed']).toBe(true)
    expect(text(root)).toContain('终端')
  })

  it('renders a pwsh step as a terminal card exactly as before', async () => {
    const root = await renderRow(callEvent('pwsh', { command: 'Get-ChildItem' }), resultEvent('a\n[exit code: 0]'))
    const terminal = root.root.findByType(TerminalBlock)
    expect(terminal.props.command).toBe('Get-ChildItem')
    expect(terminal.props.exitCode).toBe(0)
    expect(text(root)).toContain('终端')
  })

  it('does not fail a read whose file content quotes an exit line, and keeps native mid-line markers out', async () => {
    const source = 'if code != 0:\n    raise SystemExit\n# [exit code: 1]\nThe command exited with code 1'
    const read = await renderRow(
      callEvent('agy_tool', { tool: 'view_file', input: { AbsolutePath: 'test_calc.py' } }),
      resultEvent(source))
    expect(read.root.findAllByType(TerminalBlock)).toHaveLength(0)
    expect(read.root.findAllByProps({ role: 'status' })).toHaveLength(0)
    expect(text(read)).toContain('The command exited with code 1')
    const nativeBash = await renderRow(callEvent('bash', { command: 'go test ./...' }),
      resultEvent('[exit code: 5] appears in this line\ngo test: ok\n[exit code: 0]'))
    expect(nativeBash.root.findByType(TerminalBlock).props.exitCode).toBe(0)
    const quoted = await renderRow(callEvent('bash', { command: 'echo "[exit code: 7]"' }), resultEvent('echoed\n[exit code: 0]'))
    expect(quoted.root.findByType(TerminalBlock).props.exitCode).toBe(0)
  })

  it('renders a file step with its recorded path and output instead of a fabricated diff', async () => {
    const root = await renderRow(
      callEvent('agy_tool', { run: 'run-1', step: 1, tool: 'write_to_file', input: { TargetFile: 'calc.py', CodeContent: 'return a + b' } }),
      resultEvent('file written'))
    expect(root.root.findAllByType(TerminalBlock)).toHaveLength(0)
    expect(text(root)).toContain('calc.py')
    expect(text(root)).toContain('file written')
    expect(root.root.findAllByType(DiffBlock)).toHaveLength(0)
  })

  it('renders an unknown inner tool by its readable name and a malformed payload by its raw arguments', async () => {
    const unknown = await renderRow(callEvent('agy_tool', { tool: 'custom_operation', input: { Anything: 1 } }),
      resultEvent('custom output'))
    expect(unknown.root.findByProps({ 'data-fusion-inner': 'custom_operation' })).toBeDefined()
    expect(text(unknown)).toContain('custom output')
    const broken = await renderRow(callEvent('agy_tool', '{not json'), resultEvent(''))
    expect(broken.root.findByProps({ 'data-fusion-inner': 'agy_tool' })).toBeDefined()
    expect(text(broken)).toContain('not json')
  })

  it('keeps existing Host tools rendering through the same card', async () => {
    const root = await renderRow(callEvent('bash', { command: 'printf hi' }), resultEvent('hi\n[exit code: 0]'))
    const terminal = root.root.findByType(TerminalBlock)
    expect(terminal.props.command).toBe('printf hi')
    expect(terminal.props.cwd).toBe('/workspace')
    expect(terminal.props.exitCode).toBe(0)
    expect(text(root)).toContain('终端')
  })

  it('renders a Code Mode mirror wrapper by the real tool it names', async () => {
    const root = await renderRow(
      callEvent('run_code', { code: wrapperCode('run-1', 2, 'run_command'), description: 'Run tests · run_command' }),
      resultEvent('1 passed'))
    expect(root.root.findAllByType(TerminalBlock)).toHaveLength(0)
    expect(text(root)).toContain('终端')
    expect(text(root)).toContain('Run tests · run_command')
    expect(root.root.findByProps({ 'data-fusion-tool': 'run_code' })).toBeDefined()
    expect(root.root.findByProps({ 'data-fusion-inner': 'run_command' })).toBeDefined()
  })
})

describe('activity row pairing', () => {
  it('pairs a transport call with its result and leaves an unpaired call visible', () => {
    const paired = rowOf(callEvent('agy_tool', { tool: 'run_command' }), resultEvent('done'))
    expect(paired.call.data.name).toBe('agy_tool')
    expect(paired.result?.type).toBe('tool/result')
    const pending = rowOf(callEvent('agy_tool', { tool: 'run_command' }, 'call-2', 3))
    expect(pending.result).toBeUndefined()
  })
})
