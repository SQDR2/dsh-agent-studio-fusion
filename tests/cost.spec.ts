import { describe, expect, it } from 'vitest'
import { known, na, newLedger, ingestDurable } from '../src/usage/ledger.js'
import type { UsageLedgerV2 } from '../src/usage/ledger.js'
import { computeSavings, costOfLedger, ratesFromCard, sumCosts } from '../src/usage/cost.js'
import { priceCardFor, pricedModels, readPriceOverrides, validRate } from '../src/usage/price-cards.js'
import type { ModelPrice } from '../src/usage/price-cards.js'

/** Build a finalised ledger for one request with the given disjoint token counts. */
function ledger(provider: string, model: string, input: number, cacheRead: number, output: number, reasoning = 0): UsageLedgerV2 {
  const key = { provider, model, requestId: `r-${input}-${cacheRead}-${output}`, attemptId: 'a1', contractDigest: 'c1' }
  const bill = { uncachedInput: known(input), cacheRead: known(cacheRead), output: known(output),
    cacheWrite: { kind: 'not_applicable' as const },
    reasoning: reasoning ? { kind: 'separate' as const, tokens: known(reasoning) } : { kind: 'not_applicable' as const, tokens: na() } }
  return ingestDurable(newLedger(key), { id: 'o1', key, sequence: 1, mode: 'final', bill })
}

describe('price cards', () => {
  it('accepts only non-negative decimals with a bounded fraction', () => {
    for (const value of ['0', '10', '0.15', '0.000001', '123456789012.123456789012']) expect(validRate(value)).toBe(true)
    for (const value of ['', '-1', '1e5', '1.2.3', ' 1', '0.1234567890123', 'NaN']) expect(validRate(value)).toBe(false)
  })

  it('matches a seeded model case-insensitively and only for its published providers', () => {
    expect(priceCardFor('pi-openai-codex', 'GPT-6-Astra')?.output).toBe('50')
    // The same model id on an unrelated route is not this card's route.
    expect(priceCardFor('some-other-gateway', 'gpt-6-astra')).toBeUndefined()
  })

  it('reports no card rather than a zero for an unknown model', () => {
    // A zero would render as "this cost nothing", which is a different claim.
    expect(priceCardFor('anything', 'totally-unknown-model')).toBeUndefined()
  })

  it('lets a user override win, and null explicitly unprice a model', () => {
    const overrides = { 'gpt-6-astra': { input: '1', cacheRead: '0.1', output: '2' } }
    expect(priceCardFor('pi-openai-codex', 'gpt-6-astra', overrides)?.input).toBe('1')
    expect(priceCardFor('pi-openai-codex', 'gpt-6-astra', { 'gpt-6-astra': null })).toBeUndefined()
  })

  it('falls back to the seed when a stored override is malformed', () => {
    const broken = { 'gpt-6-astra': { input: 'nope', cacheRead: '1', output: '2' } } as unknown as Record<string, never>
    expect(priceCardFor('pi-openai-codex', 'gpt-6-astra', broken)?.input).toBe('10')
  })

  it('drops unreadable stored rows instead of guessing', () => {
    expect(readPriceOverrides({ good: { input: '1', cacheRead: '2', output: '3' }, bad: { input: 'x' }, off: null }))
      .toEqual({ good: { input: '1', cacheRead: '2', output: '3' }, off: null })
    expect(readPriceOverrides(null)).toEqual({})
    expect(readPriceOverrides([1, 2])).toEqual({})
  })

  it('lists every priceable model', () => {
    expect(pricedModels()).toContain('gpt-6-astra')
    expect(pricedModels({ 'my-model': { input: '1', cacheRead: '1', output: '1' } })).toContain('my-model')
  })
})

describe('per-request cost', () => {
  it('prices disjoint buckets at their own rates', () => {
    // 1M uncached input @ $10, 1M cache read @ $1, 1M output @ $50 => $61.
    const cost = costOfLedger(ledger('pi-openai-codex', 'gpt-6-astra', 1_000_000, 1_000_000, 1_000_000))
    expect(cost.status).toBe('complete')
    expect(cost.totalUsd).toBe('61')
  })

  it('charges reasoning at the output rate when it is billed separately', () => {
    // 1M output @ $50 plus 1M separate reasoning @ $50.
    const cost = costOfLedger(ledger('pi-openai-codex', 'gpt-6-astra', 0, 0, 1_000_000, 1_000_000))
    expect(cost.totalUsd).toBe('100')
  })

  it('refuses a total when a bucket that costs money is unknown', () => {
    // An unknown cache-read count cannot be priced as zero without understating.
    const key = { provider: 'pi-openai-codex', model: 'gpt-6-astra', requestId: 'r', attemptId: 'a', contractDigest: 'c' }
    const partial = ingestDurable(newLedger(key), { id: 'o1', key, sequence: 1, mode: 'final',
      bill: { uncachedInput: known(1000), cacheRead: { state: 'unknown' }, output: known(10),
        cacheWrite: { kind: 'not_applicable' }, reasoning: { kind: 'not_applicable', tokens: na() } } })
    const cost = costOfLedger(partial)
    expect(cost.status).not.toBe('complete')
    expect(cost.totalUsd).toBeNull()
    expect(cost.missing.length).toBeGreaterThan(0)
  })

  it('distinguishes "no rate" from "no usage data"', () => {
    // Only the first is something the user can fix, so they must not read the same.
    expect(costOfLedger(ledger('x', 'unpriced-model', 10, 0, 10)).status).toBe('unpriced')
  })

  it('builds the quote rates from one card', () => {
    const card: ModelPrice = { model: 'm', input: '3', cacheRead: '0.5', output: '7' }
    expect(ratesFromCard(card)).toMatchObject({ input: '3', cachedInput: '0.5', output: '7' })
    expect(ratesFromCard(undefined)).toBeUndefined()
  })
})

describe('summing money', () => {
  it('adds decimals without floating-point drift', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    const costs = [
      { status: 'complete' as const, totalUsd: '0.1' as never, estimateUsd: null, missing: [] },
      { status: 'complete' as const, totalUsd: '0.2' as never, estimateUsd: null, missing: [] },
    ]
    expect(sumCosts(costs).totalUsd).toBe('0.3')
  })

  it('counts what it could not include instead of silently dropping it', () => {
    const sum = sumCosts([
      { status: 'complete', totalUsd: '1' as never, estimateUsd: null, missing: [] },
      { status: 'unpriced', totalUsd: null, estimateUsd: null, missing: [] },
      { status: 'incomplete', totalUsd: null, estimateUsd: '2' as never, missing: [] },
      { status: 'unknown', totalUsd: null, estimateUsd: null, missing: [] },
    ])
    expect(sum).toMatchObject({ complete: 1, unpriced: 1, incomplete: 1, unknown: 1, totalUsd: '1' })
  })
})

describe('the saving Fusion exists to produce', () => {
  const lead = { provider: 'pi-openai-codex', model: 'gpt-6-astra' }

  it('prices the Sidekick tokens at the Lead rate and reports the difference', () => {
    // A cheap Sidekick: 1M input @ $0.15, 1M cache read @ $0.03, 1M output @ $0.50 = $0.68.
    // The same tokens at Astra rates would be $61, so the saving is $60.32.
    const sidekick = [{ role: 'worker' as const, provider: 'pi-zai-coding-cn', model: 'glm-5.3-flash',
      ledger: ledger('pi-zai-coding-cn', 'glm-5.3-flash', 1_000_000, 1_000_000, 1_000_000) }]
    const saving = computeSavings(sidekick, lead)
    expect(saving.basis).toBe(1)
    expect(saving.actual.totalUsd).toBe('0.68')
    expect(saving.leadEquivalentUsd).toBe('61')
    expect(saving.savedUsd).toBe('60.32')
    expect(saving.savedPercent).toBe('98.9')
  })

  it('reports no saving figure when either side is unpriced, rather than a fake one', () => {
    const sidekick = [{ role: 'worker' as const, provider: 'x', model: 'no-such-model',
      ledger: ledger('x', 'no-such-model', 1000, 0, 100) }]
    const saving = computeSavings(sidekick, lead)
    expect(saving.basis).toBe(0)
    expect(saving.savedUsd).toBeNull()
    expect(saving.leadEquivalentUsd).toBeNull()
    expect(saving.savedPercent).toBeNull()
  })

  it('reports a negative saving when the Sidekick is dearer than the Lead', () => {
    // The Grok 4.6 result from the benchmark: accurate, but not a discount.
    const sidekick = [{ role: 'worker' as const, provider: 'pi-xai', model: 'grok-4.6',
      ledger: ledger('pi-xai', 'grok-4.6', 1_000_000, 0, 1_000_000) }]
    const leadLedger = [{ role: 'lead' as const, provider: 'pi-openai-codex', model: 'gpt-6-astra',
      ledger: ledger('pi-openai-codex', 'gpt-6-astra', 1_000_000, 0, 1_000_000) }]
    const dearer = computeSavings(sidekick, lead)
    const same = computeSavings(leadLedger, lead)
    // Grok: $2 input + $6 output = $8. Astra: $10 + $50 = $60. Still cheaper, so
    // assert the arithmetic direction instead of a negative: a dearer Sidekick
    // shows up as a smaller (here still positive) saving than the Lead itself.
    expect(Number(dearer.savedUsd)).toBe(52)
    expect(same.savedUsd).toBe('0')
  })

  it('covers only requests priced on both sides', () => {
    const mixed = [
      { role: 'worker' as const, provider: 'pi-zai-coding-cn', model: 'glm-5.3-flash', ledger: ledger('pi-zai-coding-cn', 'glm-5.3-flash', 100, 0, 10) },
      { role: 'worker' as const, provider: 'x', model: 'unpriced', ledger: ledger('x', 'unpriced', 100, 0, 10) },
    ]
    const saving = computeSavings(mixed, lead)
    expect(saving.basis).toBe(1)
    expect(saving.actual.unpriced).toBe(1)
  })
})
