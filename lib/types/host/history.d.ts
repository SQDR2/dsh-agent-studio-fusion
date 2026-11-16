import type { SqliteFusionStore } from '../task/sqlite-store.js';
import type { TaskState } from '../task/state.js';
import type { NativeUsageRecord } from './native-usage.js';
import { type Count } from '../usage/ledger.js';
export interface TaskPlanReviewSummary {
    status: 'ready' | 'concerns' | 'unavailable';
    round: number;
    policy?: 'shadow' | 'gate' | 'risk-gated';
    /** Present for an unavailable review so the history row can say why it did not happen. */
    unavailableReason?: string;
    /**
     * Foreman tokens, cost and time for this task, kept out of the Lead/Sidekick columns.
     *
     * `costUsd` is a subtotal over the calls that could be priced, and the counts next to it say
     * how much of the bill it covers: `priced + unpriced + incomplete + unknown` describes every
     * call. Showing a subtotal as if it were the total understates the reviewer's cost, which is
     * exactly the number a decision to keep or drop the reviewer depends on.
     */
    foreman?: {
        calls: number;
        input: number;
        inputReported: number;
        output: number;
        outputReported: number;
        durationMs: number;
        costUsd: string | null;
        priced: number;
        unpriced: number;
        incomplete: number;
        unknown: number;
    };
    /** Findings the reviewer raised, each with the Lead's recorded answer when there is one. */
    findings?: readonly {
        id: string;
        category: string;
        severity: string;
        message: string;
        disposition?: {
            action: 'accepted' | 'overridden';
            note: string;
        };
    }[];
    dispositionsCount?: {
        accepted: number;
        overridden: number;
    };
}
export interface TaskSummary {
    id: string;
    sessionId: string;
    seq: number;
    createdAt: string;
    updatedAt: string;
    title: string;
    phase: string;
    verification: string;
    mode: string;
    planReview?: TaskPlanReviewSummary;
}
export declare function taskSummary(state: TaskState, createdAt: string, updatedAt: string): TaskSummary;
export interface UsageSummary {
    id: string;
    taskId: string;
    role: string;
    provider: string;
    model: string;
    purpose: string;
    startedAt: string;
    outcome: string;
    authority: 'none' | 'provisional' | 'final';
    input: Count;
    output: Count;
    reasoning: Count;
    totalOutput: Count;
    cacheRead: Count;
}
export declare function usageSummary(row: NativeUsageRecord): UsageSummary;
/** Once at plugin startup; GET never writes, starts agents, or scans full task/usage snapshots. */
export declare function backfillHistory(store: SqliteFusionStore): void;
export interface HistoryTotals {
    calls: number;
    final: number;
    provisional: number;
    unreported: number;
    foremanCalls?: number;
    input: {
        known: number;
        reported: number;
    };
    output: {
        known: number;
        reported: number;
    };
    reasoning: {
        known: number;
        reported: number;
    };
    totalOutput: {
        known: number;
        reported: number;
    };
    cacheRead: {
        known: number;
        reported: number;
    };
}
/** How often the Host unlocked Lead takeover (enforced-v3), by reason. */
export interface TakeoverTotals {
    total: number;
    tasks: number;
    reasons: Record<string, number>;
}
/** Money for one task row or for the whole page. */
export interface CostTotals {
    /** API-equivalent estimate over the requests that could be priced. */
    apiEquivalentUsd: string;
    /** Always null: no per-request billed amount is available. */
    actualBilledUsd: null;
    leadEquivalentUsd: string | null;
    savedUsd: string | null;
    savedPercent: string | null;
    basis: number;
    priced: number;
    unpriced: number;
    incomplete: number;
    unknown: number;
}
export interface HistoryView {
    observedAt: string;
    totalTasks: number;
    tasks: (TaskSummary & {
        usage: HistoryTotals;
        takeovers: number;
        cost?: CostTotals;
    })[];
    nextCursor: string | null;
    takeovers: TakeoverTotals;
    totals: HistoryTotals;
    groups: ({
        role: string;
        provider: string;
        model: string;
        purpose: string;
    } & HistoryTotals)[];
    /** Absent from a Host that predates cost reporting; the panel then shows no money. */
    cost?: CostTotals;
    actualBilledUsd: null;
    savingsPercent: string | null;
    upstreamHttpCalls: null;
}
export declare function readHistory(store: SqliteFusionStore, cursor?: string, limit?: number): HistoryView;
