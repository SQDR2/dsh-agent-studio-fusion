/**
 * Tools that only inspect the workspace, the task ledger, or the session's own
 * instructions. Every role may call these while another role holds the write
 * lease, and an enforced-workflow Lead's whole ceiling is built from this list.
 *
 * `skill` belongs here. The Host publishes the skill catalog to whichever agent
 * can resolve the `skill` tool, and a user-invoked `/<name>` arrives as an
 * instruction to load that name (for example `grill-me` → `grilling`). Loading a
 * skill returns text; it never writes. Leaving it out of the Lead's ceiling left
 * a one-line instruction the Lead could not expand, so it improvised from the
 * user's prose instead of following the skill — measured in
 * session-2a7a61bd-fb83-4697-ae44-86934c0e4556, where the Lead never reached
 * `grilling`'s "finding facts is your job" rule and asked the user for facts the
 * repository already answered.
 */
export interface ReadToolCall {
    readonly name: string;
    readonly arguments?: unknown;
}
export declare const READ_TOOL_NAMES: readonly string[];
export declare const READ_TOOLS: ReadonlySet<string>;
export declare const isRead: (exec: Readonly<ReadToolCall>) => boolean;
