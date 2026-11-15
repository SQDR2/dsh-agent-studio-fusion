import { describe, expect, it } from 'vitest'
import { backgroundHandoffNeedsInspection, completedToolProblem, dispatchAwaitsInspection, gatedDispatchProblem, gatedTurnStopped, staleRecoveryGate, workerSubmittedProblem } from '../src/host/task-gates.js'

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

/**
 * A gate that outlives its reason refuses every request with no way forward except a note nobody
 * can write meaningfully (session-6fdb5c73), so a startup check that finds nothing unfinished
 * opens it again — while a genuine interruption keeps it closed.
 */
/**
 * A leftover outbox row described a handoff, not an effect. Once the child took the brief and its
 * stop is recorded, nothing is queued any more — reading it as unfinished kept a whole conversation
 * locked (session-6fdb5c73).
 */
describe('queued Worker dispatch after a restart', () => {
  it('keeps a dispatch that never reached the child', () => {
    expect(dispatchAwaitsInspection('prepared', false)).toBe(true)
    expect(dispatchAwaitsInspection('prepared', true)).toBe(true)
    expect(dispatchAwaitsInspection('dispatched', true)).toBe(true)
  })

  it('keeps an accepted dispatch while the Worker could still be running', () => {
    expect(dispatchAwaitsInspection('accepted', false)).toBe(true)
  })

  it('drops an accepted dispatch once the Worker stop is recorded', () => {
    expect(dispatchAwaitsInspection('accepted', true)).toBe(false)
  })

  it('ignores settled states', () => {
    for (const state of ['settled', 'rejected', 'cancelled']) {
      expect(dispatchAwaitsInspection(state, false)).toBe(false)
    }
  })
})

/**
 * A stopped task has two halves: effects must not start, and the user must still get an answer.
 * Refusing the whole turn gave neither — the model never ran, so the turn ended in milliseconds
 * with no explanation (session-6fdb5c73). A turn that asks for an effect is answered once and then
 * stops, so a model cannot turn the refusal into a retry loop.
 */
describe('a gated task still lets the Lead read', () => {
  it('admits a read-only Lead dispatch while the task is paused or awaiting an inspection', () => {
    for (const recovering of [true, false]) {
      expect(gatedDispatchProblem({ role: 'lead', readOnly: true, phase: recovering ? 'RECOVERING' : 'PAUSED', recovering }))
        .toBeUndefined()
    }
  })

  it('refuses an effectful Lead dispatch and names the control that lifts it', () => {
    const paused = gatedDispatchProblem({ role: 'lead', readOnly: false, phase: 'PAUSED', recovering: false })
    expect(paused).toContain('PAUSED')
    expect(paused).toContain('/fusion resume')
    const recovering = gatedDispatchProblem({ role: 'lead', readOnly: false, phase: 'RECOVERING', recovering: true })
    expect(recovering).toContain('/fusion recover')
  })

  it('still refuses every Sidekick dispatch', () => {
    for (const readOnly of [true, false]) {
      expect(gatedDispatchProblem({ role: 'worker', readOnly, phase: 'PAUSED', recovering: false }))
        .toBe('Fusion execution is gated: PAUSED')
    }
  })

  it('stops a gated turn after its one refused effect, naming the next step', () => {
    const paused = gatedTurnStopped({ recovering: false, phase: 'PAUSED' })
    expect(paused).toContain('already reached that limit')
    expect(paused).toContain('/fusion resume')
    expect(paused).toContain('do not retry')
    expect(gatedTurnStopped({ recovering: true, phase: 'RECOVERING' })).toContain('/fusion recover')
  })
})

describe('stale recovery gate', () => {
  it('opens a gate nothing is left behind', () => {
    expect(staleRecoveryGate({ recovering: true, unfinished: false, mode: 'running', handoffStop: false })).toBe(true)
    expect(staleRecoveryGate({ recovering: true, unfinished: false, mode: 'paused', handoffStop: false })).toBe(true)
  })

  it('keeps a gate that still has work behind it', () => {
    expect(staleRecoveryGate({ recovering: true, unfinished: true, mode: 'running', handoffStop: false })).toBe(false)
  })

  /**
   * A pause the Host recorded while a background handoff was live is the Host saying a child may
   * still be running. Everything else may have settled since, but that is exactly the case an
   * inspection exists for, so it never opens by itself.
   */
  it('keeps a gate the Host set while a handoff was live', () => {
    expect(staleRecoveryGate({ recovering: true, unfinished: false, mode: 'paused', handoffStop: true })).toBe(false)
  })

  it('leaves an unarmed gate alone', () => {
    expect(staleRecoveryGate({ recovering: false, unfinished: false, mode: 'running', handoffStop: false })).toBe(false)
    expect(staleRecoveryGate({ recovering: false, unfinished: true, mode: 'running', handoffStop: false })).toBe(false)
  })

  it('does not touch a completed task', () => {
    expect(staleRecoveryGate({ recovering: true, unfinished: false, mode: 'completed', handoffStop: false })).toBe(false)
  })
})
