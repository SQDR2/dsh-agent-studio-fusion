import { describe, expect, it } from 'vitest'
import { deletionVerdict, recordedProcessId, unfinishedDocument, DeletionBlocked } from '../src/task/deletion.js'
import { TASK_BUSY } from '../src/errors.js'

describe('deletion verdict', () => {
  it('allows a task no process is writing to, whatever phase it stopped in', () => {
    // The phase is not an input: an interrupted task keeps the phase of its last
    // living moment, so consulting it is what made finished records undeletable.
    expect(deletionVerdict({ live: undefined, foreign: [] })).toEqual({ allowed: true })
  })

  it('refuses while the Host reports live work, naming what holds it', () => {
    for (const blocker of ['agent', 'tool', 'job', 'lease'] as const) {
      const verdict = deletionVerdict({ live: blocker, foreign: [] })
      expect(verdict.allowed).toBe(false)
      expect(verdict).toMatchObject({ blocker })
    }
  })

  it('refuses when another living process left an unfinished row', () => {
    const verdict = deletionVerdict({ live: undefined, foreign: ['native-effect owned by pid 42'] })
    expect(verdict).toMatchObject({ allowed: false, blocker: 'foreign-process' })
    expect(verdict.allowed === false && verdict.detail).toContain('pid 42')
  })

  it('keeps the stable message and code so the panel still translates it', () => {
    const error = new DeletionBlocked('lease', 'it still holds the workspace write lease')
    expect(error.code).toBe(TASK_BUSY)
    expect(error.message).toBe('Cannot delete a running task')
    expect(error.blocker).toBe('lease')
  })
})

describe('durable row reading', () => {
  it('reads only a usable pid as the recorded owner', () => {
    expect(recordedProcessId({ processId: 42 })).toBe(42)
    expect(recordedProcessId({ processId: 0 })).toBeUndefined()
    expect(recordedProcessId({ processId: '42' })).toBeUndefined()
    expect(recordedProcessId({ processId: 1.5 })).toBeUndefined()
    expect(recordedProcessId(undefined)).toBeUndefined()
    expect(recordedProcessId({})).toBeUndefined()
  })

  it('treats each family by its own state field, and unknown shapes as settled', () => {
    expect(unfinishedDocument('native-effect', { state: 'dispatch-started' })).toBe(true)
    expect(unfinishedDocument('native-effect', { state: 'outcome-unknown' })).toBe(true)
    expect(unfinishedDocument('native-effect', { state: 'returned' })).toBe(false)
    expect(unfinishedDocument('native-effect', { state: 'inspected' })).toBe(false)
    expect(unfinishedDocument('native-approval', { state: 'pending' })).toBe(true)
    expect(unfinishedDocument('native-approval', { state: 'decided' })).toBe(false)
    expect(unfinishedDocument('check-invocation', { evidence: { state: 'started' } })).toBe(true)
    expect(unfinishedDocument('check-invocation', { evidence: { state: 'outcome-unknown' } })).toBe(true)
    expect(unfinishedDocument('check-invocation', { evidence: { state: 'completed' } })).toBe(false)
    // A family with no declared open state, or a row with none of the fields,
    // must not pin a record forever.
    expect(unfinishedDocument('runtime', { state: 'dispatch-started' })).toBe(false)
    expect(unfinishedDocument('native-effect', {})).toBe(false)
    expect(unfinishedDocument('native-effect', null)).toBe(false)
    expect(unfinishedDocument('check-invocation', { evidence: null })).toBe(false)
  })
})
