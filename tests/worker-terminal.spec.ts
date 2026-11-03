import { describe, expect, it } from 'vitest'
import { absentWorkerOutcome, unsettledContinuationError, workerNoReportCause, workerSettlementGuidance, workerStopExplanation } from '../src/host/worker-terminal.js'

describe('settled Worker terminal status', () => {
  it('does not take a recovery lock when a disposed Worker left no unknown effects', () => {
    expect(absentWorkerOutcome({ pendingEffects: 0, outcomeUnknown: false, submitted: false })).toEqual({ kind: 'incomplete' })
    expect(absentWorkerOutcome({ pendingEffects: 0, outcomeUnknown: false, submitted: true })).toEqual({ kind: 'collect-report' })
  })

  it('still requires recovery when native effects or an unknown outcome remain', () => {
    expect(absentWorkerOutcome({ pendingEffects: 1, outcomeUnknown: false, submitted: false }).kind).toBe('recovery')
    expect(absentWorkerOutcome({ pendingEffects: 0, outcomeUnknown: true, submitted: true }).kind).toBe('recovery')
  })

  it('matches the settlement notice to whether a report was persisted', () => {
    expect(workerSettlementGuidance(false)).toContain('worker ended without submitting a report')
    expect(workerSettlementGuidance(false)).toContain('WORKFLOW_INCOMPLETE')
    expect(workerSettlementGuidance(false)).not.toContain('use fusion_wait if they have not been collected')
    expect(workerSettlementGuidance(true)).toContain('already persisted')
    expect(workerSettlementGuidance(true)).not.toContain('without a structured report')
  })

  it('does not describe WORKFLOW_INCOMPLETE as provider or quota unavailability', () => {
    const workflow = workerStopExplanation('WORKFLOW_INCOMPLETE')
    expect(workflow.reasonCode).toBe('workflow-incomplete')
    expect(workflow.next).toContain('not a provider outage or quota limit')
    expect(workflow.next).not.toContain('Explain which role is unavailable')
    expect(workerStopExplanation('QUOTA')).toMatchObject({ reasonCode: 'worker-unavailable' })
    expect(workerStopExplanation('QUOTA').next).toContain('unavailable')
  })

  it('says a refused role switch was not applied', () => {
    expect(unsettledContinuationError(true).zh).toContain('本次尚未切换模型')
    expect(unsettledContinuationError(true).en).toContain('this switch was not applied')
    expect(unsettledContinuationError(false).en).not.toContain('switch was not applied')
  })
})

describe('Worker no-report diagnosis', () => {
  it('names an unreachable tool table instead of an incomplete turn', () => {
    expect(workerNoReportCause({ requestedTools: 3, dispatchedToolCalls: 0 })).toBe('unreachable-tools')
  })

  it('keeps the generic verdict when the Worker did dispatch tools', () => {
    expect(workerNoReportCause({ requestedTools: 3, dispatchedToolCalls: 1 })).toBe('no-report')
    expect(workerNoReportCause({ requestedTools: 11, dispatchedToolCalls: 4 })).toBe('no-report')
  })

  it('never blames accessibility when no tool table was offered at all', () => {
    // A tool-less request proves nothing about reachability; do not guess.
    expect(workerNoReportCause({ requestedTools: 0, dispatchedToolCalls: 0 })).toBe('no-report')
  })
})
