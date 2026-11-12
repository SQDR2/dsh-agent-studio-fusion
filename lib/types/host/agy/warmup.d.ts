import { type ManagedAccount, type ModelFamily } from './pool-types.js';
import type { PluginConfig } from './types.js';
import type { AccountPoolManager } from './pool.js';
import { QuotaService } from './quota.js';
/** Canonical model route resolution for upstream Google Cloud Code PA endpoints. */
export declare function toCanonicalWarmupModel(model: string): string;
/** Select target model for a given family honoring user monitored_models preferences. */
export declare function pickWarmupModelForFamily(family: ModelFamily, monitoredModels?: readonly string[]): string;
/**
 * `loadCodeAssist` returns `cloudaicompanionProject` either as a bare string or
 * as an object `{ id }` (the official clients and this repo's own OAuth fixture
 * both show the object form). Normalize both; an unresolved project must stay
 * empty instead of falling back to a shared project id — the backend rejects
 * foreign project ids with 403 "Caller does not have required permission".
 */
export declare function extractWarmupProjectId(data: unknown): string;
export interface WarmupResult {
    accountId: string;
    alias: string;
    email?: string;
    model: string;
    success: boolean;
    status?: number;
    error?: string;
    durationMs: number;
    skipped?: boolean;
    skipReason?: string;
}
export declare class WarmupHistoryStore {
    private history;
    private filePath;
    constructor(filePath?: string);
    load(): void;
    save(): void;
    checkCooldown(key: string, cooldownMs: number, now?: number): boolean;
    record(key: string, now?: number): void;
    pruneOldEntries(now?: number): void;
    clear(): void;
}
export declare class WarmupService {
    private readonly pool;
    private readonly quota;
    private readonly globalProxy;
    private readonly agyVersion;
    private readonly config;
    private readonly log;
    readonly history: WarmupHistoryStore;
    constructor(pool: AccountPoolManager, quota: QuotaService, globalProxy?: () => string, agyVersion?: () => string | null, config?: () => PluginConfig, log?: (msg: string) => void, historyStore?: WarmupHistoryStore);
    private proxyFor;
    /**
     * Fetch cloudaicompanionProject via loadCodeAssist (official Antigravity project resolution).
     */
    fetchProjectId(accessToken: string, proxyUrl?: string): Promise<string>;
    /**
     * Send a minimal probe to upstream v1internal:streamGenerateContent (fallback: generateContent).
     */
    warmupModelDirectly(account: ManagedAccount, modelName: string): Promise<{
        ok: boolean;
        status?: number;
        error?: string;
        durationMs: number;
    }>;
    /**
     * Warm up one account.
     * If options.model is specified, warms up that model directly.
     * Otherwise screens quota families for eligible weekly reset windows or cold-starts.
     */
    warmupAccount(account: ManagedAccount, options?: {
        force?: boolean;
        model?: string;
    }): Promise<WarmupResult[]>;
    /**
     * Warm up all accounts sequentially.
     */
    warmupAllAccounts(options?: {
        force?: boolean;
    }): Promise<WarmupResult[]>;
    /**
     * Scheduled periodic run: checks weekly quotas and triggers reset activation when due.
     */
    runScheduledWarmup(): Promise<WarmupResult[]>;
}
