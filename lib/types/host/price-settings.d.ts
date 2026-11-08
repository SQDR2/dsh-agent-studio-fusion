import type { SqliteFusionStore } from '../task/sqlite-store.js';
import { type PriceOverrides } from '../usage/price-cards.js';
/** Where the user's per-model rate corrections live. */
export declare const PRICE_OVERRIDES_DOCUMENT = "settings:price-cards";
/** The saved overrides; an unreadable document reads as "no overrides", never a crash. */
export declare function readPriceSettings(store: SqliteFusionStore): PriceOverrides;
/**
 * Persist the overrides under one compare-and-swap revision.
 *
 * A malformed rate is rejected here rather than stored: the panel shows the
 * resulting cost, and a rate the pricer silently ignores would make the number
 * disagree with what the user typed.
 */
export declare function writePriceSettings(store: SqliteFusionStore, expectedRevision: number, value: unknown): number;
