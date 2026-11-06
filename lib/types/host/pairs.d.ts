import type { SqliteFusionStore } from '../task/sqlite-store.js';
import type { PairChoice, SettingsCatalog } from './settings.js';
/**
 * One saved combo: the model id the native menu advertises, the label beside
 * it, and the pair that id freezes. The id is the durable identity — a session
 * that selected it keeps its own frozen copy — so renaming never moves a combo.
 */
export interface PairEntry {
    readonly id: string;
    readonly name: string;
    readonly pair: PairChoice;
}
/** The saved combos, in menu order. `auto` is the historical first combo. */
export interface PairsSnapshot {
    readonly revision: number;
    readonly pairs: readonly PairEntry[];
    /** True when these came from a pre-combo `settings:profile` document. */
    readonly migrated: boolean;
}
/** Where the combo list lives; `settings:profile` stays readable for migration. */
export declare const PAIRS_DOCUMENT = "settings:pairs";
/** Every menu entry costs one row in the native picker, so the list stays short. */
export declare const MAX_PAIRS = 6;
export declare const MAX_PAIR_NAME = 40;
/** The migrated first combo keeps the label the historical entry had. */
export declare const DEFAULT_PAIR_NAME = "\u81EA\u52A8";
export declare const profileIdOf: (model: string) => string;
/** The combo a frozen profile belongs to, or undefined for a non-combo profile. */
export declare function modelOfProfileId(id: string): string | undefined;
/** A pre-combo profile document as the choice it was saved from. */
export declare function choiceFromStoredProfile(value: unknown): PairChoice | undefined;
/** The saved combos; a pre-combo installation migrates to one `auto` combo on read. */
export declare function readPairs(store: SqliteFusionStore): PairsSnapshot;
export declare function pairName(value: unknown, fallback: string): string;
/**
 * Validate the list a settings action proposes. Ids are assigned here, never by
 * the client, so a stale tab cannot name a combo that is already frozen
 * elsewhere; reordering only moves the menu rows.
 */
export declare function validatePairs(value: unknown, catalog: SettingsCatalog, existing: readonly PairEntry[]): PairEntry[];
export declare function pairsDocument(pairs: readonly PairEntry[]): Record<string, unknown>;
/**
 * Persist the list under one compare-and-swap revision. The first combo is
 * mirrored into the pre-combo `settings:profile` document so an older tab (or a
 * downgrade) still finds the pair it knows about.
 */
export declare function writePairs(store: SqliteFusionStore, expectedRevision: number, pairs: readonly PairEntry[]): number;
