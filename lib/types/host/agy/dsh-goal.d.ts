import type { RequestMessage, StreamChunk, ToolCallId } from '@deepseek-ai/dsh-llm';
export declare const toToolCallId: (id: string) => ToolCallId;
export interface GoalContext {
    goalId?: string;
    revision?: number;
    round?: number;
    maxRounds?: number;
    objective?: string;
}
/**
 * Detect whether the incoming request is part of a DSH <goal_round> continuation.
 * Extracts goalId, revision, round, and objective if available.
 */
export declare function detectGoalContext(messages: readonly RequestMessage[]): GoalContext | null;
/**
 * Detect whether DSH is in Plan Mode.
 * DSH plan-mode injects "You are in plan mode" into the runtime context prompt.
 */
export declare function isPlanMode(messages: readonly RequestMessage[]): boolean;
/**
 * Check if the trailing span represents completion of a bridge-emitted `update_goal` call.
 * This covers both the direct tool-result message and DSH's deferred `<goal_complete>` notice.
 *
 * The markers only mean "synthetic completion hop" while they are the TRAILING
 * content. A genuine user message appearing before any marker is a fresh
 * instruction that must reach agy — scanning a fixed window for markers
 * "anywhere" swallowed exactly that: a message sent right after a goal
 * completed was finished as an empty turn without spawning agy
 * (2026-10-17, "把相关的经验整理到agents.md" × 2).
 */
export declare function isGoalToolContinuation(messages: readonly RequestMessage[]): boolean;
/**
 * Check if the trailing message is the tool result of a bridge-emitted `exit_plan_mode` call.
 */
export declare function isPlanToolContinuation(messages: readonly RequestMessage[]): boolean;
/**
 * Build the synthetic `update_goal` tool-call chunk that marks the goal complete on DSH.
 */
export declare function buildGoalCompleteToolCallBlock(goalContext: GoalContext, blockIdx: number): StreamChunk[];
/**
 * Build the synthetic `exit_plan_mode` tool-call chunk that presents the generated plan to DSH.
 */
export declare function buildPlanExitToolCallBlock(planMarkdown: string, blockIdx: number): StreamChunk[];
