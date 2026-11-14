import { describe, expect, it } from 'vitest'
import { completedToolProblem, workerSubmittedProblem } from '../src/host/task-gates.js'

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
