import type { OperationId, SessionId, TaskId, WriteLease } from '../contracts.js';
export interface LeaseRecord extends WriteLease {
    readonly owner: string;
    readonly pid: number;
    readonly acquiredAt: string;
    readonly liveProcessRefs: readonly number[];
}
export declare function canonicalWorkspace(cwd: string): string;
/**
 * Move a pre-rename lease registry to its current name.
 *
 * The registry outlives a single process, so a rename must carry it: a fresh
 * empty directory beside a lock nobody reads would report the workspace as
 * free while a previous holder believes it still owns the write lease. A move
 * keeps that holder visible to the next process; a cross-device install copies
 * the directory instead, and a failed copy removes only what it created.
 *
 * @param next - registry directory the current release uses.
 * @param legacy - registry directory the previous name used.
 * @returns whether a legacy registry was adopted.
 */
export declare function adoptLegacyLeaseRoot(next: string, legacy?: string): boolean;
export declare function leasePath(workspaceId: string, root?: string): string;
export declare class WorkspaceWriteLease {
    #private;
    private readonly root;
    constructor(root?: string);
    acquire(input: {
        cwd: string;
        holder: SessionId;
        taskId: TaskId;
        operationId: OperationId;
        liveProcessRefs?: readonly number[];
    }): LeaseRecord;
    assertGeneration(lease: WriteLease, generation: number): void;
    stillHeld(lease: LeaseRecord): boolean;
    /** Caller must prove native Worker/tool quiescence before releasing. */
    release(lease: LeaseRecord): void;
    /** Trusted recovery inspection. A dead PID by itself never authorizes stealing. */
    current(cwd: string): LeaseRecord | undefined;
}
export declare function classifyEffect(kind: 'read-tool' | 'write-tool' | 'unknown-shell'): 'read' | 'write';
