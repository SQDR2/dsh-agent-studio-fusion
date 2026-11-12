import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import { AGY_PROVIDER, AGY_API_PATH } from '../src/identity.js'
import { PROVIDER_ID, PLUGIN_ID } from '../src/host/agy/types.js'
import { AGY_TOOL_VIEWS, parseAgyMirrorFromCode, runCodeModel } from '../src/client/agy/toolview.js'
import { mirrorStepInvocation } from '../src/activity.js'

/** Exactly what dsh-agy-worker's `buildMirrorRunCode` emits for one recorded step. */
const wrapper = (run: string, step: number, tool: string) =>
  '// dsh-agy-worker mirror: replay recorded agy tool step ' + step + ' (' + tool + ')\n' +
  "return await tools['agy_tool'](" + JSON.stringify({ run, step }) + ')'

const argsOf = (code: string, description?: string) =>
  JSON.stringify(description === undefined ? { code } : { code, description })

describe('the built-in AGY identity keeps the upstream spellings', () => {
  it('registers the antigravity route and the /plugins/agy-worker prefix', () => {
    expect(AGY_PROVIDER).toBe('antigravity')
    expect(PROVIDER_ID).toBe('antigravity')
    expect(AGY_API_PATH).toBe('/plugins/agy-worker')
    // The route prefix is the plugin id upstream — the console polls it verbatim.
    expect(PLUGIN_ID).toBe('agy-worker')
  })
})

describe('the AGY tool views are exactly the two keyed names upstream registered', () => {
  it('contributes agy_tool and run_code, and nothing else', () => {
    expect(AGY_TOOL_VIEWS.map(view => view.key)).toEqual(['agy_tool', 'run_code'])
  })
})

describe('run_code view: the generated AGY mirror wrapper is recognized strictly', () => {
  it('recovers the cursor and tool from the generated wrapper', () => {
    expect(parseAgyMirrorFromCode(argsOf(wrapper('run-1', 4, 'run_command'))))
      .toEqual({ run: 'run-1', step: 4, tool: 'run_command' })
  })

  it('agrees with the activity projection that reads the same wrapper', () => {
    const code = wrapper('run-2', 7, 'view_file')
    expect(mirrorStepInvocation(code)).toEqual({ run: 'run-2', step: 7, tool: 'view_file' })
    expect(parseAgyMirrorFromCode(argsOf(code))).toEqual({ run: 'run-2', step: 7, tool: 'view_file' })
  })

  it('leaves an ordinary Code Mode program alone', () => {
    const ordinary = 'const files = await tools.glob({ pattern: "**/*.ts" })\nreturn files.length'
    expect(parseAgyMirrorFromCode(argsOf(ordinary, 'Count TypeScript files'))).toBeNull()
    // It still renders as a code card with its own description and body.
    const model = runCodeModel({ kind: 'tool-result', call: { name: 'run_code', argsRaw: argsOf(ordinary, 'Count TypeScript files') },
      content: [], isError: false } as never)
    expect(model.title).toBe('Count TypeScript files')
    expect(model.code).toBe(ordinary)
  })

  it('rejects look-alikes: another transport, a mismatched cursor, extra statements', () => {
    // A wrapper naming a tool that is not this plugin's route transport.
    expect(parseAgyMirrorFromCode(argsOf(
      '// dsh-agy-worker mirror: replay recorded agy tool step 1 (run_command)\n' +
      "return await tools['not_a_transport']({\"run\":\"r\",\"step\":1})"))).toBeNull()
    // Comment and call disagree about the step.
    expect(parseAgyMirrorFromCode(argsOf(
      '// dsh-agy-worker mirror: replay recorded agy tool step 2 (run_command)\n' +
      "return await tools['agy_tool']({\"run\":\"r\",\"step\":1})"))).toBeNull()
    // Anything beyond the exact generated pair of lines is ordinary code.
    expect(parseAgyMirrorFromCode(argsOf(wrapper('r', 1, 'run_command') + '\nconsole.log(1)'))).toBeNull()
    // Non-JSON arguments are not a mirror program either.
    expect(parseAgyMirrorFromCode('not json')).toBeNull()
  })

  it('treats malformed JSON arguments as ordinary code, never as a wrapper', () => {
    expect(parseAgyMirrorFromCode('{"code": ')).toBeNull()
    const model = runCodeModel({ kind: 'tool-result', call: { name: 'run_code', argsRaw: '{"code": ' }, content: [], isError: false } as never)
    // The raw args stay visible verbatim when they cannot be parsed.
    expect(model.code).toBe('{"code": ')
  })
})

describe('the registered run_code view renders both shapes', () => {
  const roots: ReactTestRenderer[] = []
  const render = async (component: (props?: unknown) => React.ReactNode, argsRaw: string) => {
    let root!: ReactTestRenderer
    await act(async () => {
      root = create(React.createElement(component as never, {
        toolName: 'run_code',
        callId: 'call-1',
        phase: 'start',
        block: { name: 'run_code', argsRaw, callId: 'call-1', turn: 1, step: 1, time: 0, subCalls: [] },
        openFile: () => {},
      }))
    })
    roots.push(root)
    return JSON.stringify(root.toJSON())
  }

  afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()) }) })

  it('renders the generated wrapper as the Antigravity card', async () => {
    const view = AGY_TOOL_VIEWS.find(entry => entry.key === 'run_code')!.component
    const json = await render(view, argsOf(wrapper('run-3', 2, 'run_command')))
    // The mirror card owns the row and classifies the recorded agy step: a
    // run_command step becomes the terminal card, not a "replay step N" code row.
    expect(json).toContain('"data-kind":"terminal"')
    expect(json).toContain('Command')
    // It is the Antigravity card, never the generic code card of a wrapper.
    expect(json).not.toContain('"data-kind":"code"')
  })

  it('renders an ordinary program as the code card', async () => {
    const view = AGY_TOOL_VIEWS.find(entry => entry.key === 'run_code')!.component
    const json = await render(view, argsOf('return await tools.read({ path: "a.ts" })', 'Read one file'))
    // Ordinary Code Mode keeps its own card: the description is the title and the
    // program stays inspectable, exactly as before this port.
    expect(json).toContain('Read one file')
    expect(json).toContain('"data-kind":"code"')
    expect(json).not.toContain('run_command')
  })
})
