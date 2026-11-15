import { describe, expect, it } from 'vitest'
import { backgroundHandoffNeedsInspection, completedToolProblem, workerSubmittedProblem } from '../src/host/task-gates.js'

/**
 * Two gate readings that each cost a whole turn when wrong (session-a1899929): one ended a
 * Worker turn as `blocked` and announced a phantom "declined the task" to the Lead, the other
 * refused the Lead's last read and left a claim in its closing answer unverified.
 */
describe('worker post-submit gate', () => {
  it('waits for the Lead once the report is in', () => {
    expect(workerSubmittedProblem(true, false)).toBe('Worker report was submitted; wait for Lead feedback')
  })

  it('lets the Worker run before it has reported', () => {
    expect(workerSubmittedProblem(false, false)).toBeUndefined()
  })

  it('never refuses the transport replay of the step that carried the report', () => {
    // The submit lands first (bridge dispatch), then the card describing that same step is
    // replayed. Refusing it ended the turn as `blocked`, so DSH told the Lead the Sidekick had
    // declined although the report and both of its checks had succeeded.
    expect(workerSubmittedProblem(true, true)).toBeUndefined()
    expect(workerSubmittedProblem(false, true)).toBeUndefined()
  })
})

describe('completed-task gate', () => {
  it('keeps the read tools a read-only Lead already had', () => {
    expect(completedToolProblem({ role: 'lead', read: true, confinedShell: false })).toBeUndefined()
  })

  it('keeps a shell the role sandbox still confines to read-only', () => {
    expect(completedToolProblem({ role: 'lead', read: false, confinedShell: true })).toBeUndefined()
  })

  it('closes every effectful tool', () => {
    expect(completedToolProblem({ role: 'lead', read: false, confinedShell: false }))
      .toBe('This task is completed; begin a new task before using tools')
  })

  it('closes the finished Sidekick entirely, read tools included', () => {
    for (const read of [true, false]) {
      for (const confinedShell of [true, false]) {
        expect(completedToolProblem({ role: 'worker', read, confinedShell }))
          .toBe('This task is completed; begin a new task before using tools')
      }
    }
  })
})

describe('boot-time background handoff', () => {
  it('inspects a task that was running a non-blocking handoff when the Host went away', () => {
    expect(backgroundHandoffNeedsInspection({ background: true }, { mode: 'running' }, false)).toBe(true)
  })

  /**
   * A recorded Worker stop is the Host's own note that the handoff ended. Treating the flag as
   * live work anyway armed the reconciliation gate on a task whose Sidekick had stopped on a
   * provider error and whose effects were all settled, and every later message the user typed
   * ended before reaching the model (session-6fdb5c73).
   */
  it('leaves a task alone once the Worker was recorded as stopped', () => {
    expect(backgroundHandoffNeedsInspection({ background: true }, { mode: 'running' }, true)).toBe(false)
  })

  it('leaves a task that was already paused alone', () => {
    for (const mode of ['paused', 'completed', 'cancelled', 'stop-requested']) {
      expect(backgroundHandoffNeedsInspection({ background: true }, { mode }, false)).toBe(false)
    }
  })

  it('leaves a task alone once its Worker handed in a report', () => {
    expect(backgroundHandoffNeedsInspection({ background: true, submitted: { status: 'completed' } }, { mode: 'running' }, false)).toBe(false)
  })

  it('ignores a task that never delegated in the background', () => {
    expect(backgroundHandoffNeedsInspection(undefined, { mode: 'running' }, false)).toBe(false)
    expect(backgroundHandoffNeedsInspection({ background: false }, { mode: 'running' }, false)).toBe(false)
  })
})
