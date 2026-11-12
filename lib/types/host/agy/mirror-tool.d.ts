import { execFileSync } from 'node:child_process';
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools';
import type { RunRegistry } from './recording.js';
export declare const MIRROR_TOOL_NAME = "agy_tool";
/** The only tool this DSH deployment lets a model call directly. */
export declare const WRAPPER_TOOL_NAME = "run_code";
/**
 * Retrieve the committed HEAD content of a file via git, for computing
 * line diffs on full-file writes. Pure & safe: catches all failures (not in git,
 * untracked, git missing, binary) and returns null in <=500ms.
 */
export declare function getGitHeadContent(filePath: string, execFn?: typeof execFileSync): string | null;
/**
 * Build the run_code tool-call arguments that replay one recorded agy tool
 * step. The deployment's tool-dispatch policy only allows `run_code` as a
 * direct model call (everything else must be invoked from inside a
 * program), so the span cut addresses run_code with a generated program
 * whose single statement calls the registered mirror tool — the inner
 * dispatch is what renders the native tool card.
 */
export declare function buildMirrorRunCode(runId: string, eventIndex: number, toolName: string, brief?: string): {
    code: string;
    description: string;
};
/** Short human preview for a recorded tool step (used in Code Mode titles). */
export declare function toolStepBrief(toolName: string, args: unknown, server?: string): string;
/** Extract the (run, step) cursor embedded by buildMirrorRunCode. */
export declare function parseMirrorInvocation(code: string): {
    run: string;
    step: number;
} | null;
export interface UnwrappedToolCall {
    tool: string;
    input: Record<string, unknown>;
    server?: string;
    isMcp: boolean;
}
export declare function cleanString(val: unknown): string;
export declare function parseInnerArgs(raw: unknown): Record<string, unknown>;
export declare function unwrapMcpTool(toolName: string, rawArgs: unknown): UnwrappedToolCall;
export declare function cleanResultText(text: string): string;
/** Native pending-card projection for one mirrored agy tool call. */
export declare function presentMirrorCall(args: unknown): ToolCallView | undefined;
/** Native completed-card projection for one mirrored agy tool call. */
export declare function presentMirrorResult(args: unknown, result: {
    content: unknown[];
    isError: boolean;
}): ToolResultView | undefined;
/**
 * Degraded result for a mirrored step whose recording is gone (bridge
 * restarted, or the run was recycled while a wedged tool step held the span
 * for hours). It must NOT read like a harness error: the model used to
 * receive `no recorded agy run` and spent the whole turn reverse-engineering
 * this plugin instead of finishing the user's task (flash-blast incident,
 * 2026-10-10). The step really did run — only its replay is unavailable.
 */
export declare function recordingUnavailable(step: number, toolName: string, input?: unknown, reason?: string): string;
export declare function defineAgyMirrorTool(deps: {
    runs: RunRegistry;
}): import("@deepseek-ai/dsh-tools").ToolDefinition;
