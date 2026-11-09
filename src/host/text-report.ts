import type { WorkerReport } from '../contracts.js'

/**
 * A text-only Worker whose route cannot call Host tools still owes the Lead a
 * report. `fusion_submit_result` is a tool, so such a route can never call it —
 * session-6113b527's Worker answered the question correctly in prose and then
 * spent a repair generation explaining that it could not submit at all.
 *
 * This is the strictly bounded alternative: one fenced JSON block in the
 * Worker's own final message, bound to the frozen order it was dispatched for
 * (`workOrderId`, `revision`, optional `operationId`). It is deliberately not a
 * prose convention — arbitrary text, unrelated JSON and any mismatch are
 * refused, and the report still travels through the normal validation, review
 * and acceptance path. It exists for `mode: 'text'` assignments only; workspace
 * and exploration orders keep requiring the real tool.
 */
export const TEXT_REPORT_MARKER = 'fusionTextReport'
export const TEXT_REPORT_MAX_SUMMARY = 16_000
export const TEXT_REPORT_MAX_UNRESOLVED = 30
export const TEXT_REPORT_MAX_ITEM = 2_000

export interface TextReportOrder {
  readonly id: string
  readonly revision: number
  readonly operationId?: string
  /** The Lead brief this generation was dispatched under; rework keeps `revision` but advances this. */
  readonly briefRevision?: number
}

export type TextReportParse =
  | { kind: 'absent' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'report'; submitted: { summary: string; unresolved: string[]; status: WorkerReport['status'] } }

const STATUSES: ReadonlySet<string> = new Set(['completed', 'blocked', 'needs-decision'])
const FIELDS = new Set([TEXT_REPORT_MARKER, 'workOrderId', 'revision', 'briefRevision', 'operationId', 'status', 'summary', 'unresolved'])

/** Usable from a message body: a complete fenced block with the `json` info string. */
const FENCE = /```json[ \t]*\r?\n([\s\S]*?)```/g

function field(value: unknown, name: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return `"${name}" must be a non-empty string`
  return undefined
}

/**
 * Validate one Worker message against the frozen order.
 *
 * `absent` means the message carries no protocol block at all (ordinary prose).
 * Anything that names the protocol but fails a field is `invalid` with a reason
 * the Host can log and report: it is never silently ignored, because the Lead
 * has to know whether a tool-less route tried to report.
 */
export function parseTextReport(text: string, order: TextReportOrder): TextReportParse {
  const blocks = [...text.matchAll(FENCE)].map(match => match[1]!)
  const opens = text.split('```json').length - 1
  if (!blocks.length) {
    // An unclosed opener is a malformed attempt, not ordinary prose: the Worker
    // named the protocol, so the Lead must be told it was refused.
    return opens ? { kind: 'invalid', reason: 'the ```json block was never closed' } : { kind: 'absent' }
  }
  if (blocks.length > 1 || opens !== blocks.length) return { kind: 'invalid', reason: 'more than one ```json block was sent' }
  let value: unknown
  try { value = JSON.parse(blocks[0]!) }
  catch { return { kind: 'invalid', reason: 'the ```json block is not valid JSON' } }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { kind: 'invalid', reason: 'the report must be a JSON object' }
  const record = value as Record<string, unknown>
  const unknown = Object.keys(record).filter(key => !FIELDS.has(key))
  if (unknown.length) return { kind: 'invalid', reason: `unknown field(s): ${unknown.slice(0, 5).join(', ')}` }
  if (record[TEXT_REPORT_MARKER] !== 1) return { kind: 'invalid', reason: `"${TEXT_REPORT_MARKER}" must be 1` }
  if (typeof record.workOrderId !== 'string' || record.workOrderId !== order.id) {
    return { kind: 'invalid', reason: `workOrderId does not match the frozen work order ${order.id}` }
  }
  if (record.revision !== order.revision) return { kind: 'invalid', reason: `revision does not match the frozen work order revision ${order.revision}` }
  if (record.operationId !== undefined && record.operationId !== order.operationId) {
    return { kind: 'invalid', reason: `operationId does not match the frozen work order operation ${order.operationId ?? 'none'}` }
  }
  // A frozen order outlives its briefs: rework keeps `revision` and changes only this
  // counter, so a report bound to an older brief must never answer the new one again.
  if (order.briefRevision === undefined) {
    if (record.briefRevision !== undefined) return { kind: 'invalid', reason: 'briefRevision is not part of this work order context' }
  } else if (record.briefRevision !== order.briefRevision) {
    return { kind: 'invalid', reason: `briefRevision does not match the current brief revision ${order.briefRevision}` }
  }
  if (typeof record.status !== 'string' || !STATUSES.has(record.status)) {
    return { kind: 'invalid', reason: '"status" must be completed, blocked or needs-decision' }
  }
  const summaryProblem = field(record.summary, 'summary')
  if (summaryProblem) return { kind: 'invalid', reason: summaryProblem }
  const summary = (record.summary as string)
  if (summary.length > TEXT_REPORT_MAX_SUMMARY) return { kind: 'invalid', reason: `"summary" exceeds ${TEXT_REPORT_MAX_SUMMARY} characters` }
  const unresolved = record.unresolved
  if (!Array.isArray(unresolved)) return { kind: 'invalid', reason: '"unresolved" must be an array of strings' }
  if (unresolved.length > TEXT_REPORT_MAX_UNRESOLVED) return { kind: 'invalid', reason: `"unresolved" exceeds ${TEXT_REPORT_MAX_UNRESOLVED} items` }
  for (const item of unresolved) {
    const problem = field(item, 'unresolved item')
    if (problem) return { kind: 'invalid', reason: problem }
    if ((item as string).length > TEXT_REPORT_MAX_ITEM) return { kind: 'invalid', reason: `an "unresolved" item exceeds ${TEXT_REPORT_MAX_ITEM} characters` }
  }
  return { kind: 'report', submitted: { summary, unresolved: unresolved as string[], status: record.status as WorkerReport['status'] } }
}

/**
 * The discovery text for the protocol. It is embedded in the Worker prompt, the
 * text-order brief and the one repair instruction, so a Worker never has to
 * guess the shape or the boundary values: it copies them from its frozen order.
 */
export function textReportInstruction(order: TextReportOrder): string {
  const brief = order.briefRevision === undefined ? '' : `, "briefRevision": ${order.briefRevision}`
  const operation = order.operationId === undefined ? '' : `, "operationId": "${order.operationId}"`
  return [
    'This text-only work order still needs a structured report, and `fusion_submit_result` stays the preferred way.',
    'If your route has no Host tool bridge and cannot call Host tools at all, end your turn with exactly one ```json block and nothing else inside it:',
    `{"${TEXT_REPORT_MARKER}": 1, "workOrderId": "${order.id}", "revision": ${order.revision}${brief}${operation}, "status": "completed", "summary": "<your answer and what you did>", "unresolved": []}`,
    'Use one of the statuses "completed", "blocked" or "needs-decision", and copy ' + (order.briefRevision === undefined
      ? '`workOrderId` and `revision` (and `operationId` when shown) from the frozen work order' : '`workOrderId`, `revision` and `briefRevision` (and `operationId` when shown) from the frozen work order and the current brief') + '.',
    'Another order, another revision or brief, unknown fields, more than one block, or plain prose are refused; a report still needs the Lead\'s review.',
  ].join(' ')
}

/** The one repair instruction for a text order: prefer the tool, then the protocol. */
export function textReportRepair(order: TextReportOrder): string {
  return `Submit the current work through fusion_submit_result with its actual status and unresolved requirements. If this route cannot call Host tools at all, ${textReportInstruction(order)}`
}