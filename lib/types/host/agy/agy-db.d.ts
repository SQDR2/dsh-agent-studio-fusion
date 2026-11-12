/**
 * Candidate conversations directories for a conversation id.
 * Pool/isolated accounts write agy state under their own HOME
 * (~/.dsh/agy-accounts/<id>/.gemini/...), NOT the system ~/.gemini
 * (issue: thinking/tool-args invisible when using isolated accounts).
 */
export declare function conversationsDirCandidates(accountHome?: string): string[];
/** Locate an existing conversation DB across system + pool homes. */
export declare function findConversationDb(conversationId: string, accountHome?: string): string | null;
interface CachedStep {
    name: string;
    args: Record<string, unknown>;
}
export declare function isSafeConversationId(id: string): boolean;
/**
 * Extract model thought text from a protobuf step_payload.
 *
 * Primary: field 20 -> sub-field 3 (verified on simple print-mode turns).
 * Fallback: longest non-JSON prose string, then toolAction/toolSummary
 * embedded in tool-arg JSON (tool-heavy agent turns often store only those).
 */
export declare function extractStepThoughts(payload: Buffer): string | null;
/**
 * Extract tool name and full JSON args from a protobuf step_payload.
 *
 * agy's tool step payload wraps the call in standard protobuf fields:
 *   field 2 (tag 0x12, length-delimited) → tool_name ("write_to_file", ...)
 *   field 3 (tag 0x1a, length-delimited) → args JSON ('{"CodeContent":"...",...}')
 *
 * We scan for this deterministic sequence directly (sub-millisecond, no
 * recursive descent or backtracking) and fall back to scanning for balanced
 * JSON slices containing known parameter keys.
 */
export declare function extractToolInfo(payload: Buffer): CachedStep | null;
/**
 * Read the full tool parameter object for a given step index from the agy
 * conversation database. Returns null when the DB is unavailable or does
 * not contain the requested step.
 *
 * Results are cached per conversationId for up to 5 minutes to avoid
 * repeated DB reads within the same session.
 */
export declare function readFullToolArgs(conversationId: string, stepIndex: number, accountHome?: string): Promise<{
    name: string;
    args: Record<string, unknown>;
} | null>;
/**
 * Read the full thought/reasoning text for a given step index from the agy
 * conversation database. Returns null when the DB is unavailable or the
 * step does not contain thought text.
 */
export declare function readStepThoughts(conversationId: string, stepIndex: number, accountHome?: string): Promise<string | null>;
/** Clear the DB cache (e.g. when a run settles). */
export declare function clearAgyDbCache(): void;
/**
 * TEST-ONLY injection: point the module at a custom agy conversations dir.
 * Never call from production code (module-level directory is shared within a
 * process); used only by unit tests to exercise parsing against a temp DB.
 */
export declare function __setAgyDbDirForTest(dir: string): void;
/**
 * TEST-ONLY injection: override the node:sqlite reader function.
 * Pass null to simulate node:sqlite missing (forcing sqlite3 CLI fallback),
 * or undefined to reset back to automatic probing.
 */
export declare function __setNodeSqliteQueryForTest(fn: ((dbPath: string, sql: string) => Promise<string[]>) | null | undefined): void;
export {};
