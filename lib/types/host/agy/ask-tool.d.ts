import type { Catalog } from './models.js';
import type { OneShotDeps } from './oneshot.js';
/** Resolve a user-facing model word against the live catalog. */
export declare function resolveAskModel(input: string, catalog: Catalog, defaultModel: string): string;
export declare function defineAgyAskTool(deps: OneShotDeps & {
    catalog: () => Catalog;
}): import("@deepseek-ai/dsh-tools").ToolDefinition;
