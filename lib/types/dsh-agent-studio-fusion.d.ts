import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AcpConfig } from './host/acp/types.js';
export * from './index.js';
export declare const name = "dsh-agent-studio-fusion";
export declare const inject: string[];
export interface Config {
    profilePath?: string;
    authorizationPath?: string;
    databasePath?: string;
    workerTools?: string[];
    acp?: AcpConfig;
    /**
     * The built-in Antigravity (agy CLI) side: the `antigravity` provider route, the
     * `/agy` command family, `agy_ask` / `agy_tool`, the `/plugins/agy-worker/*` HTTP
     * surface the console polls, the account pool and every related timer.
     *
     * The block is the layered config the standalone `dsh-agy-worker` read from its
     * own cordis entry (`enabled`, `agyBin`, `permissionMode`, …), so an existing
     * installation moves its entry config here verbatim. `DSH_AGY_*` env vars and
     * the runtime overrides file still win over it. Absent, or `enabled: false`,
     * installs nothing.
     */
    agy?: Record<string, unknown>;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): Promise<void>;
