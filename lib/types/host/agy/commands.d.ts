import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { PluginConfig } from './types.js';
import type { AuthHelper } from './auth.js';
import type { ModelCatalog } from './models.js';
import type { SessionStore } from './sessions.js';
import type { AccountPoolManager } from './pool.js';
import type { PoolAuthFlow } from './pool-auth.js';
import type { QuotaService } from './quota.js';
export interface CommandDeps {
    cfg: () => PluginConfig;
    bin: () => string | null;
    version: () => string | null;
    auth: () => AuthHelper | null;
    catalog: () => ModelCatalog;
    store: () => SessionStore;
    pool?: () => AccountPoolManager;
    poolAuth?: () => PoolAuthFlow;
    quota?: () => QuotaService;
    lastRun: () => {
        processOk: boolean;
        processCode: string;
        toolErrors: readonly string[];
        durationMs: number;
        model: string;
        tokenSpeed?: {
            lastTps: number | null;
            avgTps: number | null;
            outputTokens: number;
            measuredSteps: number;
            generatingMs: number;
        };
    } | null;
    setOverride: (key: string, value: unknown) => void;
    runDoctor: () => Promise<string>;
    sessions?: () => {
        get(id: unknown): unknown;
    } | undefined;
}
export declare function agyCommandDefinition(deps: CommandDeps): CommandDefinition;
