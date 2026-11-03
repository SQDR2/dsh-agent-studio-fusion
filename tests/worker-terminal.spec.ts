import { describe, expect, it } from 'vitest'
import { absentWorkerOutcome, unsettledContinuationError, workerNoReportCause, workerSettlementGuidance, workerStopExplanation, workerUnreachableFor, workerUnreachableReply } from '../src/host/worker-terminal.js'

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

  it('scopes a recorded dead end to the order that produced it', () => {
    // A replacement order must be judged on its own dispatch, never refused on a
    // predecessor's evidence; only the same order is still a dead end.
    expect(workerUnreachableFor({ id: 'order-1' }, { workOrderId: 'order-1' })).toBe(true)
    expect(workerUnreachableFor({ id: 'order-2' }, { workOrderId: 'order-1' })).toBe(false)
    expect(workerUnreachableFor(undefined, { workOrderId: 'order-1' })).toBe(false)
    expect(workerUnreachableFor({ id: 'order-1' }, undefined)).toBe(false)
  })

  it('re-reports the same verdict at every entry point that can rediscover it', () => {
    const reply = JSON.parse(workerUnreachableReply('fusion-worker-1', { provider: 'antigravity', model: 'gemini-3.8-flash' })) as Record<string, unknown>
    expect(reply).toMatchObject({ reasonCode: 'worker-tools-unreachable', failureCode: 'WORKER_TOOLS_UNREACHABLE',
      workerRunning: false, childId: 'fusion-worker-1', provider: 'antigravity', model: 'gemini-3.8-flash' })
    // The Lead must not be told to retry feedback or take over, and must not be told
    // this is an outage: it is a route that cannot reach Host tools.
    expect(String(reply.next)).toContain('enable its mcpBridge')
    expect(String(reply.next)).toContain('Do not retry fusion_rework')
    expect(String(reply.next)).toContain('not a provider outage')
  })
})
