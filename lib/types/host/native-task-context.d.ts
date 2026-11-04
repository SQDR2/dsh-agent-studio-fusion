import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GenerateOptions, UserMessage } from '@deepseek-ai/dsh-llm';
import type { Role, TaskId } from '../contracts.js';
import type { SqliteFusionStore } from '../task/sqlite-store.js';
import type { SessionBinding } from './bindings.js';
export declare const FUSION_TASK_CONTEXT = "fusion:task";
export type ContextDetail = 'compact' | 'full';
/** Programmatic facts travel as native user-role context, never as system instructions. */
export declare class NativeTaskContext {
    #private;
    readonly store: SqliteFusionStore;
    readonly parent: (id: string) => Agent | undefined;
    constructor(store: SqliteFusionStore, parent: (id: string) => Agent | undefined);
    /**
     * Record where this task's user instructions begin. A task created by an automatic
     * rollover continues the same conversation, so it inherits the boundary of the task
     * it replaces: the user's instructions belong to the conversation, not to one
     * accounting task. Narrowing it to the rollover point silently hid every earlier
     * user message from `fusion_delegate`'s verbatim requirement check, which then
     * rejected the Lead's own true quotes as fabricated.
     */
    begin(agent: Agent, taskId: TaskId, firstSeq?: number): void;
    /** The recorded user-instruction boundary of a task, when it has one. */
    originSeq(taskId: TaskId): number | undefined;
    /**
     * `compact` is appended on every changed step: it carries only state the
     * native history does not already hold, so the expensive Lead does not
     * re-read its own brief, the delivered report or the user's messages on
     * every request. `full` restores everything after compaction, when those
     * native messages may have been summarized away.
     */
    render(binding: SessionBinding, role: Role, detail?: ContextDetail): string;
    /** Run after native pre-step handlers, including the existing compaction owner. */
    message(agent: Agent, binding: SessionBinding, role: Role, detail?: ContextDetail): UserMessage | undefined;
    /** The final frozen request must contain the snapshot that was actually assembled. */
    assertPresent(agent: Agent, binding: SessionBinding, role: Role, request: GenerateOptions): void;
    prepareCompaction(agent: Agent, binding: SessionBinding, role: Role, sourceSurfaceSeqs: readonly number[]): string;
    restoreCompaction(agent: Agent, binding: SessionBinding, role: Role, id: string, compactionId: string): void;
}
