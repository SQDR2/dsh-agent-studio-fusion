import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AcpConfig } from './host/acp/types.js';
export * from './index.js';
export declare const name = "dsh-fusion";
export declare const inject: string[];
export interface Config {
    profilePath?: string;
    authorizationPath?: string;
    databasePath?: string;
    workerTools?: string[];
    acp?: AcpConfig;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): Promise<void>;
