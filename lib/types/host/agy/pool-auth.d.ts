import type { AccountPoolManager } from './pool.js';
import type { QuotaService } from './quota.js';
export type PoolAuthPhase = 'idle' | 'waiting' | 'exchanging' | 'done' | 'failed';
export type PoolAuthStatusCode = 'browser_manual' | 'callback_failed' | 'no_active_flow' | 'invalid_code' | 'invalid_state' | 'exchange_failed' | 'primary_activated' | 'account_activated' | 'missing_code' | 'request_failed';
export interface PoolAuthStatus {
    phase: PoolAuthPhase;
    stagingId?: string;
    alias?: string;
    url?: string;
    /** 'auto' = loopback listener live; 'manual' = paste the code/URL back. */
    mode?: 'auto' | 'manual';
    browserOpened?: boolean;
    /** Stable, locale-neutral user-facing state. Raw diagnostic details never leave the host. */
    code?: PoolAuthStatusCode;
}
export interface PoolAuthFlowDeps {
    /** Injectable for tests; defaults to the OS browser open. */
    openBrowser?: (url: string) => Promise<boolean>;
}
export declare class PoolAuthFlow {
    private readonly pool;
    private readonly quota;
    private readonly log;
    private flow;
    private statusValue;
    private doneResetTimer;
    private readonly open;
    constructor(pool: AccountPoolManager, quota: QuotaService, log?: (msg: string) => void, deps?: PoolAuthFlowDeps);
    status(): PoolAuthStatus;
    private setStatus;
    /**
     * Shared starter: PKCE + loopback listener + server-side browser open.
     * Never reports success without a URL; bind failure degrades to manual
     * paste mode instead of pretending the browser opened.
     */
    private startFlow;
    /** Begin adding a pool account (isolated staging HOME). */
    begin(alias?: string, proxyUrl?: string): Promise<PoolAuthStatus & {
        ok: boolean;
        dir?: string;
    }>;
    /**
     * Begin logging in the PRIMARY account (system HOME, no staging slot):
     * same browser flow, tokens land in ~/.gemini so the real agy stays signed in.
     */
    beginPrimary(proxyUrl?: string): Promise<PoolAuthStatus & {
        ok: boolean;
        dir?: string;
    }>;
    /** Manual paste fallback: accepts a bare code or the full redirect URL. */
    submitCode(input: string): Promise<PoolAuthStatus & {
        ok: boolean;
    }>;
    /**
     * Settle the ACTIVE flow with an authorization code.
     *
     * `owner` names the flow the code belongs to. Without it, a STALE flow's
     * late callback (its `exchangeCode` still in flight while the user cancelled
     * and began flow B) settled against `this.flow` — flow B — and either killed
     * the new flow with `invalid_state` (deleting B's staging dir) or, worse,
     * wrote flow A's token file into the freshly cleaned A dir and committed a
     * ghost account. The identity check makes a stale settlement a no-op.
     */
    private finishWithCode;
    private fail;
    cancel(): Promise<PoolAuthStatus & {
        ok: boolean;
    }>;
    private abortActive;
}
