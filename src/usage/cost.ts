import type { UsdDecimal } from '../contracts.js'
import { UsdDecimal as usd } from '../contracts.js'
import { projectLedger, restoreLedger } from './ledger.js'
import type { UsageLedgerV2 } from './ledger.js'
import { quoteLedger, type PriceRates, type RequestQuote } from './pricing.js'
import { priceCardFor, type ModelPrice, type PriceOverrides } from './price-cards.js'

/**
 * A request's API-equivalent cost, with the reason it could not be computed.
 *
 * `quoteLedger` already refuses to produce a total from incomplete buckets, which
 * is the right default: a missing cache-read count must not be silently priced as
 * zero. The extra `unpriced` state here distinguishes "we have no rate for this
 * model" from "the provider did not report enough usage", because the first is
 * fixable by the user (add a rate) and the second is not.
 */
export type RequestCostStatus = 'complete' | 'incomplete' | 'unknown' | 'unpriced'

export interface RequestCost {
  status: RequestCostStatus
  /** Complete API-equivalent total only; never a partial stand-in. */
  totalUsd: UsdDecimal | null
  /** Lower bound from the buckets that could be priced. Not a total. */
  estimateUsd: UsdDecimal | null
  /** Why this request is not `complete`; empty when it is. */
  missing: readonly string[]
}

const UNPRICED: RequestCost = { status: 'unpriced', totalUsd: null, estimateUsd: null, missing: ['no-price-card'] }

/** The `PriceRates` shape `quoteLedger` takes, from one model's card. */
export function ratesFromCard(card: ModelPrice | undefined): PriceRates | undefined {
  if (!card) return undefined
  return {
    input: card.input,
    cachedInput: card.cacheRead,
    output: card.output,
    // Reasoning billed separately is charged at the output rate. This is not an
    // assumption about the provider: it is the same rule `priceUsage` already
    // applies (`card.reasoningPerMillion ?? card.outputPerMillion`), and every
    // provider in this table publishes reasoning at its output rate or folds it
    // into output. A provider that publishes a distinct rate gets one added here.
    reasoning: card.output,
    cacheWrite: { 'provider-cache-write-rate-unknown': card.input },
  }
}

/** Price one recorded request. */
export function costOfLedger(ledger: UsageLedgerV2, overrides: PriceOverrides = {}): RequestCost {
  const key = ledger.key
  const card = priceCardFor(key.provider, key.model, overrides)
  const rates = ratesFromCard(card)
  if (!rates) return UNPRICED
  const quote: RequestQuote = quoteLedger(ledger, rates)
  if (quote.status === 'complete' && quote.totalUsd !== null) {
    return { status: 'complete', totalUsd: usd(quote.totalUsd), estimateUsd: quote.estimateUsd === null ? null : usd(quote.estimateUsd), missing: [] }
  }
  // `unknown` from quoteLedger means no bill was recoverable at all; `incomplete`
  // means some buckets priced and some did not. Both keep their reasons.
  return { status: quote.status === 'unknown' ? 'unknown' : 'incomplete',
    totalUsd: null, estimateUsd: quote.estimateUsd === null ? null : usd(quote.estimateUsd), missing: quote.missing }
}

/** Price one recorded request document, tolerating a row this version cannot read. */
export function costOfRecord(value: { ledger?: unknown } | undefined, overrides: PriceOverrides = {}): RequestCost {
  if (!value?.ledger) return { status: 'unknown', totalUsd: null, estimateUsd: null, missing: ['no-ledger'] }
  try {
    const cost = costOfLedger(restoreLedger(value.ledger as UsageLedgerV2), overrides)
    // A row whose ledger restores but whose bill is absent is still a real request:
    // report the reason instead of dropping it from the count.
    return cost
  } catch (error) {
    return { status: 'unknown', totalUsd: null, estimateUsd: null, missing: [String(error)] }
  }
}

/** Sum only complete totals; report how many requests could not be included. */
export interface CostSum {
  /** Sum of complete request costs. Zero with `complete === 0` means "nothing priced". */
  totalUsd: UsdDecimal
  complete: number
  incomplete: number
  unpriced: number
  unknown: number
}

const ZERO = '0' as UsdDecimal

/**
 * Add decimal strings without floating point. The totals are money, and
 * `0.1 + 0.2` in binary floating point is exactly the kind of error that makes a
 * savings figure wrong by cents on every row.
 */
function addDecimal(left: string, right: string): string {
  const scale = Math.max(...[left, right].map(value => value.split('.')[1]?.length ?? 0))
  const toUnits = (value: string) => {
    const [whole, frac = ''] = value.split('.')
    return BigInt(whole! + frac.padEnd(scale, '0'))
  }
  const units = toUnits(left) + toUnits(right)
  if (scale === 0) return units.toString()
  const text = units.toString().padStart(scale + 1, '0')
  const whole = text.slice(0, -scale), frac = text.slice(-scale).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

export function sumCosts(costs: readonly RequestCost[]): CostSum {
  let total = ZERO, complete = 0, incomplete = 0, unpriced = 0, unknown = 0
  for (const cost of costs) {
    if (cost.status === 'complete' && cost.totalUsd !== null) { total = addDecimal(total, cost.totalUsd) as UsdDecimal; complete++ }
    else if (cost.status === 'unpriced') unpriced++
    else if (cost.status === 'incomplete') incomplete++
    else unknown++
  }
  return { totalUsd: total, complete, incomplete, unpriced, unknown }
}

/**
 * What Fusion would have cost if the Sidekick's tokens had gone to the Lead
 * instead, and the resulting saving.
 *
 * This is the claim the whole plugin rests on, so it is computed from the same
 * recorded usage rather than asserted: `leadEquivalent` prices every request at
 * the Lead's rate, `actual` prices each at its own role's rate, and the saving is
 * the difference. A request on a route with no card is excluded from both sides,
 * and `basis` says how many requests the figure covers.
 */
export interface Savings {
  actual: CostSum
  /** The same tokens priced at the Lead's rate. */
  leadEquivalentUsd: UsdDecimal | null
  savedUsd: UsdDecimal | null
  /** Percentage saved, as a decimal string with one fraction digit; null when it cannot be computed. */
  savedPercent: string | null
  /** Requests included in both sides of the comparison. */
  basis: number
}

export interface SavingsInput {
  role: 'lead' | 'worker'
  provider: string
  model: string
  ledger: UsageLedgerV2
}

/**
 * Compute the Lead-relative saving. `leadRoute` is the Lead of the same task, so
 * a Sidekick request is repriced at what the Lead would have charged for it.
 */
export function computeSavings(requests: readonly SavingsInput[], leadRoute: { provider: string; model: string },
  overrides: PriceOverrides = {}): Savings {
  const leadCard = priceCardFor(leadRoute.provider, leadRoute.model, overrides)
  const leadRates = ratesFromCard(leadCard)
  const costs: RequestCost[] = []
  let leadTotal: string = ZERO
  let basis = 0
  for (const request of requests) {
    const cost = costOfLedger(request.ledger, overrides)
    costs.push(cost)
    // Both sides must be priced for this request to enter the comparison; a
    // one-sided sum would compare different sets of tokens.
    if (cost.status !== 'complete' || cost.totalUsd === null || !leadRates) continue
    const asLead = quoteLedger(request.ledger, leadRates)
    if (asLead.status !== 'complete' || asLead.totalUsd === null) continue
    leadTotal = addDecimal(leadTotal, asLead.totalUsd)
    basis++
  }
  const actual = sumCosts(costs)
  if (!basis || actual.complete !== basis) {
    return { actual, leadEquivalentUsd: null, savedUsd: null, savedPercent: null, basis }
  }
  const saved = addDecimal(leadTotal, `-${actual.totalUsd}`)
  const percent = ratioPercent(saved, leadTotal)
  return { actual, leadEquivalentUsd: usd(leadTotal), savedUsd: usd(saved), savedPercent: percent, basis }
}

/** One decimal place, computed in integer arithmetic so it never rounds through a float. */
function ratioPercent(part: string, whole: string): string | null {
  const toUnits = (value: string, scale: number) => {
    const negative = value.startsWith('-')
    const [intPart, frac = ''] = (negative ? value.slice(1) : value).split('.')
    const units = BigInt(intPart! + frac.padEnd(scale, '0'))
    return negative ? -units : units
  }
  const scale = Math.max(part.split('.')[1]?.length ?? 0, whole.split('.')[1]?.length ?? 0)
  const numerator = toUnits(part, scale), denominator = toUnits(whole, scale)
  if (denominator === 0n) return null
  // Tenths of a percent: part/whole * 1000, rounded half away from zero.
  const thousandths = numerator * 1000n
  const rounded = thousandths >= 0n ? (thousandths + denominator / 2n) / denominator : (thousandths - denominator / 2n) / denominator
  return `${rounded / 10n}.${(rounded % 10n < 0n ? -(rounded % 10n) : rounded % 10n)}`
}

export { projectLedger, restoreLedger }
