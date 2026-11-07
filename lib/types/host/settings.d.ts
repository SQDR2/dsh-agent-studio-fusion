import type { PairProfile, PhysicalRoute } from '../contracts.js';
export interface PairChoice {
    lead: PhysicalRoute;
    worker: PhysicalRoute;
    outputTokens?: Partial<Record<'lead' | 'worker', number>>;
    cacheKeepalive?: PairProfile['cacheKeepalive'];
    compactor?: PairProfile['compactor'];
}
export interface SettingsCatalog {
    groups: readonly {
        id: string;
        name: string;
        models: readonly {
            id: string;
            name: string;
            reasoning?: {
                efforts: readonly {
                    id: string;
                    name: string;
                }[];
                defaultEffort?: string;
            };
        }[];
    }[];
}
/** Saved Lead route from a raw settings or profile document, or undefined when unconfigured or pointed at Fusion itself. */
export declare function savedLeadRoute(value: unknown): {
    provider: string;
    model: string;
} | undefined;
/** The roles a saved pair names, in the order the settings page shows them. */
export type PairRole = 'lead' | 'worker' | 'compactor';
/**
 * The routes a saved choice still names that the current catalog no longer
 * offers: a provider that was renamed or removed, or a model that was retired.
 *
 * Reading a saved combo tolerates a stale route so the row stays visible and
 * editable, but saving one does not. Without this, the page can only say that
 * *some* model is gone, which is unusable when the stale route is not the one
 * being edited — the user then cannot tell which combo to fix.
 */
export declare function missingRoutes(value: Partial<PairChoice> | undefined, catalog: SettingsCatalog): {
    role: PairRole;
    route: PhysicalRoute;
}[];
/** Configuration chooses registered physical models; it cannot create adapters. */
export declare function validatePairChoice(value: unknown, catalog: SettingsCatalog, combo?: string): PairChoice;
/** New sessions can opt into this Worker cap. Frozen sessions keep their saved profile. */
export declare const WORKER_IMPLEMENTATION_OUTPUT_TOKENS = 128000;
export declare function profileFromChoice(pair: PairChoice, id?: string): Record<string, unknown>;
/**
 * Product defaults; explicit legacy/benchmark profiles retain their old contract.
 * `id` names the combo; the first one keeps the historical `fusion-auto` so a
 * profile frozen before combos existed keeps its identity.
 */
export declare function modelProfileFromChoice(pair: PairChoice, id?: string): Record<string, unknown>;
/** Keep existing default settings stable; expose explicit larger/smaller limits on reload. */
export declare function choiceFromProfile(profile: PairProfile): PairChoice;
