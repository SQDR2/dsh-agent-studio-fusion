import type { ControlView } from './host/native-model-control.js';
import type { FusionEvent, PhysicalRoute, Role, SandboxMode, TokenMeasurement, UsdDecimal, VerificationLevel } from './contracts.js';
/** Bounded, read-only UI projection. No prompts, tool arguments or credentials. */
export interface FusionStatus {
    schemaVersion: 1;
    sessionId: string;
    selected: boolean;
    /**
     * The combo this session is frozen to, in the model menu's own spelling
     * (`dsh-fusion/<combo>`), while a Fusion task is bound to it.
     *
     * Read-only, and the only virtual route the status carries: the composer's menu names
     * the *physical* route while a turn is pinned, so the UI reads this to name the combo the
     * user actually picked instead. Absent on an unselected session and on older records.
     */
    selection?: {
        provider: string;
        model: string;
    };
    observedAt: string;
    task?: {
        id: string;
        revision: number;
        stage: string;
        detail: string | null;
        /** English copies for an English DSH; optional so older records still read. */
        stageEn?: string;
        detailEn?: string | null;
        attention: boolean;
        verification: VerificationLevel;
        workerId: string | null;
        modelControl?: ControlView;
        models: {
            lead: PhysicalRoute;
            worker: PhysicalRoute;
            compactor: PhysicalRoute | null;
        };
        /**
         * Role-separated sandbox modes, present while Fusion confines the Lead. The
         * composer's own permission control follows the conversation (Lead) session,
         * so the UI shows these instead of the derived preset name.
         */
        permissions?: {
            /**
             * What the Lead's own work is confined to. The session is widened only for the
             * checks Fusion runs itself and for the Lead during a Host-unlocked takeover.
             */
            lead: SandboxMode;
            /** What the Sidekick runs under: the mode the user chose for this conversation. */
            worker: SandboxMode;
            /** The role working right now; null while the task waits. */
            active: Role | null;
        };
        usage: {
            calls: number;
            finalCalls: number;
            provisionalCalls: number;
            unreportedCalls: number;
            compactionCalls: number;
            keepaliveCalls: number;
            foremanCalls?: number;
            /** Known subtotals only; missing request fields never become zero totals. */
            input: UsageSubtotal;
            cacheRead: UsageSubtotal;
            output: UsageSubtotal;
            actualBilledUsd: null;
            upstreamHttpCalls: null;
            /** Where the tokens went: the point of Fusion is that most land on the cheaper Worker. */
            byRole: Record<Role, RoleUsage>;
            byPurpose?: {
                foreman?: RoleUsage;
            };
        };
        /** Checks frozen on the current work order; 0 means the Lead review was the only verification. */
        automatedChecks: number | null;
        /**
         * What this task cost, and what the Sidekick saved against the Lead.
         *
         * `apiEquivalentUsd` is an estimate at list prices, never a bill: DSH reports
         * no per-request billed amount, and subscription routes are not billed per
         * token. `actualBilledUsd` therefore stays null and the UI says so rather than
         * presenting an estimate as a charge.
         */
        cost?: TaskCost;
        requests: {
            id: string;
            role: Role;
            purpose: string;
            provider: string;
            model: string;
            outcome: string;
            authority: 'none' | 'provisional' | 'final';
            startedAt: string;
        }[];
        tools: {
            id: string;
            role: Role;
            name: string;
            state: string;
            failed: boolean;
            startedAt: string;
        }[];
        contexts: {
            role: Role;
            purpose: string;
            inputTokens: number;
            budget: number;
            quality: TokenMeasurement['quality'];
            admitted: boolean;
            checkedAt: string;
        }[];
        pendingApprovals: number;
        unsettledTools: number;
        /** True while a human inspection is required before continue, model switch, or leaving Fusion. */
        recovering?: boolean;
        outcomeUnknown?: boolean;
        /**
         * Bounded plan-review state for the live status component. Carries the verdict, the
         * round, and the finding identifiers and categories the Lead must answer — never the
         * prompt, the candidate order or the model's raw text, so nothing a user should not see
         * can leak through a status poll.
         */
        planReview?: PlanReviewStatus;
    };
}
export interface RoleUsage {
    calls: number;
    input: UsageSubtotal;
    cacheRead: UsageSubtotal;
    output: UsageSubtotal;
}
export interface UsageSubtotal {
    knownTokens: number;
    reportedRequests: number;
    totalRequests: number;
}
/**
 * Cost of one task, in API-equivalent dollars.
 *
 * Every figure is derived from recorded usage rows, so it survives a Host
 * restart and covers historical tasks. The counts below are not decoration: a
 * total that silently omits requests with no rate or no reported usage would
 * read as cheaper than the task really was, so the UI shows the coverage.
 */
export interface TaskCost {
    /** Sum of the requests that could be priced completely. Null when none could. */
    apiEquivalentUsd: UsdDecimal | null;
    /** Always null: DSH exposes no per-request billed amount. */
    actualBilledUsd: null;
    /** The same tokens priced at the Lead's rate. Null when either side is unpriced. */
    leadEquivalentUsd: UsdDecimal | null;
    /** leadEquivalentUsd − apiEquivalentUsd. Negative when the Sidekick is dearer. */
    savedUsd: UsdDecimal | null;
    /** One decimal place, or null when it cannot be computed. */
    savedPercent: string | null;
    /** Requests priced on both sides, which is what the saving covers. */
    basis: number;
    /** Requests that produced a complete total. */
    priced: number;
    /** Requests on a model with no rate; the panel offers to add one. */
    unpriced: number;
    /** Requests where the provider did not report enough usage to price. */
    incomplete: number;
    unknown: number;
    unpricedModels: readonly string[];
    /** When the seeded rates were last checked. */
    checked: string;
}
/** Component-facing plan review state; prompts and raw model output never appear here. */
export interface PlanReviewStatus {
    /** `reviewing` is a request in flight, the rest are the last recorded outcome. */
    status: 'reviewing' | 'ready' | 'concerns' | 'unavailable';
    round: number | null;
    policy?: 'shadow' | 'gate' | 'risk-gated';
    /** Why the reviewer was not available; bounded text, no prompt material. */
    unavailableReason?: string;
    /** Findings the Lead still has to answer, by id and category only. */
    findings?: readonly {
        id: string;
        category: string;
        severity: string;
        message: string;
    }[];
    accepted?: number;
    overridden?: number;
}
export interface PlanReviewMetrics {
    reviews: number;
    concerns: number;
    ready: number;
    unavailable: number;
    overrides: number;
    acceptedDispositions: number;
    /** Worker implementation rounds after the first. Plan review is counted separately. */
    reworkRounds: number;
    /** Times the reviewer ran a second time because the Lead revised the candidate. */
    planReviewRevisions: number;
    /** Accepts recorded over a protocol-invalid binding. Unverified completion is not an error. */
    errorAccepts: number;
}
/**
 * Derives machine-readable plan review metrics from a sequence of task events.
 */
export declare function projectPlanReviewMetrics(events: readonly FusionEvent[]): PlanReviewMetrics;
