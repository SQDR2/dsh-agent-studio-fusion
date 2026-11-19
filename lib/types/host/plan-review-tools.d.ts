import type { ToolSchema } from '@deepseek-ai/dsh-llm';
import type { ForemanAssessment } from '../contracts.js';
import { type ScopedToolService } from './tool-seam.js';
/** The default window of one `read`, matching the Lead's own default. */
export declare const FOREMAN_READ_DEFAULT_LIMIT = 2000;
/**
 * How long one command may run inside a review.
 *
 * The reviewer is given the Host's shell so it can check an acceptance claim instead of
 * trusting it, and until now nothing bounded a single command: the review's wall clock was the
 * only thing that could end one, so an accidental `find /` or a command waiting on input ran
 * until the whole review was killed — taking the completed turns with it.
 *
 * The clock now grows with the work a review demonstrates, which makes that gap worse rather
 * than better: a command that produces nothing would be paid for by the calls around it. So
 * each command gets its own ceiling, and the review says which limit stopped it. Two minutes is
 * generous against the observed work: the reviews that completed their checks ran `pnpm build`
 * in 4.9s, and the one runaway command was a filesystem-wide `find` measured at 52.5s.
 */
export declare const FOREMAN_COMMAND_TIMEOUT_MS = 120000;
/**
 * The reviewer's whole tool table: three inspectors and the Host's shell.
 *
 * The shell is what lets a review check an acceptance claim instead of trusting it — run the
 * test, run the linter, read the exit status. It runs in the session's own sandbox mode, the
 * one the user chose, exactly like the Sidekick's; "audit only, never modify" is a prompt-level
 * rule for a model that follows instructions, not a second sandbox.
 */
export declare function foremanToolSchemas(): readonly ToolSchema[];
/** One settled tool call, in the shape a tool-result message needs. */
export interface ForemanToolResult {
    readonly text: string;
    readonly isError: boolean;
}
/** Everything a tool call needs: the frozen root, the Host runtime for the shell, and the caller's identity. */
export interface ForemanToolHost {
    /** Realpath of the frozen workspace root; undefined when the session has no workspace. */
    readonly root: string | undefined;
    /** `ctx.tools`, used only for the shell tool the Host itself registers. */
    readonly tools: ScopedToolService | undefined;
    readonly agent: unknown;
    readonly signal: AbortSignal | undefined;
    /** Call id prefix, so a shell dispatch is attributable in the Host's own logs. */
    readonly callIdPrefix: string;
    /** Monotonic counter for shell call ids. */
    readonly nextCallId: () => string;
    /**
     * Override for {@link FOREMAN_COMMAND_TIMEOUT_MS}.
     *
     * Only a test passes this: the limit is the Host's, not the model's, and a test cannot wait
     * two minutes to observe it. Production calls leave it unset.
     */
    readonly commandTimeoutMs?: number;
}
/**
 * One glob pattern as a path regex.
 *
 * The rules are the ones the Lead's `glob` documents: `**` crosses directories, `*` and `?`
 * stay inside one path segment, `{a,b}` is a choice, and a pattern without a separator matches
 * the basename at any depth.
 */
export declare function globToRegExp(pattern: string): RegExp;
/**
 * Run one reviewer tool call.
 *
 * A rejected call is a tool error, not a failed review: the message goes back to the model,
 * which can correct the path or the arguments and try again. Only the citation check below
 * can invalidate a whole assessment.
 */
export declare function executeForemanTool(name: string, rawArguments: string, host: ForemanToolHost): Promise<ForemanToolResult>;
/**
 * Check every citation in an assessment, then record the digest of each cited range.
 *
 * The verdict is only worth the code it names, so a citation that does not resolve discards
 * the whole assessment instead of being dropped: a review that cites one file it never opened
 * has told us its other claims are equally unchecked. The digest is recorded on the citation
 * so the persisted record proves which revision of those bytes the reviewer read, even after
 * the file changes underneath it.
 */
export declare function verifyForemanCitations(assessment: ForemanAssessment, root: string | undefined): {
    ok: true;
    assessment: ForemanAssessment;
} | {
    ok: false;
    reason: string;
};
