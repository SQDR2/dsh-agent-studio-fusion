import type { FamilyQuotaInfo, ModelFamily } from './pool-types.js';
/** One window bucket as reported by `agy /usage`. */
export interface AgyUsageBucket {
    id: string;
    name?: string;
    /** "weekly" | "5h" (upstream vocabulary). */
    window: string;
    remainingFraction?: number;
    resetTime?: string;
}
/** One quota group as reported by `agy /usage`. */
export interface AgyUsageGroup {
    name: string;
    description?: string;
    buckets: AgyUsageBucket[];
}
/**
 * Parse `agy -p /usage --output-format stream-json` stdout.
 *
 * Primary shape: one NDJSON line carrying a `command_result` event with
 * `command.name === "usage"`. Fallback: the plain-text table mode
 * (`<group>\t<window label>\t<pct>%\t<reset ISO>`), which the CLI prints when
 * run without `--output-format stream-json`.
 *
 * Returns null when nothing usable was found — callers keep their fallback data.
 */
export declare function parseAgyUsageOutput(stdout: string): AgyUsageGroup[] | null;
/** `<group>\t<label>\t<pct>%\t<reset>` rows; weekly labels carry "week". */
export declare function parseUsageTextTable(text: string): AgyUsageGroup[] | null;
/**
 * Map CLI groups onto pool families.
 *
 * Order matters: the Argon group's description mentions "Gemini quota bucket",
 * so the Argon gate must run before the generic Gemini one or the two groups
 * collapse into `google` and overwrite each other.
 */
export declare function usageGroupsToFamilies(groups: readonly AgyUsageGroup[] | null, now?: number): Partial<Record<ModelFamily, FamilyQuotaInfo>>;
/**
 * Overlay CLI families onto the base ones.
 *
 * The CLI is authoritative for the bucket numbers (it is what the Antigravity
 * UI itself renders) and adds families REST never reports (Argon).
 */
export declare function mergeUsageFamilies(base: Partial<Record<ModelFamily, FamilyQuotaInfo>>, cli: Partial<Record<ModelFamily, FamilyQuotaInfo>> | null): Partial<Record<ModelFamily, FamilyQuotaInfo>>;
/** Spawn one `agy -p /usage` and parse its groups. Never throws, never rejects. */
export declare function readAgyUsage(opts: {
    bin: string;
    env: NodeJS.ProcessEnv;
    timeoutMs?: number;
    signal?: AbortSignal;
    preemptAutoUpdate?: boolean;
}): Promise<AgyUsageGroup[] | null>;
