import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { TaskId } from '../contracts.js';
import type { SqliteFusionStore } from '../task/sqlite-store.js';
/** Durable Lead-authored refinements survive native compaction and request races. */
export declare function workerBriefs(store: SqliteFusionStore, taskId: TaskId): {
    revision: number;
    deliveryId: string;
    source: "lead-tool-feedback";
    nativeCallId: string;
    payloadRef: string;
    feedback: string;
}[];
/**
 * Pin a bounded projection, including the first handoff, on both native roles.
 * The complete owned outbox, journal and artifact bytes remain durable. Original
 * user input and the frozen work order are retained separately by NativeTaskContext.
 */
export declare function workerHandoffProjection(store: SqliteFusionStore, taskId: TaskId): {
    latestBriefRevision: number;
    historyDigest: import("../contracts.js").Digest;
    policy: "recent-whole-records-utf8-v1";
    contentByteBudget: number;
    totalRecords: number;
    omittedRecords: number;
    totalContentBytes: number;
    retainedContentBytes: number;
    records: {
        revision: number;
        source: "lead-tool-handoff" | "lead-tool-feedback";
        sourceId: string;
        payloadRef: string;
        content: string;
    }[];
    schemaVersion: 1;
};
/** Brief bodies already arrive as native messages; the snapshot pins only their identity and digests. */
export declare function compactHandoffs(projection: ReturnType<typeof workerHandoffProjection>): {
    records: {
        contentDigest: import("../contracts.js").Digest;
        revision: number;
        source: "lead-tool-handoff" | "lead-tool-feedback";
        sourceId: string;
        payloadRef: string;
    }[];
    latestBriefRevision: number;
    historyDigest: import("../contracts.js").Digest;
    policy: "recent-whole-records-utf8-v1";
    contentByteBudget: number;
    totalRecords: number;
    omittedRecords: number;
    totalContentBytes: number;
    retainedContentBytes: number;
    schemaVersion: 1;
};
export declare function assertWorkerBriefRequest(store: SqliteFusionStore, taskId: TaskId, request: GenerateOptions): void;
/** Bind model-generated tools to the brief that their exact native request saw. */
export declare function captureWorkerBrief(store: SqliteFusionStore, taskId: TaskId, agent: Agent, turn: number, step: number, revision: number): void;
/**
 * Bind one non-read Worker tool to the brief its own request saw.
 *
 * A native call is identified by `rootCallId`, which is the id of the block the
 * assistant message emitted. A bridge route (Antigravity's `agy`) instead runs
 * the call inside its OWN loop and reports the step through its transport, so
 * the bridged dispatch carries a bridge-local call id that never appears in this
 * session (`agy-mcp-N`). Refusing it as "no native request" refused the one tool
 * a bridge Worker exists to call — `fusion_submit_result` — and stranded the
 * task (session-1d65b1d0). Such a call is still owned by a native request: it
 * is dispatched synchronously while the transport call runs, so the enclosing
 * assistant message is the one that emitted the transport. `transport` carries
 * that name only for a role whose route really is a bridge.
 */
export declare function workerToolBriefProblem(store: SqliteFusionStore, taskId: TaskId, exec: ToolExecution, revision: number, transport?: string): string | undefined;
