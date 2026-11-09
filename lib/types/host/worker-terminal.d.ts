/** What fusion_wait should do once the resident Worker handle is already gone. */
export declare function absentWorkerOutcome(input: {
    pendingEffects: number;
    outcomeUnknown: boolean;
    submitted: boolean;
}): {
    kind: 'recovery';
    reason: string;
} | {
    kind: 'collect-report';
} | {
    kind: 'incomplete';
};
/** Settlement notice text. It must match whether a report was persisted, and must not send the Lead back to a disposed Worker. */
export declare function workerSettlementGuidance(submitted: boolean): string;
/**
 * How to describe a Worker model-control wait to the Lead.
 * WORKFLOW_INCOMPLETE and NO_PROGRESS are missing work, not an unavailable provider.
 */
export declare function workerStopExplanation(code: string): {
    reasonCode: string;
    next: string;
};
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
export declare function workerNoReportCause(input: {
    requestedTools: number;
    dispatchedToolCalls: number;
}): 'unreachable-tools' | 'no-report';
/**
 * Whether the recorded unreachable route still speaks for the current order.
 *
 * The verdict is per work order: a new order must be judged on its own dispatch,
 * so a replacement route is never refused on a predecessor's evidence. The task
 * is only wedged while the same order that failed still owns the handoff.
 */
export declare function workerUnreachableFor(order: {
    id?: string;
} | undefined, record: {
    workOrderId?: string;
} | undefined): boolean;
/**
 * The one wording for a route that cannot reach Host tools, shared by every entry
 * point that can rediscover the verdict, so a later `fusion_wait` says the same
 * thing as the delegation that first failed.
 *
 * The remedy depends on the route: only a bridge route Fusion actually wires (the
 * antigravity/agy one) has transport and `mcpBridge`/`permissionMode` settings to
 * check. Any other route (session-6113b527 ran `devin` through `dsh-tauri-acp`,
 * whose `session/new` carries no MCP servers) cannot be configured into reaching
 * Host tools from inside Fusion, so naming agy's settings there is a false lead.
 *
 * `workerText` is the Worker's own bounded message from the captured request. It is
 * unverified prose, not a report, but withholding it made the Lead tell the user the
 * Sidekick never replied when it had answered the question correctly.
 */
export declare const WORKER_QUOTE_MAX = 2000;
export declare const TEXT_REPORT_REFUSED_MAX = 300;
export declare function workerUnreachableReply(childId: string | undefined, route: {
    provider: string;
    model: string;
    mode?: string;
    workerText?: string;
    workerTextTruncated?: boolean;
    textReportRejected?: string;
}): string;
/**
 * At most `WORKER_QUOTE_MAX` characters of the Worker's own words, with an honest
 * truncation marker. `truncated` is supplied when the caller already cut the text for
 * storage, so the ledger and the reply agree instead of re-deriving a shorter value.
 */
export declare function boundedWorkerText(text: string | undefined, truncated?: boolean): {
    text: string;
    truncated: boolean;
    note: string;
} | undefined;
/** Continue/switch is refused before the route is written. Say so when a switch was requested. */
export declare function unsettledContinuationError(switching: boolean): {
    zh: string;
    en: string;
};
