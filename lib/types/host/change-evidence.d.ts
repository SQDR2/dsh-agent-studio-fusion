import type { ArtifactRef, SnapshotId, TaskId } from '../contracts.js';
import type { SqliteFusionStore } from '../task/sqlite-store.js';
import type { WorkspaceEntry, WorkspaceSnapshot } from './workspace.js';
export interface ChangeBase {
    schemaVersion: 1;
    snapshot: SnapshotId;
    contents: Record<string, ArtifactRef>;
    /**
     * Paths the Lead widened the scope to only after they had already changed, so their
     * delegation-time bytes are gone. Diffs carry no pre-image for them and the
     * rewritten-test gate cannot compare original lines; the review must say so instead of
     * pretending the file was untouched (`session-daa71a4a`: refusing to record them at all
     * left the task with no admissible report and no admissible widening).
     */
    unavailable?: readonly string[];
}
export declare function captureChangeBase(store: SqliteFusionStore, taskId: TaskId, base: WorkspaceSnapshot, allowed: readonly string[]): ChangeBase;
/**
 * The same base bytes, for paths the Lead adds to the frozen scope after a report. A file the
 * Worker (or the task's own build command) already changed no longer matches the snapshot, so
 * its delegation-time bytes cannot be recorded: that path is reported as unavailable instead of
 * failing, which would leave the task with no admissible report and no admissible widening.
 */
export declare function captureLaterChangeBase(store: SqliteFusionStore, taskId: TaskId, base: WorkspaceSnapshot, allowed: readonly string[]): ChangeBase;
export interface ChangeDiff {
    path: string;
    status: 'text' | 'binary' | 'type-change' | 'unavailable-base';
    before?: {
        entry: WorkspaceEntry;
        content?: ArtifactRef;
    };
    after?: {
        entry: WorkspaceEntry;
        content: ArtifactRef;
    };
    patch?: ArtifactRef;
}
export declare function saveChangeManifest(store: SqliteFusionStore, taskId: TaskId, base: WorkspaceSnapshot, candidate: WorkspaceSnapshot, captured?: ChangeBase): ArtifactRef;
