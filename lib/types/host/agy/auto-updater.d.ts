/** agy's auto-updater fast-path window (auto_updater.go). */
export declare const UPDATE_CHECK_FAST_PATH_MS: number;
export interface PreemptFailure {
    path: string;
    error: string;
}
export interface PreemptResult {
    /** Timestamp files whose mtime now marks a fresh update check. */
    touched: string[];
    /** Per-path failures; pre-emption is best-effort and never throws. */
    failures: PreemptFailure[];
}
/**
 * agy's application data directory for a given spawn environment.
 *
 * The plugin isolates pooled accounts by rewriting HOME / USERPROFILE /
 * GEMINI_CLI_HOME / ANTIGRAVITY_APP_DATA_DIR (see `isolatedHomeEnv`), and agy
 * resolves its data dir from exactly those variables — an isolated spawn was
 * verified to write `<home>/.gemini/antigravity-cli/last_check.timestamp`.
 */
export declare function agyAppDataDir(env?: NodeJS.ProcessEnv): string | null;
/**
 * Candidate `last_check.timestamp` locations for one spawn environment.
 *
 * The issue reporter observed `<appData>/updater/last_check.timestamp` on
 * Windows while macOS uses `<appData>/last_check.timestamp`. Refreshing both is
 * cheap and keeps the fix independent of agy's per-platform path choice.
 */
export declare function agyUpdateCheckPaths(env?: NodeJS.ProcessEnv): string[];
/**
 * Refresh agy's update-check timestamp so the next spawn takes the fast path.
 * Best-effort: a read-only or missing profile must never fail a run.
 */
export declare function preemptAgyAutoUpdate(env?: NodeJS.ProcessEnv, now?: number): PreemptResult;
/** Age (ms) of the most recent recorded update check, or null when none exists. */
export declare function agyUpdateCheckAgeMs(env?: NodeJS.ProcessEnv, now?: number): number | null;
/** One-line `/agy doctor` summary of the auto-update suppression state. */
export declare function describeAgyAutoUpdate(env?: NodeJS.ProcessEnv, now?: number): string;
