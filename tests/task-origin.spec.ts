import { afterEach, describe, expect, it } from 'vitest'
import { NativeTaskContext } from '../src/host/native-task-context.js'
import { SqliteFusionStore } from '../src/task/sqlite-store.js'
import { TaskId } from '../src/contracts.js'

const stores: SqliteFusionStore[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close() })

/** Only the session boundary is read here, so a seq-bearing view is enough. */
const session = (id: string, seq: number) => ({ id, session: { seq } }) as never
function setup() {
  const store = new SqliteFusionStore(':memory:')
  stores.push(store)
  return { store, context: new NativeTaskContext(store, () => undefined) }
}

describe('task input boundary', () => {
  it('starts a fresh task at the session position it was selected in', () => {
    const { context } = setup()
    context.begin(session('lead-a', 4), TaskId('task-a'))
    expect(context.originSeq(TaskId('task-a'))).toBe(4)
  })

  /**
   * A rollover is accounting only: the user's instructions belong to the
   * conversation. Regressing this boundary made `fusion_delegate` reject the
   * Lead's own verbatim quotes from before the rollover as fabricated, so every
   * delegation attempt failed in a loop.
   */
  it('inherits the conversation boundary across an automatic rollover', () => {
    const { context } = setup()
    context.begin(session('lead-a', 4), TaskId('task-a'))
    context.begin(session('lead-a', 27), TaskId('task-b'), context.originSeq(TaskId('task-a'))!)
    expect(context.originSeq(TaskId('task-b'))).toBe(4)
  })

  it('leaves a task without a recorded boundary undefined instead of guessing', () => {
    const { context } = setup()
    expect(context.originSeq(TaskId('unrecorded'))).toBeUndefined()
  })

  /**
   * Bonds written before `task-origin` existed had the whole conversation in
   * scope. A rollover inherits that as 0 — the same conservative rule `render`
   * applies — because inheriting `undefined` would fall back to the rollover
   * seq and reinstate the truncation this change fixes.
   */
  it('accepts 0 as whole-conversation scope when a predecessor recorded nothing', () => {
    const { context } = setup()
    context.begin(session('lead-a', 27), TaskId('task-b'), 0)
    expect(context.originSeq(TaskId('task-b'))).toBe(0)
  })

  it('refuses a boundary outside the session log', () => {
    const { context } = setup()
    expect(() => context.begin(session('lead-a', 10), TaskId('task-a'), 11)).toThrow('requires reconciliation')
    expect(() => context.begin(session('lead-a', 10), TaskId('task-a'), -1)).toThrow('requires reconciliation')
  })
})
