import type { UsdDecimal } from '../contracts.js';
import { projectLedger, restoreLedger } from './ledger.js';
import type { UsageLedgerV2 } from './ledger.js';
import { type PriceRates } from './pricing.js';
import { type ModelPrice, type PriceOverrides } from './price-cards.js';
/**
 * A request's API-equivalent cost, with the reason it could not be computed.
 *
 * `quoteLedger` already refuses to produce a total from incomplete buckets, which
 * is the right default: a missing cache-read count must not be silently priced as
 * zero. The extra `unpriced` state here distinguishes "we have no rate for this
 * model" from "the provider did not report enough usage", because the first is
 * fixable by the user (add a rate) and the second is not.
 */
export type RequestCostStatus = 'complete' | 'incomplete' | 'unknown' | 'unpriced';
export interface RequestCost {
    status: RequestCostStatus;
    /** Complete API-equivalent total only; never a partial stand-in. */
    totalUsd: UsdDecimal | null;
    /** Lower bound from the buckets that could be priced. Not a total. */
    estimateUsd: UsdDecimal | null;
    /** Why this request is not `complete`; empty when it is. */
    missing: readonly string[];
}
/** The `PriceRates` shape `quoteLedger` takes, from one model's card. */
export declare function ratesFromCard(card: ModelPrice | undefined): PriceRates | undefined;
/** Price one recorded request. */
export declare function costOfLedger(ledger: UsageLedgerV2, overrides?: PriceOverrides): RequestCost;
/** Price one recorded request document, tolerating a row this version cannot read. */
export declare function costOfRecord(value: {
    ledger?: unknown;
} | undefined, overrides?: PriceOverrides): RequestCost;
/** Sum only complete totals; report how many requests could not be included. */
export interface CostSum {
    /** Sum of complete request costs. Zero with `complete === 0` means "nothing priced". */
    totalUsd: UsdDecimal;
    complete: number;
    incomplete: number;
    unpriced: number;
    unknown: number;
}
export declare function sumCosts(costs: readonly RequestCost[]): CostSum;
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
    actual: CostSum;
    /** The same tokens priced at the Lead's rate. */
    leadEquivalentUsd: UsdDecimal | null;
    savedUsd: UsdDecimal | null;
    /** Percentage saved, as a decimal string with one fraction digit; null when it cannot be computed. */
    savedPercent: string | null;
    /** Requests included in both sides of the comparison. */
    basis: number;
}
export interface SavingsInput {
    role: 'lead' | 'worker';
    provider: string;
    model: string;
    ledger: UsageLedgerV2;
}
/**
 * Compute the Lead-relative saving. `leadRoute` is the Lead of the same task, so
 * a Sidekick request is repriced at what the Lead would have charged for it.
 */
export declare function computeSavings(requests: readonly SavingsInput[], leadRoute: {
    provider: string;
    model: string;
}, overrides?: PriceOverrides): Savings;
export { projectLedger, restoreLedger };
