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
    expect(String(reply.next)).toContain('mcpBridge on')
    expect(String(reply.next)).toContain('agy_tool')
    expect(String(reply.next)).toContain('Do not retry fusion_rework')
    expect(String(reply.next)).toContain('not a provider outage')
  })

  it('names a non-bridge agent route honestly instead of repeating the agy settings', () => {
    // session-6113b527: the Worker ran on `devin` (dsh-tauri-acp) and the Lead was
    // told to set mcpBridge/permissionMode. Those are dsh-agy-link options; an ACP
    // route opens its session with no MCP servers, so no Fusion setting can help.
    const reply = JSON.parse(workerUnreachableReply('fusion-worker-outer', { provider: 'devin', model: 'swe-2-flash-medium',
      mode: 'text', workerText: '我当前实际运行的模型是 SWE-2 Flash Medium。' })) as Record<string, unknown>
    const next = String(reply.next)
    expect(next).not.toContain('mcpBridge')
    expect(next).not.toContain('permissionMode')
    expect(next).not.toContain('agy_tool')
    // No agy-specific vocabulary at all on a route Fusion does not wire.
    expect(next.toLowerCase()).not.toContain('antigravity')
    expect(next).not.toMatch(/\bagy\b/)
    // Nor a blanket claim about how every ACP adapter opens its session.
    expect(next).toContain('adapter must itself forward')
    expect(next).toContain('one example')
    expect(next).toContain('not a provider outage')
    expect(next).toContain('Do not retry fusion_rework')
    expect(next).toMatch(/MCP|forward/i)
    expect(next).toContain('direct-call')
    // The Worker did answer: its bounded prose is retained as unverified evidence.
    expect(reply.workerSaid).toMatchObject({ text: '我当前实际运行的模型是 SWE-2 Flash Medium。', truncated: false })
    expect(JSON.stringify(reply.workerSaid)).toContain('unverified')
    expect(next).toContain('did not deliver a valid one')
  })

  it('bounds the retained Worker prose and says when it was cut', () => {
    const reply = JSON.parse(workerUnreachableReply('fusion-worker-2', { provider: 'devin', model: 'swe-2-flash-medium',
      workerText: 'x'.repeat(5000) })) as Record<string, unknown>
    expect(reply.workerSaid).toMatchObject({ truncated: true })
    expect(String((reply.workerSaid as { text: string }).text)).toHaveLength(2000)
    // A route with no prose keeps the reply free of a fabricated quote.
    expect(JSON.parse(workerUnreachableReply('fusion-worker-3', { provider: 'devin', model: 'swe-2-flash-medium' })))
      .not.toHaveProperty('workerSaid')
  })

  it('re-reports a quote that the ledger already cut as truncated, not as a complete message', () => {
    // The stored text is exactly the cap, so re-deriving truncation would lose the fact.
    const reply = JSON.parse(workerUnreachableReply('fusion-worker-4', { provider: 'devin', model: 'swe-2-flash-medium',
      workerText: 'x'.repeat(2000), workerTextTruncated: true })) as Record<string, unknown>
    expect(reply.workerSaid).toMatchObject({ truncated: true })
  })

  it('names the bounded reason when a structured text block was refused', () => {
    const reply = JSON.parse(workerUnreachableReply('fusion-worker-5', { provider: 'devin', model: 'swe-2-flash-medium',
      mode: 'text', textReportRejected: 'revision does not match the frozen work order revision 1' })) as Record<string, unknown>
    expect(String(reply.textReportRefused)).toContain('revision does not match')
    expect(String(reply.next)).toContain('A structured text block was refused')
    expect(String(reply.next)).toContain('revision does not match the frozen work order revision 1')
    // The refusal is bounded too: a hostile reason cannot flood the Lead.
    const long = JSON.parse(workerUnreachableReply('fusion-worker-6', { provider: 'devin', model: 'swe-2-flash-medium',
      textReportRejected: 'y'.repeat(5000) })) as Record<string, unknown>
    expect(String(long.textReportRefused)).toHaveLength(300)
  })

  it('keeps the agy knobs on the one bridge route Fusion wires', () => {
    const reply = JSON.parse(workerUnreachableReply('fusion-worker-7', { provider: 'antigravity', model: 'gemini-3.8-flash' })) as Record<string, unknown>
    expect(String(reply.next)).toContain('mcpBridge on')
    expect(String(reply.next)).toContain('permissionMode skip')
    expect(String(reply.next)).toContain('agy_tool')
    expect(String(reply.next)).not.toContain('adapter must itself forward')
  })
})
