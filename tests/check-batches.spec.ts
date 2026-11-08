import { describe, expect, it } from 'vitest'
import { checkBatches, MAX_CONCURRENT_CHECKS } from '../src/host/native-checks.js'
import type { CheckDefinition, FrozenCheck } from '../src/host/native-checks.js'
import { normalizeChecks } from '../src/host/coordinator.js'

/**
 * Acceptance commands run one at a time by default. Overlapping them is only
 * safe when the Lead says two commands share no state, because the Host cannot
 * see which ones share a cache directory. These tests pin both halves of that
 * contract: the default stays serial, and the opt-in is honoured but bounded.
 */
function check(id: string, independent?: boolean): FrozenCheck {
  const definition: CheckDefinition = { id, description: id, command: `run ${id}`, kind: 'static-check',
    parser: 'exit-code', definitionPaths: [], ...(independent === undefined ? {} : { independent }) }
  return { definition, plan: { id: `check:${id}` } as never }
}

const ids = (batches: FrozenCheck[][]) => batches.map(batch => batch.map(item => item.definition.id))

describe('acceptance check batching', () => {
  it('runs every command alone when none is marked independent', () => {
    // The default must stay serial: the Host cannot prove two arbitrary commands
    // do not share a cache, and a corrupted cache produces a false failure.
    expect(ids(checkBatches([check('a'), check('b'), check('c')]))).toEqual([['a'], ['b'], ['c']])
  })

  it('overlaps consecutive independent commands, up to the bound', () => {
    expect(ids(checkBatches([check('a', true), check('b', true)]))).toEqual([['a', 'b']])
    expect(MAX_CONCURRENT_CHECKS).toBe(2)
    expect(ids(checkBatches([check('a', true), check('b', true), check('c', true)]))).toEqual([['a', 'b'], ['c']])
  })

  it('keeps a serial command in its own batch and preserves the written order', () => {
    // Order matters: the Lead validated these commands in the order it wrote them.
    expect(ids(checkBatches([check('a', true), check('b'), check('c', true), check('d', true)])))
      .toEqual([['a'], ['b'], ['c', 'd']])
  })

  it('never merges two commands across a serial one', () => {
    const batches = checkBatches([check('a', true), check('b'), check('c', true)])
    expect(batches.flat().length).toBe(3)
    expect(ids(batches)).toEqual([['a'], ['b'], ['c']])
  })

  it('handles an empty list and a single command', () => {
    expect(checkBatches([])).toEqual([])
    expect(ids(checkBatches([check('only', true)]))).toEqual([['only']])
  })

  it('carries the flag from the Lead tool arguments through normalization', () => {
    const checks = normalizeChecks([
      { command: 'lint', independent: true },
      { command: 'typecheck' },
      { command: 'test', independent: false },
    ])
    expect(checks[0]?.independent).toBe(true)
    // An omitted flag and an explicit false must both mean "run alone".
    expect(checks[1]?.independent).toBeUndefined()
    expect(checks[2]?.independent).toBeUndefined()
    expect(ids(checkBatches(checks.map((definition, index) => ({ definition, plan: { id: `p${index}` } as never })))))
      .toEqual([['check-1'], ['check-2'], ['check-3']])
  })
})
