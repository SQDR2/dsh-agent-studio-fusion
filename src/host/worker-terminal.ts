/** What fusion_wait should do once the resident Worker handle is already gone. */
export function absentWorkerOutcome(input: { pendingEffects: number; outcomeUnknown: boolean; submitted: boolean }):
  { kind: 'recovery'; reason: string } | { kind: 'collect-report' } | { kind: 'incomplete' } {
  if (input.pendingEffects > 0 || input.outcomeUnknown) {
    return { kind: 'recovery', reason: 'Worker is absent with unfinished native effects; reconcile its persisted session' }
  }
  return input.submitted ? { kind: 'collect-report' } : { kind: 'incomplete' }
}

/** Settlement notice text. It must match whether a report was persisted, and must not send the Lead back to a disposed Worker. */
export function workerSettlementGuidance(submitted: boolean): string {
  if (submitted) {
    return 'The Worker has ended and a structured report is already persisted. This notice is not task acceptance. Review the report and check evidence. Call fusion_wait only if that report has not been returned yet; it reads persisted state and does not restart the Worker.'
  }
  return 'The Worker has ended without a structured report. This notice is not task acceptance, and it is not a provider or quota outage. Call fusion_wait once: it returns the terminal status "worker ended without submitting a report" (WORKFLOW_INCOMPLETE) from persisted state and does not restart the Worker. Do not keep waiting.'
}

/**
 * How to describe a Worker model-control wait to the Lead.
 * WORKFLOW_INCOMPLETE and NO_PROGRESS are missing work, not an unavailable provider.
 */
export function workerStopExplanation(code: string): { reasonCode: string; next: string } {
  if (code === 'WORKFLOW_INCOMPLETE') return {
    reasonCode: 'workflow-incomplete',
    next: 'The required report or workflow transition is missing. This is not a provider outage or quota limit. Do not tell the user the Sidekick or its model is unavailable. Explain the unfinished report and await a user decision.',
  }
  if (code === 'NO_PROGRESS') return {
    reasonCode: 'workflow-incomplete',
    next: 'Repeated unchanged results made no progress. This is not a provider outage or quota limit. Change the approach; do not describe the Sidekick as unavailable.',
  }
  return {
    reasonCode: 'worker-unavailable',
    next: 'Explain which role is unavailable. Use local Fusion controls to continue or replace its model; do not retry delegation or take over automatically.',
  }
}

/**
 * Why a quiescent Worker produced no report.
 *
 * A Worker that was offered a tool table but never dispatched one tool call of it
 * did not "run out of steps" or lose work: its route could not call those tools at
 * all. Adapters that drive their own execution loop (for example an external CLI
 * agent) only surface tool calls when the request also carries their own transport
 * tool, so `fusion_submit_result` stays unreachable even though this plugin did
 * advertise it. That is a configuration mismatch the Lead must report accurately
 * instead of retrying or blaming the model.
 *
 * Both counts are read from the Worker's own session log, so a text assignment —
 * offered the Worker Fusion tools and nothing else — is judged the same way. An
 * unreadable log yields no evidence and therefore keeps the generic verdict.
 */
export function workerNoReportCause(input: { requestedTools: number; dispatchedToolCalls: number }): 'unreachable-tools' | 'no-report' {
  return input.requestedTools > 0 && input.dispatchedToolCalls === 0 ? 'unreachable-tools' : 'no-report'
}

/**
 * Whether the recorded unreachable route still speaks for the current order.
 *
 * The verdict is per work order: a new order must be judged on its own dispatch,
 * so a replacement route is never refused on a predecessor's evidence. The task
 * is only wedged while the same order that failed still owns the handoff.
 */
export function workerUnreachableFor(order: { id?: string } | undefined,
  record: { workOrderId?: string } | undefined): boolean {
  return Boolean(order?.id && record && record.workOrderId === order.id)
}

/**
 * The one wording for a route that cannot reach Host tools, shared by every entry
 * point that can rediscover the verdict, so a later `fusion_wait` says the same
 * thing as the delegation that first failed.
 */
export function workerUnreachableReply(childId: string | undefined,
  route: { provider: string; model: string }): string {
  return JSON.stringify({
    status: 'needs-decision',
    reason: 'worker dispatched no tool call, so it could not reach fusion_submit_result',
    reasonCode: 'worker-tools-unreachable', failureCode: 'WORKER_TOOLS_UNREACHABLE',
    childId, workerRunning: false, provider: route.provider, model: route.model,
    next: 'This is a route/adapter mismatch, not a provider outage, quota limit or a model capability. The Worker route ran its own agent loop and only surfaces a tool call when the request also carries that adapter\'s own transport tool, so the Fusion tools this Host advertised were unreachable. Fusion adds that transport (agy_tool for the antigravity/agy route) to the Worker ceiling automatically, so first check the route itself: mcpBridge on, permissionMode skip, and the bridge tool allowlist permitting fusion_submit_result. Do not retry fusion_rework, do not take over and do not claim completion. Tell the user which Worker route failed, and that it must be configured to reach Host tools or be replaced by a direct-call route in Settings → Fusion.',
  })
}

/** Continue/switch is refused before the route is written. Say so when a switch was requested. */
export function unsettledContinuationError(switching: boolean): { zh: string; en: string } {
  return switching
    ? { zh: '中断的操作尚未确认结束，本次尚未切换模型。请先使用 /fusion recover <检查记录> 核对，再更换并继续。',
      en: 'Interrupted operations are not confirmed finished, so this switch was not applied. Use /fusion recover <inspection note> first, then switch and continue.' }
    : { zh: '中断的操作尚未确认结束，请先使用 /fusion recover 核对',
      en: 'Interrupted operations are not confirmed finished; use /fusion recover first' }
}
