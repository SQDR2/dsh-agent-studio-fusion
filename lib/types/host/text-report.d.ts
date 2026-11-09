import type { WorkerReport } from '../contracts.js';
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
export declare const TEXT_REPORT_MARKER = "fusionTextReport";
export declare const TEXT_REPORT_MAX_SUMMARY = 16000;
export declare const TEXT_REPORT_MAX_UNRESOLVED = 30;
export declare const TEXT_REPORT_MAX_ITEM = 2000;
export interface TextReportOrder {
    readonly id: string;
    readonly revision: number;
    readonly operationId?: string;
    /** The Lead brief this generation was dispatched under; rework keeps `revision` but advances this. */
    readonly briefRevision?: number;
}
export type TextReportParse = {
    kind: 'absent';
} | {
    kind: 'invalid';
    reason: string;
} | {
    kind: 'report';
    submitted: {
        summary: string;
        unresolved: string[];
        status: WorkerReport['status'];
    };
};
/**
 * Validate one Worker message against the frozen order.
 *
 * `absent` means the message carries no protocol block at all (ordinary prose).
 * Anything that names the protocol but fails a field is `invalid` with a reason
 * the Host can log and report: it is never silently ignored, because the Lead
 * has to know whether a tool-less route tried to report.
 */
export declare function parseTextReport(text: string, order: TextReportOrder): TextReportParse;
/**
 * The discovery text for the protocol. It is embedded in the Worker prompt, the
 * text-order brief and the one repair instruction, so a Worker never has to
 * guess the shape or the boundary values: it copies them from its frozen order.
 */
export declare function textReportInstruction(order: TextReportOrder): string;
/** The one repair instruction for a text order: prefer the tool, then the protocol. */
export declare function textReportRepair(order: TextReportOrder): string;
