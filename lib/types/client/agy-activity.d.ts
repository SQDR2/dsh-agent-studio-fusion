/**
 * One activity row as the parent conversation can honestly present it.
 *
 * A bridge route reports a step it already executed through its own transport;
 * the recorded payload only carries the inner tool name and its input, so the
 * row is unwrapped here. Nothing is replayed, executed or inferred: `tool` is the
 * recorded operation, `arguments` are the recorded arguments, and an unreadable
 * payload falls back to the raw call arguments shown by the renderer.
 */
export interface PresentedCall {
    /** The operation to name in the row: the unwrapped inner tool, or the recorded name. */
    tool: string;
    /** Set when the row is a bridge transport replay rather than a direct Worker tool. */
    transport?: string;
    /** Arguments describing the presented operation; `{}` when the payload is unreadable. */
    arguments: Record<string, unknown>;
    /** MCP server the inner tool belonged to, when the route reported one. */
    server?: string;
    /** True when the recorded arguments were not a JSON object and must stay raw. */
    malformed: boolean;
    /** The recorded call arguments, unchanged. */
    raw: string;
}
/**
 * Describe one recorded call without inventing anything. Only a registered route
 * transport or the exact generated Code Mode wrapper is unwrapped, matching the
 * host-side projection predicate in `presentsActivity`.
 */
export declare function presentedCall(name: string, rawArguments: string): PresentedCall;
/** The command line this call ran, when it reported one. agy also uses `Command`. */
export declare function presentedCommand(call: PresentedCall): string | undefined;
/** The file path this call addressed, when it reported one. */
export declare function presentedPath(call: PresentedCall): string | undefined;
/** A human preview the route attached (agy's `Description`/`toolAction`). */
export declare function presentedDescription(call: PresentedCall): string | undefined;
/** A search pattern or directory this call reported. */
export declare function presentedQuery(call: PresentedCall): string | undefined;
/** The working directory the route reported, when it was not the session's own. */
export declare function presentedCwd(call: PresentedCall): string | undefined;
/** Whether this call is a shell command, so the renderer uses a terminal card. */
export declare function presentsTerminal(call: PresentedCall): boolean;
/**
 * The exit code a terminal step really reported, in that producer's own format:
 * agy writes `The command exited with code N` / `[exit code N]` inside the
 * recorded output; this Host's shell tools end the output with `[exit code: N]`.
 * Anything else — a read/view/search result quoting such a line — has no terminal
 * status, so the card falls back to `isError` and never invents a failure.
 */
export declare function presentedExitCode(call: PresentedCall, output: string): number | undefined;
