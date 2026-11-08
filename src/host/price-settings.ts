import type { SqliteFusionStore } from '../task/sqlite-store.js'
import { readPriceOverrides, type PriceOverrides } from '../usage/price-cards.js'

/** Where the user's per-model rate corrections live. */
export const PRICE_OVERRIDES_DOCUMENT = 'settings:price-cards'

/** The saved overrides; an unreadable document reads as "no overrides", never a crash. */
export function readPriceSettings(store: SqliteFusionStore): PriceOverrides {
  const row = store.readDocument(PRICE_OVERRIDES_DOCUMENT)
  if (!row) return {}
  return readPriceOverrides(row.value)
}

/**
 * Persist the overrides under one compare-and-swap revision.
 *
 * A malformed rate is rejected here rather than stored: the panel shows the
 * resulting cost, and a rate the pricer silently ignores would make the number
 * disagree with what the user typed.
 */
export function writePriceSettings(store: SqliteFusionStore, expectedRevision: number, value: unknown): number {
  const row = store.readDocument(PRICE_OVERRIDES_DOCUMENT)
  const current = row?.revision ?? 0
  if (current !== expectedRevision) throw new Error('价目表已变化，请刷新后再保存')
  const parsed = readPriceOverrides(value)
  return store.writeDocument(PRICE_OVERRIDES_DOCUMENT, current, parsed)
}
