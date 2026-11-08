/**
 * List prices for the models Fusion pairs, in USD per 1M tokens.
 *
 * Two things this module deliberately does not do:
 *
 * - It does not invent a rate. A model with no entry here has no price card, and
 *   the UI reports "no price" for it instead of a zero that would read as "free".
 * - It does not call the result a bill. `actualBilledUsd` stays null because DSH
 *   exposes no per-request billing amount, and subscription routes (ChatGPT,
 *   GLM Coding, Antigravity) are not billed per token at all. What this table
 *   produces is an **API-equivalent estimate**: what the same tokens would cost
 *   at the provider's published list price.
 *
 * The seeded entries are the rates this project's own benchmark already used and
 * published in `docs/EVIDENCE.md`, so a number shown in the panel can be traced
 * to the same table the measurements were computed with. Users can override any
 * rate from the Fusion panel; an override wins over the seed.
 */
/** The date the seeded rates below were last checked against provider pricing pages. */
export declare const PRICE_CARDS_CHECKED = "2026-09-27";
export interface ModelPrice {
    /** Model id this card applies to (exact, case-insensitive). */
    model: string;
    /** USD per 1M uncached input tokens. */
    input: string;
    /** USD per 1M cached input tokens. */
    cacheRead: string;
    /** USD per 1M output tokens. */
    output: string;
    /** Provider ids this rate is published for; empty means "any route serving this model id". */
    providers?: readonly string[];
}
/**
 * Seeded list prices. Each triple is `[uncached input, cache read, output]` per
 * 1M tokens, matching `benchmark/rebench/plan-r5.json` and `docs/EVIDENCE.md`.
 */
export declare const SEEDED_PRICES: readonly ModelPrice[];
/** A user override saved from the panel; `null` explicitly means "do not price this model". */
export interface PriceOverride {
    input: string;
    cacheRead: string;
    output: string;
}
/** Serialized overrides, keyed by model id. */
export type PriceOverrides = Readonly<Record<string, PriceOverride | null>>;
/** A rate this module can price with: non-negative decimal, at most 12 fraction digits. */
export declare function validRate(value: unknown): value is string;
/**
 * The card for one physical route, or undefined when this model has no published
 * rate here. An override is looked up by model id first, so a user correcting one
 * rate does not have to repeat it per provider.
 */
export declare function priceCardFor(provider: string, model: string, overrides?: PriceOverrides): ModelPrice | undefined;
/** Every model id this installation can price, for the panel's list. */
export declare function pricedModels(overrides?: PriceOverrides): readonly string[];
/**
 * The card for one model id, ignoring which provider serves it.
 *
 * The panel edits a rate per model, not per route, so it must be able to show a
 * card for a model whose provider list it does not know. Pricing a request still
 * goes through {@link priceCardFor}, which does check the provider.
 */
export declare function cardForModel(model: string, overrides?: PriceOverrides): ModelPrice | undefined;
/** Normalize a stored override document; unreadable rows are dropped, not guessed at. */
export declare function readPriceOverrides(raw: unknown): PriceOverrides;
