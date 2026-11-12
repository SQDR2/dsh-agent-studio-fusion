import { type PluginConfig } from './types.js';
/**
 * Inline text files into the prompt (v0.2): each readable textual file
 * becomes a fenced section. Paths resolve against the oneshot cwd;
 * absolute paths pass through.
 */
export declare function inlineFiles(prompt: string, paths: readonly string[], cwd: string): Promise<string>;
/** Write a JSON schema to a temp file; returns the --json-schema argv tail. */
export declare function schemaArgs(schema: unknown): Promise<{
    args: string[];
    cleanup: () => Promise<void>;
}>;
export interface OneShotResult {
    ok: boolean;
    text: string;
    conversationId: string | null;
    error?: string;
    durationMs: number;
}
export interface OneShotDeps {
    cfg: () => PluginConfig;
    bin: () => string | null;
}
export declare function runAgyOnce(deps: OneShotDeps, req: {
    prompt: string;
    model?: string;
    effort?: string;
    mode?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Workspace-relative or absolute text files to inline into the prompt. */
    readPaths?: readonly string[];
    /** JSON schema enforcing the final result (--json-schema). */
    schema?: unknown;
}): Promise<OneShotResult>;
