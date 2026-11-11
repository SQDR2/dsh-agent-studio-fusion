/**
 * Authority actions are the Lead's and the user's, not a consequence of holding
 * the workspace write lease. `allowedPaths` bounds file edits; it says nothing
 * about `git commit`, `git push`, a pull request, a publish or a CI run, which
 * all leave the workspace (or rewrite its history) and cannot be reviewed
 * afterwards. Devin states the same split in its Sidekick framing ("does not
 * own commits, pushes, pull requests or CI"); this module is the Host-side
 * enforcement of it, the same way the Lead's read-only sandbox enforces the
 * Lead's half.
 *
 * The Worker stays able to do the work the user asked for inside the lease. What
 * it may not do is decide that the change is ready to publish. A refused action
 * must therefore be reported, not worked around: the Worker submits its report
 * with the action listed as pending, and the Lead performs it (or grants it
 * explicitly for this work order, which only the Lead can do and which the user's
 * request has to justify).
 *
 * This is a command-line guard, not a sandbox. It reads the shell text: quoted
 * literal data (`grep -r 'git push' docs`) is not a command and is allowed, a
 * shell invoked as `bash -c "<text>"` is scanned recursively, and the common
 * launchers (`sudo`, `env`, `xargs`, `time`, ...) are looked through. A process
 * that builds its command at runtime (`python -c`, a script read from stdin) is
 * outside what a text guard can see; that residual gap is deliberate scope, not
 * an oversight, and it is why the prompt states the rule as well.
 */
import type { AuthorityAction } from '../contracts.js';
/** Every action the Host can grant, and refuse without a grant. */
export declare const AUTHORITY_ACTIONS: readonly AuthorityAction[];
/** Stable prefix so a refusal is attributable in a report and in a test. */
export declare const AUTHORITY_DENIED = "FUSION_WORKER_AUTHORITY_DENIED";
interface Token {
    readonly value: string;
    /** True when the whole token came from quoted text: literal data, never a command word. */
    readonly quoted: boolean;
}
/**
 * Split shell text into command segments of tokens. Unquoted separators start a
 * segment; inside double quotes only a command substitution can, because that is
 * the one construct there that still runs a command. Single quotes are literal.
 */
export declare function shellSegments(text: string): Token[][];
/** Every authority action the shell text would run, in command order. */
export declare function authorityActions(text: string): AuthorityAction[];
/**
 * A refusal for a Sidekick shell command that publishes or rewrites published
 * state without the Lead's grant; undefined when every action it runs is granted
 * or the command is ordinary work.
 */
export declare function workerAuthorityProblem(text: string, granted?: readonly string[]): string | undefined;
export {};
