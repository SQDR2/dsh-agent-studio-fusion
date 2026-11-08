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
export const PRICE_CARDS_CHECKED = '2026-09-27'

export interface ModelPrice {
  /** Model id this card applies to (exact, case-insensitive). */
  model: string
  /** USD per 1M uncached input tokens. */
  input: string
  /** USD per 1M cached input tokens. */
  cacheRead: string
  /** USD per 1M output tokens. */
  output: string
  /** Provider ids this rate is published for; empty means "any route serving this model id". */
  providers?: readonly string[]
}

/**
 * Seeded list prices. Each triple is `[uncached input, cache read, output]` per
 * 1M tokens, matching `benchmark/rebench/plan-r5.json` and `docs/EVIDENCE.md`.
 */
export const SEEDED_PRICES: readonly ModelPrice[] = [
  { model: 'gpt-6-astra', input: '10', cacheRead: '1', output: '50', providers: ['pi-openai-codex', 'openai'] },
  { model: 'grok-4.6', input: '2', cacheRead: '0.3', output: '6', providers: ['pi-xai', 'xai'] },
  { model: 'glm-5.3-flash', input: '0.15', cacheRead: '0.03', output: '0.50', providers: ['pi-zai-coding-cn', 'zhipu'] },
  { model: 'glm-5.3', input: '1.40', cacheRead: '0.26', output: '4.40', providers: ['pi-zai-coding-cn', 'zhipu'] },
]

/** A user override saved from the panel; `null` explicitly means "do not price this model". */
export interface PriceOverride {
  input: string
  cacheRead: string
  output: string
}

/** Serialized overrides, keyed by model id. */
export type PriceOverrides = Readonly<Record<string, PriceOverride | null>>

const DECIMAL = /^\d+(?:\.\d{1,12})?$/

/** A rate this module can price with: non-negative decimal, at most 12 fraction digits. */
export function validRate(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL.test(value)
}

/**
 * The card for one physical route, or undefined when this model has no published
 * rate here. An override is looked up by model id first, so a user correcting one
 * rate does not have to repeat it per provider.
 */
export function priceCardFor(provider: string, model: string, overrides: PriceOverrides = {}): ModelPrice | undefined {
  const key = model.trim().toLowerCase()
  if (Object.hasOwn(overrides, key)) {
    const override = overrides[key]
    if (override === null) return undefined
    if (override && validRate(override.input) && validRate(override.cacheRead) && validRate(override.output)) {
      return { model: key, ...override }
    }
    // A malformed override falls through to the seed rather than silently unpricing.
  }
  return SEEDED_PRICES.find(card => card.model.toLowerCase() === key
    && (!card.providers?.length || card.providers.includes(provider)))
}

/** Every model id this installation can price, for the panel's list. */
export function pricedModels(overrides: PriceOverrides = {}): readonly string[] {
  const seeded = SEEDED_PRICES.map(card => card.model)
  const extra = Object.entries(overrides).filter(([, value]) => value !== null).map(([model]) => model)
  return [...new Set([...seeded, ...extra])].sort()
}

/**
 * The card for one model id, ignoring which provider serves it.
 *
 * The panel edits a rate per model, not per route, so it must be able to show a
 * card for a model whose provider list it does not know. Pricing a request still
 * goes through {@link priceCardFor}, which does check the provider.
 */
export function cardForModel(model: string, overrides: PriceOverrides = {}): ModelPrice | undefined {
  const key = model.trim().toLowerCase()
  const override = overrides[key]
  if (override === null) return undefined
  if (override && validRate(override.input) && validRate(override.cacheRead) && validRate(override.output)) {
    return { model: key, ...override }
  }
  return SEEDED_PRICES.find(card => card.model.toLowerCase() === key)
}

/** Normalize a stored override document; unreadable rows are dropped, not guessed at. */
export function readPriceOverrides(raw: unknown): PriceOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, PriceOverride | null> = {}
  for (const [model, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = model.trim().toLowerCase()
    if (!key) continue
    if (value === null) { out[key] = null; continue }
    if (!value || typeof value !== 'object') continue
    const row = value as Record<string, unknown>
    if (validRate(row.input) && validRate(row.cacheRead) && validRate(row.output)) {
      out[key] = { input: row.input, cacheRead: row.cacheRead, output: row.output }
    }
  }
  return out
}
