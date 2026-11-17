import type { DatabaseSync } from 'node:sqlite';
import type { FusionStatus } from '../status.js';
import type { ForemanAttributionRecord, TaskId } from '../contracts.js';
import type { SqliteFusionStore } from './sqlite-store.js';
export { projectPlanReviewMetrics, type PlanReviewMetrics } from '../status.js';
type TaskStatus = NonNullable<FusionStatus['task']>;
export declare class StatusDataError extends Error {
}
export declare class StatusPending extends Error {
    readonly task: string;
    constructor(task: string);
}
/** Rebuildable read model. Triggers also track writes/deletes by older plugin processes. */
export declare class StatusIndex {
    #private;
    readonly db: DatabaseSync;
    constructor(db: DatabaseSync);
    /** Call inside the document transaction, after the source row is written. */
    sync(id: string): void;
    /** Each batch is its own transaction, so a legacy backfill does not monopolize the writer lock. */
    flushBatch(task: string): boolean;
    /** Bounded memory even for a legacy database; the surrounding transaction is atomic. */
    flush(task?: string): void;
    rebuild(): void;
    read(task: string): Pick<TaskStatus, 'usage' | 'requests' | 'tools' | 'contexts' | 'unsettledTools'> & {
        checking: boolean;
    };
    workerConversations(task: string): number;
    hasConversation(task: string, session: string): boolean;
}
export declare function validateForemanAttributionRecord(record: ForemanAttributionRecord): void;
/**
 * Record a durable Foreman defect attribution record for offline analysis.
 *
 * The event log is the ONLY authority. An earlier version also wrote a per-id index document,
 * which could not be atomic with the event: the store appends events and writes documents in
 * separate transactions, so a crash between them left either a duplicated event or a record
 * that replay could not see. Both failure modes are worse than a slightly slower id check, and
 * the task state already folds these events into `foremanAttributions`.
 *
 * Idempotent for the same id with the same content — re-reporting after a restart is normal.
 * A different record under the same id is a conflict, because the id is the external key an
 * offline calibration run joins on.
 * @param store - durable store; the task must exist, because an attribution describes a task.
 * @param record - the attribution to append.
 * @throws when the task does not exist, the record is invalid, or the id conflicts.
 */
export declare function recordForemanAttribution(store: SqliteFusionStore, record: ForemanAttributionRecord): void;
/**
 * Read a task's Foreman defect attributions from the authority they were written to.
 *
 * Derived from the folded task state, so a replay and a rebuilt index agree. An unknown task
 * has no attributions rather than an error: this is a read path.
 * @param store - durable store.
 * @param taskId - the task to read.
 * @returns its attribution records, in the order they were recorded.
 */
export declare function readForemanAttributions(store: SqliteFusionStore, taskId: TaskId): readonly ForemanAttributionRecord[];
