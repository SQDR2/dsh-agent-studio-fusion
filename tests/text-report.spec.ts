import { describe, expect, it } from 'vitest'
import { parseTextReport, textReportInstruction, TEXT_REPORT_MAX_SUMMARY, TEXT_REPORT_MAX_UNRESOLVED } from '../src/host/text-report.js'

const order = { id: 'order-1', revision: 3, operationId: 'operation-1' }

function block(value: unknown): string {
  return '```json\n' + JSON.stringify(value) + '\n```'
}

function report(overrides: Record<string, unknown> = {}) {
  return { fusionTextReport: 1, workOrderId: order.id, revision: order.revision, status: 'completed',
    summary: 'The library opens at nine.', unresolved: [], ...overrides }
}

/** Only the acceptance shape: a report is what the Worker would have passed to fusion_submit_result. */
function accepted(parsed: ReturnType<typeof parseTextReport>) {
  expect(parsed.kind).toBe('report')
  return parsed.kind === 'report' ? parsed.submitted : undefined
}

describe('structured text report protocol', () => {
  it('accepts one report bound to the current order and revision', () => {
    expect(accepted(parseTextReport(block(report()), order))).toEqual({
      summary: 'The library opens at nine.', unresolved: [], status: 'completed' })
  })

  it('accepts a report surrounded by prose but rejects two reports in one message', () => {
    const surrounding = `Here is the result.\n\n${block(report())}\n\nDone.`
    expect(accepted(parseTextReport(surrounding, order))).toMatchObject({ status: 'completed' })
    expect(parseTextReport(`${block(report())}\n\n${block(report({ summary: 'second' }))}`, order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('more than one') })
  })

  it('never accepts arbitrary prose, arbitrary JSON or a non-JSON fenced block', () => {
    expect(parseTextReport('The model is SWE-2 Flash Medium.', order)).toEqual({ kind: 'absent' })
    // An unrelated JSON document (e.g. a tool/server output) is not this protocol.
    expect(parseTextReport(block({ model: 'SWE-2 Flash Medium', status: 'completed', summary: 'x' }), order))
      .toMatchObject({ kind: 'invalid' })
    // Unlabelled fenced JSON is not this protocol either.
    expect(parseTextReport('```\n' + JSON.stringify(report()) + '\n```', order)).toEqual({ kind: 'absent' })
    expect(parseTextReport(block(report()), order).kind).toBe('report')
    const broken = block(report()).replace('"summary":', '"summary": ')
    expect(parseTextReport(broken.slice(0, broken.length - 4), order)).toMatchObject({ kind: 'invalid' })
  })

  it('rejects a report that names another order, another revision or another operation', () => {
    expect(parseTextReport(block(report({ workOrderId: 'order-2' })), order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('workOrderId') })
    expect(parseTextReport(block(report({ revision: 2 })), order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('revision') })
    expect(parseTextReport(block(report({ operationId: 'operation-2' })), order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('operationId') })
    // The operationId is optional, but when present it must still match.
    expect(accepted(parseTextReport(block(report({ operationId: order.operationId })), order))).toBeDefined()
  })

  it('rejects unknown fields and every malformed field instead of guessing', () => {
    expect(parseTextReport(block(report({ extra: 'surprise' })), order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('extra') })
    for (const status of ['done', 'accepted', 'success', 1, null]) {
      expect(parseTextReport(block(report({ status })), order)).toMatchObject({ kind: 'invalid' })
    }
    for (const summary of ['', '   ', 42, null, undefined]) {
      expect(parseTextReport(block(report({ summary })), order)).toMatchObject({ kind: 'invalid' })
    }
    for (const marker of [2, '1', true]) {
      expect(parseTextReport(block(report({ fusionTextReport: marker })), order)).toMatchObject({ kind: 'invalid' })
    }
    for (const unresolved of ['one', [1], [''], null]) {
      expect(parseTextReport(block(report({ unresolved })), order)).toMatchObject({ kind: 'invalid' })
    }
  })

  it('bounds the report so a hostile route cannot flood the Lead', () => {
    expect(parseTextReport(block(report({ summary: 'x'.repeat(TEXT_REPORT_MAX_SUMMARY + 1) })), order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('summary') })
    expect(parseTextReport(block(report({ summary: 'x'.repeat(TEXT_REPORT_MAX_SUMMARY) })), order).kind).toBe('report')
    expect(parseTextReport(block(report({ unresolved: Array.from({ length: TEXT_REPORT_MAX_UNRESOLVED + 1 }, (_, i) => `item ${i}`) })), order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('unresolved') })
    expect(parseTextReport(block(report({ unresolved: ['x'.repeat(2001)] })), order)).toMatchObject({ kind: 'invalid' })
  })

  it('keeps blocked and needs-decision statuses reportable', () => {
    expect(accepted(parseTextReport(block(report({ status: 'blocked', unresolved: ['needs a decision'] })), order)))
      .toMatchObject({ status: 'blocked', unresolved: ['needs a decision'] })
    expect(accepted(parseTextReport(block(report({ status: 'needs-decision' })), order))).toMatchObject({ status: 'needs-decision' })
  })

  it('binds the report to the current brief, because rework keeps the frozen order revision', () => {
    const briefing = { ...order, briefRevision: 2 }
    expect(accepted(parseTextReport(block(report({ briefRevision: 2 })), briefing))).toBeDefined()
    // An answer from the previous brief must not satisfy the new one.
    expect(parseTextReport(block(report({ briefRevision: 1 })), briefing))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('briefRevision') })
    expect(parseTextReport(block(report({ briefRevision: 2 })), order))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('briefRevision') })
    // The field is required once the context has one, so a copy-paste of an old block fails.
    expect(parseTextReport(block(report()), briefing))
      .toEqual({ kind: 'invalid', reason: expect.stringContaining('briefRevision') })
  })

  it('tells the Worker the exact boundary values to copy from the frozen work order', () => {
    const instruction = textReportInstruction({ ...order, briefRevision: 4 })
    expect(instruction).toContain('"fusionTextReport": 1')
    expect(instruction).toContain('"workOrderId": "order-1"')
    expect(instruction).toContain('"revision": 3')
    expect(instruction).toContain('"briefRevision": 4')
    expect(instruction).toContain('"operationId": "operation-1"')
    expect(instruction).toContain('"status": "completed"')
    expect(instruction).toContain('"blocked"')
    expect(instruction).toContain('fusion_submit_result')
    // The protocol is only an alternative for a text-only order with no Host tools.
    expect(instruction).toContain('text')
    expect(instruction).toContain('no Host tool')
    // One instruction, not the same sentence twice (the first draft duplicated it).
    expect(instruction.match(/If your route has no Host tool bridge and cannot call Host tools at all/g)).toHaveLength(1)
    expect(instruction).not.toContain('If your route cannot call Host tools at all')
    // The example must be a usable status, never a literal "a|b|c" enum.
    expect(instruction).not.toContain('completed|blocked|needs-decision')
  })

  it('omits the brief revision when the caller has no brief context', () => {
    expect(textReportInstruction(order)).not.toContain('briefRevision')
  })
})