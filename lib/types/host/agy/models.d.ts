import type { FallbackModelDef, PluginConfig } from './types.js';
import type { ManagedAccount } from './pool-types.js';
import type { AccountPoolManager } from './pool.js';
export interface RawModel {
    slug: string;
    label: string;
}
export interface CatalogEntry {
    id: string;
    name: string;
    /** null = fixed-thinking model (no effort flag). */
    efforts: readonly string[] | null;
}
export interface Catalog {
    source: 'discovered' | 'fallback';
    models: readonly CatalogEntry[];
    discoveredAt: number;
    /** Last discovery error, surfaced by /agy models and doctor. */
    lastError?: string;
}
/** Check if a model identifier belongs to the Gemini 4 Argon family. */
export declare function isArgonModel(id: string): boolean;
/**
 * Determine whether a managed account has confirmed access to the Gemini 4 Argon family.
 * Argon is exclusive to paid Pro/Ultra plans and returns a separate quota bucket
 * and/or dedicated model list from agy cli. Free/standard accounts do not have Argon.
 */
export declare function accountHasArgon(acc?: ManagedAccount | null, pool?: AccountPoolManager | null, catalog?: Catalog): boolean;
/** Parse `agy models` stdout: JSON shapes first, then two-column text. */
export declare function parseModelsOutput(stdout: string): RawModel[];
/** Fold Gemini effort variants into base + effort set (spec ADR-10). */
export declare function foldEfforts(raw: readonly RawModel[]): CatalogEntry[];
export declare function buildFallbackCatalog(defs: readonly FallbackModelDef[]): CatalogEntry[];
/**
 * Sanitized (id, name) projection of a catalog: trimmed non-empty ids with
 * first occurrence winning — exactly what listModels serves to DSH. Shared
 * with the settings UI's model-visibility list so the picker and the UI can
 * never disagree about which models exist.
 */
export declare function sanitizeCatalogEntries(models: readonly CatalogEntry[]): {
    entries: Array<{
        id: string;
        name: string;
    }>;
    dropped: string[];
};
export type DiscoverFn = (signal?: AbortSignal, accountId?: string) => Promise<{
    stdout: string;
    stderr: string;
}>;
export declare class ModelCatalog {
    private readonly discover;
    private readonly ttlMs;
    private readonly onUpdate?;
    private current;
    private readonly accountCatalogs;
    private refreshing;
    /**
     * While the catalog is still on the fallback source, re-probe at most once
     * per this interval: `agy models` costs a 30s-capped spawn, and with the
     * user signed out EVERY listModels call (picker open, resolveModel, stream)
     * used to trigger one — a spawn storm that never converged.
     */
    private static readonly FALLBACK_RETRY_MS;
    private lastAttemptAt;
    constructor(discover: DiscoverFn, fallbackDefs: readonly FallbackModelDef[], ttlMs: number, onUpdate?: (() => void) | undefined);
    get(accountId?: string): Catalog;
    hasAccountCatalog(accountId: string): boolean;
    /** Refresh if stale; never throws — failures keep the previous catalog. */
    refreshIfNeeded(accountId?: string): Promise<void>;
    forceRefresh(accountId?: string): Promise<Catalog>;
    /**
     * Refresh one account's catalog, then ALWAYS announce a picker update.
     *
     * `refresh()` only fires onUpdate when the catalog *contents* changed. But
     * switching the active account changes the picker's visible set even when
     * the catalog itself is identical — `listModels()` filters the Argon family
     * by the active account's plan, and it resolves `catalog.get(accountId)`,
     * which must be populated for the newly active account before the picker
     * re-reads. So an account switch must (a) discover that account's catalog and
     * (b) emit the update unconditionally, or the composer's cached model
     * snapshot keeps showing the previous account's models (e.g. no Argon after
     * switching to a Pro/Ultra account).
     */
    forceRefreshAndNotify(accountId?: string): Promise<Catalog>;
    private refresh;
}
export declare function resolveModelSlug(id: string): string;
export declare function findEntry(catalog: Catalog, id: string): CatalogEntry | undefined;
export declare function defaultEffortFor(entry: CatalogEntry, cfg: PluginConfig): string | undefined;
