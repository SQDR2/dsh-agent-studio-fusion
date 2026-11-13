import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  executeSingleTool,
  installNativePresentation,
  rootCallIdOf,
  usesToolExecutors,
  type ScopedToolService,
} from '../src/host/tool-seam.js'

/**
 * The DSH tool runtime changed shape twice between the supported releases, and this seam is
 * the only place that knows. These cases pin both branches against the two contracts the
 * releases actually declare, because a mistake here is silent: the wrong branch either
 * advertises a wider role table than the ceiling allows or reports a native check that
 * never ran.
 */

const schema = (name: string) => ({ name, description: name, parameters: {} })

/** The 0.2.1 service: presentation by mode, one call per `execute`. */
function legacyTools(overrides: Partial<ScopedToolService> = {}) {
  const presentAs = vi.fn((_mode: 'native' | 'ptc') => () => {})
  const execute = vi.fn(async () => ({ isError: false, content: [{ type: 'text', text: 'ran' }], value: { ok: true } }))
  const service: ScopedToolService = { presentAs, execute, schemas: () => [schema('read')], ...overrides }
  return { service, presentAs, execute }
}

/** The 0.2.2 service: a scoped executor owns the table, and `execute` takes a raw batch. */
function batchTools(overrides: Partial<ScopedToolService> = {}) {
  const setExecutor = vi.fn((_executor: unknown) => () => {})
  const execute = vi.fn(async (input: unknown) => ({
    results: [{ callId: (input as { calls: { id: string }[] }).calls[0]!.id, result: { isError: false, content: [], value: { kind: 'foreground' } } }],
    additionalContexts: [{ id: 'ctx-1' }],
  }))
  const service: ScopedToolService = { setExecutor, execute, schemas: () => [schema('read')], ...overrides }
  return { service, setExecutor, execute }
}

describe('tool seam', () => {
  it('detects the executor contract by the function, never by a version string', () => {
    expect(usesToolExecutors(legacyTools().service)).toBe(false)
    expect(usesToolExecutors(batchTools().service)).toBe(true)
  })

  it('presents natively with the mode selector on 0.2.1', () => {
    const { service, presentAs } = legacyTools()
    const scope = { tools: service, logger: { warn: vi.fn() } } as unknown as Context
    const dispose = installNativePresentation({}, scope, () => ['read'], () => true)
    expect(presentAs).toHaveBeenCalledWith('native')
    expect(dispose).toBeTypeOf('function')
  })

  it('leaves the deployment table alone when no executor package is installed', () => {
    // This suite runs without the Host checkout, so `@deepseek-ai/dsh-tool-executor-native`
    // does not resolve — exactly the situation on a 0.2.2 Host that never mounted it. A
    // role ceiling cannot narrow a table this Host builds, and dropping the ceiling silently
    // would widen the role, so the seam refuses and says why. `native-tests/tool-seam`
    // covers the registering branch, which needs the real package.
    const { service, setExecutor } = batchTools()
    const warn = vi.fn()
    const scope = { tools: service, logger: { warn } } as unknown as Context
    const dispose = installNativePresentation({}, scope, () => ['read'], () => true)
    expect(dispose).toBeUndefined()
    expect(setExecutor).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no native tool executor'))
  })

  it('dispatches a single call as the release-specific input', async () => {
    const legacy = legacyTools()
    await executeSingleTool(legacy.service, {
      name: 'bash', arguments: { command: 'true' }, agent: undefined, callId: 'check-1',
      signal: new AbortController().signal, rootCallId: 'delegate-1',
    })
    expect(legacy.execute).toHaveBeenCalledWith(expect.objectContaining({
      callId: 'check-1', rootCallId: 'delegate-1', name: 'bash', arguments: { command: 'true' },
    }))

    const modern = batchTools()
    const outcome = await executeSingleTool(modern.service, {
      name: 'bash', arguments: { command: 'true' }, agent: undefined, callId: 'check-2',
      signal: new AbortController().signal, rootCallId: 'delegate-2',
    })
    // 0.2.2 accepts raw calls only: the arguments must already be the model's JSON string.
    expect(modern.execute).toHaveBeenCalledWith(expect.objectContaining({
      calls: [{ type: 'tool-call', id: 'check-2', name: 'bash', arguments: '{"command":"true"}' }],
    }))
    // Deferred context arrives at the batch level and must survive as the single-call shape.
    expect(outcome.additionalContexts).toEqual([{ id: 'ctx-1' }])
  })

  it('carries the enclosing call identity across the batch boundary', async () => {
    const modern = batchTools()
    const call = { callId: 'check-3', rootCallId: 'delegate-3', name: 'bash', arguments: {}, agent: undefined, signal: new AbortController().signal }
    const pending = executeSingleTool(modern.service, call)
    // An approval raised during the call resolves its root before the call settles.
    expect(rootCallIdOf({ callId: 'check-3' })).toBe('delegate-3')
    await pending
    // Once settled the correlation is dropped, so the map cannot grow per check.
    expect(rootCallIdOf({ callId: 'check-3' })).toBe('check-3')
  })

  it('reports a missing executor instead of pretending a check ran', async () => {
    const service: ScopedToolService = {}
    await expect(executeSingleTool(service, {
      name: 'bash', arguments: {}, agent: undefined, callId: 'c', signal: new AbortController().signal,
    })).rejects.toThrow('ctx.tools.execute')
  })
})
