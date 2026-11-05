import { StatusIndex } from './status-index.js';
import type { ArtifactRef, FusionEvent, OutboxRow, OutboxState, TaskId } from '../contracts.js';
import type { PersistedTask, TaskState } from './state.js';
import type { ArtifactRecord, FusionStore } from './store.js';
import type { DeletionBlocker } from './deletion.js';
/** Durable Host backend. Every read is fresh; CAS and outbox writes share one transaction. */
export interface DeletionAuthority {
    /**
     * Why this task still owns live work in this process, or `undefined` when it
     * owns none. Only the Host can answer this: it holds the Agent, tool call,
     * lease and stop registries. A caller without a Host passes nothing live.
     */
    liveReason(taskId: TaskId): DeletionBlocker | undefined;
}
export declare class SqliteFusionStore implements FusionStore {
    #private;
    readonly filename: string;
    constructor(filename: string);
    statusSnapshot<T>(read: (index: StatusIndex) => T, backfill?: boolean): T;
    /** HTTP reads yield between committed batches; cancellation retains resumable progress. */
    statusSnapshotAsync<T>(read: (index: StatusIndex) => T, signal?: AbortSignal): Promise<T>;
    close(): void;
    listTaskIds(): readonly TaskId[];
    listDocumentIds(prefix: string): readonly string[];
    load(taskId: TaskId): TaskState | undefined;
    /**
     * Remove one task record and everything that belongs to it.
     *
     * Liveness comes from `authority`, the in-process Host that owns the Agents,
     * tool calls, leases and stops, plus durable rows a *different living* process
     * left open. The persisted phase is deliberately not consulted: it describes
     * where an interrupted process stopped, not whether anything still runs. See
     * `deletion.ts` for why that distinction decides this bug.
     */
    deleteTask(taskId: string, authority: DeletionAuthority): void;
    events(taskId: TaskId): readonly FusionEvent[];
    replay(taskId: TaskId): TaskState;
    create(event: Extract<FusionEvent, {
        type: 'task/created';
    }>): TaskState;
    transact(taskId: TaskId, expectedSeq: number, mutate: (current: PersistedTask) => {
        events?: readonly FusionEvent[];
        outbox?: readonly OutboxRow[];
    }): TaskState;
    append(taskId: TaskId, expectedRevision: number, events: readonly FusionEvent[]): TaskState;
    putArtifact(taskId: TaskId, bytes: Uint8Array, mediaType: string): ArtifactRef;
    /** One atomic metadata update for a bounded workspace evidence batch. */
    putArtifacts(taskId: TaskId, inputs: readonly {
        bytes: Uint8Array;
        mediaType: string;
    }[]): ArtifactRef[];
    /** Load owned evidence bytes and verify content before trusting the reference. */
    readArtifact(taskId: TaskId, digest: string): Uint8Array;
    readArtifacts(taskId: TaskId, digests: readonly string[]): Uint8Array[];
    prepareOutbox(row: OutboxRow): OutboxRow;
    advanceOutbox(taskId: TaskId, operationId: string, from: OutboxState, to: OutboxState, patch?: Partial<OutboxRow>): OutboxRow;
    outbox(taskId: TaskId): readonly OutboxRow[];
    artifacts(taskId: TaskId): readonly ArtifactRecord[];
    /** Host binding / usage documents require caller-side schema validation after loading. */
    readDocument(id: string): {
        revision: number;
        value: unknown;
    } | undefined;
    /** Compare-and-swap prevents an old Host instance overwriting a newer selection or bill. */
    writeDocument(id: string, expectedRevision: number, value: unknown): number;
    writeDocuments(rows: readonly {
        id: string;
        expectedRevision: number;
        value: unknown;
    }[]): number[];
}
