import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { JobView } from '@deepseek-ai/dsh-jobs';
import type { ArtifactRef, Role, TaskId } from '../contracts.js';
import type { SqliteFusionStore } from '../task/sqlite-store.js';
import type { SessionBinding } from './bindings.js';
interface EffectRecord {
    schemaVersion: 1;
    taskId: TaskId;
    agentId: string;
    role: Role;
    callId: string;
    rootCallId: string;
    toolName: string;
    processId: number;
    startedAt: string;
    state: 'dispatch-started' | 'returned' | 'outcome-unknown' | 'inspected' | 'retained';
    arguments: ArtifactRef;
    endedAt?: string;
    nativeIsError?: boolean;
    inspectionEvidence?: string;
    quiescenceBasis?: 'explicit-user-inspection';
    nativeJob?: {
        id: string;
        startedAt: number;
        deadlineAt: number | null;
        status: JobView['status'];
        detail?: string;
    };
    /**
     * Set when the Worker declared this running job as a runtime its work order
     * preserves across the report. `state: 'retained'` is deliberately not pending:
     * the report is allowed to land while the process runs, but the record keeps
     * the identity (`processId`, `startedAt`) that forbids adopting it later.
     */
    retained?: {
        purpose: string;
        commandDigest: string;
        cwd: string;
        deadlineAt: number | null;
    };
}
/** What the Host knows about one retained runtime, for the next brief and for status. */
export interface RetainedRuntime {
    readonly jobId: string;
    readonly purpose: string;
    readonly commandDigest: string;
    readonly cwd: string;
    readonly deadlineAt: number | null;
    readonly startedAt: number;
    readonly status: JobView['status'];
}
/** Public native dispatch journal; it never wraps a provider or invents a PID. */
export declare class NativeEffects {
    #private;
    readonly ctx: Context;
    readonly store: SqliteFusionStore;
    readonly callbacks: {
        owner(agent: Agent): {
            binding: SessionBinding;
            role: Role;
        } | undefined;
        track(exec: Readonly<ToolExecution>): boolean;
        failed(agent: Agent, error: unknown): void;
        backgroundMaxMs?(exec: Readonly<ToolExecution>, binding: SessionBinding): number | null;
    };
    constructor(ctx: Context, store: SqliteFusionStore, callbacks: {
        owner(agent: Agent): {
            binding: SessionBinding;
            role: Role;
        } | undefined;
        track(exec: Readonly<ToolExecution>): boolean;
        failed(agent: Agent, error: unknown): void;
        backgroundMaxMs?(exec: Readonly<ToolExecution>, binding: SessionBinding): number | null;
    });
    install(): () => void;
    backgroundProblem(exec: Readonly<ToolExecution>): string | undefined;
    jobProblem(exec: Readonly<ToolExecution>, taskId: TaskId): string | undefined;
    waitingForJob(agent: Agent): boolean;
    /**
     * Whether a tool call this process is running belongs to this task, or a
     * native job it started there is still unsettled. This is the in-process half
     * of the deletion guard: a durable row alone cannot tell a live call from the
     * residue of an interrupted one, because both look like `dispatch-started`.
     */
    live(taskId: TaskId): boolean;
    onlyBackgroundPending(taskId: TaskId): boolean;
    stopJobs(taskId: TaskId): Promise<void>;
    pending(taskId: TaskId): readonly {
        id: string;
        record: EffectRecord;
    }[];
    /**
     * Convert one live background job into a declared runtime that may outlive the
     * Worker's report. The report then lands while the process runs; the journal row
     * keeps the start-time identity that forbids any later Host from adopting a
     * process it did not start, and the declared deadline bounds the process's life.
     */
    retain(taskId: TaskId, jobId: string, request: {
        agentId: string;
        workOrderId: string;
        purpose: string;
        maxMs: number;
    }): RetainedRuntime;
    /** The runtimes this task is keeping alive, for status and for the next brief. */
    retained(taskId: TaskId): readonly RetainedRuntime[];
    /**
     * Retained rows written by a *different* Host process. A new process never owns
     * them: the recorded PID and start time are the only identity available, so they
     * are reported and inspected rather than adopted or forgotten.
     */
    strandedRetained(taskId: TaskId): readonly {
        id: string;
        record: EffectRecord;
    }[];
    assertInspection(taskId: TaskId, effectsStopped: boolean): void;
    inspected(taskId: TaskId, evidence: string, effectsStopped: boolean): void;
}
export {};
