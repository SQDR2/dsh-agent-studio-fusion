import { type ChildProcess } from 'node:child_process';
import type { PluginConfig } from './types.js';
/**
 * Console/OEM code page of this process as a TextDecoder label ('utf-8' off
 * Windows). Probed once; the child inherits our console, so its tool output is
 * written in this page.
 */
export declare function consoleOutputEncoding(platform?: string): string;
/**
 * Decode one LINE of child output: UTF-8 first, and when that produces
 * replacement characters re-decode those bytes with the console code page.
 * Lines (not raw chunks) are the unit on purpose - a multi-byte character can
 * straddle a chunk boundary but never a newline, in UTF-8 or the OEM pages.
 */
export declare function decodeConsoleLine(bytes: Buffer, encoding?: string): string;
/** Executable candidates for one PATH entry, per-platform. Exported for tests. */
export declare function binCandidates(dir: string, platform?: string): string[];
/** True when the resolved bin is a Windows cmd shim (needs shell wrapping). */
export declare function isCmdShim(bin: string): boolean;
/** cmd.exe argument quoting (cross-spawn rules). Exported for tests. */
export declare function windowsQuote(arg: string): string;
/**
 * Environment that relocates the agy home directory for account isolation.
 * On Unix, HOME suffices. On Windows, libuv (Node) and Go both resolve the
 * home directory from USERPROFILE / HOMEDRIVE+HOMEPATH and IGNORE $HOME, so
 * omitting them silently breaks account isolation (every account would share
 * the real user profile). GEMINI_CLI_HOME is honored by the agy CLI on all
 * platforms for its .gemini dir.
 */
/**
 * Linux/Unix: env that points D-Bus at a nonexistent, per-account PRIVATE path
 * so agy cannot fall through to the desktop Secret Service (gnome-keyring) and
 * read the primary account's token. The path lives INSIDE the isolated home:
 * a shared world-writable path (e.g. /tmp/…) could be hijacked by another local
 * user binding a fake bus socket there and MITM-ing the Secret Service lookup.
 */
export declare function linuxDbusDisabledEnv(dir: string): {
    DBUS_SESSION_BUS_ADDRESS: string;
};
export declare function isolatedHomeEnv(dir: string): Record<string, string>;
/**
 * Standard proxy env block for one proxy URL. agy is a Go binary and only
 * honors HTTP(S)_PROXY / ALL_PROXY; GUI hosts don't inherit shell proxy
 * env, so the plugin injects this explicitly (global config or per-account).
 * Exported for tests.
 */
export declare function proxyEnvFor(proxyUrl: string | undefined | null): Record<string, string>;
/**
 * macOS: an isolated HOME has no login keychain, so the first keyring write
 * makes the Security framework pop the "create login keychain" password
 * dialog (right system.keychain.create.loginkc) on every token refresh.
 * Provisioning a throwaway per-account keychain under that HOME keeps keyring
 * writes silent. Never modifies the user's global default-keychain.
 * No-op on other platforms or when already provisioned. Never throws.
 * Exported for tests.
 */
export declare function ensureIsolatedKeychain(dir: string, platform?: string, run?: (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => unknown): boolean;
/**
 * Purge any stale locked keychain from an isolated account HOME directory.
 * Keychains from older versions (v0.4.41-v0.4.44) were provisioned with
 * ephemeral random passwords that cannot be unlocked with an empty password,
 * causing repeated modal password dialogs from macOS SecurityAgent.
 * We test whether the keychain settings can be updated silently without prompt.
 * If setting settings fails, the file is un-unlockable or corrupted, so it is
 * unregistered and purged so ensureIsolatedKeychain can cleanly re-provision it.
 */
export declare function purgeStaleIsolatedKeychain(dir: string, platform?: string, run?: (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => unknown): boolean;
/**
 * macOS: Repair hijacked user-level keychain configuration.
 *
 * Versions prior to v0.4.49 set `security default-keychain -s <isolated-kc>`,
 * redirecting the user's desktop session default and login keychain into an
 * account-specific folder under ~/.dsh/agy-accounts/.
 *
 * This function detects if default-keychain, login-keychain, or the search list
 * (`list-keychains -d user`) point to any path containing `agy-accounts` or `.dsh`,
 * and restores them to the user's real login keychain (`~/Library/Keychains/login.keychain-db`).
 */
export declare function repairMacSystemKeychain(userHome?: string, platform?: string, run?: (file: string, args: readonly string[], env?: NodeJS.ProcessEnv) => string): boolean;
/**
 * Open an interactive terminal session inside the given account directory.
 * Supports macOS (Terminal.app via AppleScript), Windows (cmd.exe start),
 * and Linux (xdg-terminal-exec, x-terminal-emulator, gnome-terminal, konsole,
 * xfce4-terminal, alacritty, xterm across distributions).
 * Safe, non-blocking and non-throwing.
 */
export declare function openAccountTerminal(accDir: string, platform?: NodeJS.Platform, run?: (file: string, args: readonly string[], opts?: {
    windowsHide?: boolean;
}) => void): boolean;
export declare const MIN_AGY_VERSION = "1.1.8";
export declare function resolveAgyBin(cfg: PluginConfig): string | null;
export declare function compareVersions(a: string, b: string): number;
export declare function parseVersion(out: string): string | null;
export interface RunOutcome {
    code: number | null;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
    aborted: boolean;
    stdout: string;
    stderrTail: string;
    durationMs: number;
}
export interface RunOptions {
    bin: string;
    args: readonly string[];
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    onLine?: (line: string) => void;
    /** stdin stays writable (auth code injection). */
    keepStdin?: boolean;
    /**
     * Write this payload to stdin and close it (long-prompt transport).
     * Takes precedence over the default immediate stdin close; mutually
     * exclusive with keepStdin auth-code flows.
     */
    stdinPayload?: string;
    /**
     * Let stderr activity re-arm the idle watchdog. Off by default: agy logs
     * dial-retry noise to stderr forever when offline, which used to keep a
     * dead run "active" until the 240m print-timeout. Login flows opt in —
     * a browser login is legitimately silent on stdout for minutes.
     */
    stderrKeepalive?: boolean;
    /**
     * Pre-empt agy's own auto-updater before spawn (issue #49). Default true:
     * agy >= 1.4.2 spawns `--bg-updater`, whose `agy --version` grandchild
     * allocates a visible console window on Windows before any env switch can
     * apply. Refreshing `last_check.timestamp` keeps agy on its 15-minute fast
     * path so that chain never starts (see auto-updater.ts).
     */
    preemptAutoUpdate?: boolean;
}
export interface RunningProcess {
    child: ChildProcess;
    outcome: Promise<RunOutcome>;
    kill(reason: 'timeout' | 'abort'): void;
    /**
     * Re-arm the activity watchdog, optionally on a different idle budget.
     * Long-running tools (maven/compile, issue #33) go silent on stdout while
     * they work — the adapter raises the budget when a tool step is ACTIVE and
     * restores the normal budget when the tool completes.
     */
    noteActivity(budgetMs?: number): void;
}
/**
 * Windows CreateProcess caps the command line at ~32767 chars. Leave headroom
 * for env, cwd, quoting, and the rest of the argv so a long `-p` prompt does
 * not fail with spawn ENAMETOOLONG (issue #14 / #11). Above this, the prompt
 * rides agy `--input-format stream-json` on stdin instead.
 */
export declare const ARGV_PROMPT_LIMIT = 24000;
/** One NDJSON line for agy --input-format stream-json (verified on agy 1.2.x). */
export declare function buildStreamInputLine(prompt: string): string;
/**
 * Remove NUL characters from text destined for a child process.
 *
 * `spawn()` rejects any argv element containing U+0000 with
 * `ERR_INVALID_ARG_VALUE: The argument 'args[N]' must be a string without null
 * bytes`, which aborts the whole turn before agy is even started. NULs reach the
 * assembled prompt through binary tool output (a tool result that quoted a
 * binary file — `.git` objects, packed refs, images, …), so every prompt that
 * can carry tool text passes through here. Other control characters are legal in
 * argv and are left untouched.
 */
export declare function stripNulBytes(text: string): string;
/** Whether the assembled argv (including a trailing `-p <prompt>`) risks ENAMETOOLONG. */
export declare function shouldUsePromptStdin(argsWithPrompt: readonly string[]): boolean;
/**
 * Quiet env for every agy spawn (issue #23).
 *
 * agy.exe itself creates a visible conhost on Windows — especially via its
 * `--bg-updater` auto-update child chain — even when the parent spawn used
 * `windowsHide: true`. Both switches are present in the official binary.
 * Existing values win so operators can opt out (`=0`).
 */
export declare function withAgyQuietEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/**
 * Environment for spawning a script through `process.execPath`.
 *
 * In the packaged desktop host `process.execPath` is the **Electron binary**,
 * not node: without this flag the child would boot a second GUI instance
 * instead of executing the script. Plain node ignores the variable, so the
 * POSIX/test paths are unaffected.
 */
export declare function nodeScriptEnv<T extends object>(env: T): T & {
    ELECTRON_RUN_AS_NODE: string;
};
export declare function startAgyProcess(opts: RunOptions): RunningProcess;
/** Simple one-shot helper for --version / models probes. */
export declare function probeProcess(bin: string, args: readonly string[], timeoutMs?: number, signal?: AbortSignal, env?: NodeJS.ProcessEnv, preemptAutoUpdate?: boolean): Promise<RunOutcome>;
