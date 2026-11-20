import type { OperationId, SessionId, TaskId, WriteLease } from '../contracts.js';
export interface LeaseRecord extends WriteLease {
    readonly owner: string;
    readonly pid: number;
    readonly acquiredAt: string;
    readonly liveProcessRefs: readonly number[];
    /**
     * When the writing process started, to the second.
     *
     * A pid is an id the kernel recycles, not an identity: after a crash the next
     * process on this machine frequently gets the same number, and reading that as
     * "the old writer is still here" is what keeps a workspace locked forever. The
     * start time is the part of the identity the kernel does not reuse. Absent on
     * records written before this field existed, and on hosts without `/proc`.
     */
    readonly ownerStartedAt?: string;
}
/** One process incarnation: the pid and the moment that process started, if knowable. */
export interface ProcessIncarnation {
    readonly pid: number;
    readonly startedAt: number | undefined;
}
/**
 * This exact process incarnation, or `undefined` when no such process can still be
 * running. A zombie has a `/proc` entry and cannot write, so it is reported gone.
 *
 * `startedAt` is `undefined` on a platform without procfs: callers may still ask
 * "is this pid present", but they cannot tell a recycled id from the original.
 */
export declare function processIncarnation(pid: number): ProcessIncarnation | undefined;
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
export interface LeaseInput {
    cwd: string;
    holder: SessionId;
    taskId: TaskId;
    operationId: OperationId;
    liveProcessRefs?: readonly number[];
}
export declare class WorkspaceWriteLease {
    #private;
    private readonly root;
    constructor(root?: string);
    acquire(input: LeaseInput): LeaseRecord;
    /**
     * Take over a lease whose writer is gone.
     *
     * This is a compare-and-swap on the record the caller inspected, not a blind
     * overwrite: if another process acquired, released or reclaimed the lease in
     * the meantime, the swap fails and the caller keeps the busy error. The caller
     * is responsible for having proved the writer is gone; `alive` answers that
     * question, and `Coordinator#abandonedLease` adds the effect-journal half.
     */
    reclaim(prior: LeaseRecord, input: LeaseInput): LeaseRecord;
    /**
     * Whether the process that wrote this record can still be running.
     *
     * A present pid is not enough. The recorded start time decides a recycled id,
     * and a record written before the current process on that pid existed cannot be
     * held by it — which is how a record from before this field existed is judged.
     * Any other recorded process reference counts as live, because a command the
     * writer started may outlive it.
     */
    alive(record: LeaseRecord): boolean;
    assertGeneration(lease: WriteLease, generation: number): void;
    stillHeld(lease: LeaseRecord): boolean;
    /** Caller must prove native Worker/tool quiescence before releasing. */
    release(lease: LeaseRecord): void;
    /** Trusted recovery inspection. A dead PID by itself never authorizes stealing. */
    current(cwd: string): LeaseRecord | undefined;
}
export declare function classifyEffect(kind: 'read-tool' | 'write-tool' | 'unknown-shell'): 'read' | 'write';
