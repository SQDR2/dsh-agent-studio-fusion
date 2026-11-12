import type { ManagedAccount } from './pool-types.js';
import type { AccountPoolManager } from './pool.js';
export interface CredentialDoc {
    accessToken?: string;
    refreshToken?: string;
    expiryMs?: number;
}
/** Parse either agy's nested `{token:{…}}` shape or a flat `{access_token}` doc. */
export declare function parseCredentialDoc(raw: string | null | undefined): CredentialDoc | null;
/**
 * Identity anchor for a credential blob. A Google OAuth refresh token is
 * unique per account grant and stays the same across access-token refreshes,
 * so it is the right thing to compare. Falls back to the access token when a
 * refresh token is unavailable.
 */
export declare function credentialFingerprint(raw: string | null | undefined): string | null;
/**
 * True only when both blobs provably belong to the SAME OAuth grant.
 *
 * A refresh token is required on both sides. Falling back to the access token
 * would be unsound here: it rotates on every refresh, so two snapshots of one
 * account would compare unequal and two accounts could compare equal. This
 * predicate gates every destructive decision (refusing to run, writing a token
 * back into an account file, re-asserting the primary), so "cannot prove it"
 * must mean "not the same".
 */
export declare function sameCredentialGrant(a: string | null | undefined, b: string | null | undefined): boolean;
export declare function accountTokenFilePath(account: ManagedAccount, homeDir: string): string;
/**
 * FIFO async mutex. One instance guards the single Windows credential slot;
 * holding it across an entire agy run is what makes the handoff safe.
 *
 * The original implementation chained promises (`tail.then(gate)`), which is
 * FIFO but structurally unable to remove a waiter: a turn abandoned or aborted
 * while queued stayed in the chain forever, and if its gate was never resolved
 * every later waiter wedged with it (the 2026-10-16 cardboard-empire zombie
 * turn: queued 30+ minutes past the slot's release, immune to Stop, because
 * nothing observed the wait). This rewrite keeps an explicit queue so a
 * cancelled or timed-out waiter is REMOVED and the next waiter is woken in its
 * place, and the wait is guarded by a short poll that re-checks liveness — a
 * lost wakeup can no longer park a turn silently.
 */
export declare class AsyncMutex {
    private holders;
    private readonly queue;
    /** Number of holders plus waiters; 0 means the mutex is free. */
    get pending(): number;
    /** Waiters currently queued behind the holder(s). */
    get waiting(): number;
    /**
     * Acquire the mutex.
     *
     * @param opts.signal  cancel the wait (the waiter is removed and the next
     *   one is woken); rejects with `AbortedWaitError`
     * @param opts.timeoutMs  bound the wait; rejects with `WaitTimeoutError`
     * @param opts.pollMs  liveness self-check interval while queued (0 = off).
     *   The poll re-checks `shouldProceed` — a hook that lets the caller verify
     *   the wait is still legitimate (e.g. the queue actually advanced). If it
     *   returns true while the mutex appears free, the waiter takes the mutex
     *   directly, healing a lost wakeup within one poll interval instead of
     *   hanging forever.
     */
    acquire(opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        pollMs?: number;
        /** Liveness hook consulted by the poll: true = the wait is still wanted. */
        shouldProceed?: () => boolean;
    }): Promise<() => void>;
    private releaseOne;
}
/** The caller's abort signal fired while queued on the mutex. */
export declare class AbortedWaitError extends Error {
    constructor(message: string);
}
/** The bounded wait elapsed before the mutex became available. */
export declare class WaitTimeoutError extends Error {
    constructor(message: string);
}
export declare const credentialSlotMutex: AsyncMutex;
/**
 * Detect whether an external process by PID is currently running.
 * Uses process.kill(pid, 0) which tests for process existence without sending a signal.
 * - Returns true if the process exists (including EPERM when owned by another user).
 * - Returns false if ESRCH (process does not exist / exited), or if the PID is invalid.
 */
export declare function isProcessAlive(pid: number | undefined | null): boolean;
export declare const SLOT_LOCK_NAME = ".credential-slot.lock";
export declare const SLOT_LOCK_STALE_MS = 45000;
export declare function slotLockFilePath(baseDir: string): string;
export interface SlotLockData {
    pid: number;
    acquiredAt: number;
    holder?: string;
}
/**
 * Acquire a cross-process lock for the Windows credential slot.
 * Inspects any existing lock's PID via `process.kill(pid, 0)`.
 * If the recorded holder process has crashed/exited, the dead lock is reclaimed
 * immediately instead of stalling for timeout.
 */
export declare function acquireCrossProcessSlotLock(baseDir: string, options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
    log?: (msg: string) => void;
    holder?: string;
}): Promise<() => void>;
/**
 * The platform-specific operations the slot manager needs. Injectable so the
 * handoff guards can be tested without touching the real Windows Credential
 * Manager.
 */
export interface SlotIo {
    platform: NodeJS.Platform;
    readSlot(): string | null;
    writeSlot(raw: string): boolean;
    identify(raw: string | null | undefined, proxyUrl?: string): Promise<string | undefined>;
}
export declare function defaultSlotIo(): SlotIo;
export interface PrimaryCredential {
    raw: string;
    email?: string;
    savedAt: number;
}
export declare function primaryStorePath(baseDir: string): string;
export declare function readPrimaryCredential(baseDir?: string): PrimaryCredential | null;
export declare function writePrimaryCredential(cred: PrimaryCredential, baseDir?: string): boolean;
/** Resolve the Google email a credential blob belongs to (refresh if needed). */
export declare function identifyCredential(raw: string | null | undefined, proxyUrl?: string): Promise<string | undefined>;
export interface ResolveOptions {
    baseDir?: string;
    homeDir?: string;
    proxyUrl?: string;
    log?: (message: string) => void;
    io?: Partial<SlotIo>;
    /**
     * Cancels a queued wait for the slot (Stop propagation for the dispatch
     * phase). Only consulted by acquireCredentialSlot.
     */
    signal?: AbortSignal;
    /**
     * Bounds the queued wait for the slot in ms; 0/undefined = wait
     * indefinitely. Only consulted by acquireCredentialSlot.
     */
    dispatchTimeoutMs?: number;
    /**
     * Same-account fast path (default true): a run whose credential is already
     * in the slot starts immediately without the mutex, so multiple sessions on
     * one account run in parallel. Only identity switches serialize. false
     * restores full-run exclusivity.
     */
    parallel?: boolean;
    /**
     * Re-derive the primary credential from live sources instead of trusting the
     * durable store. Used by the repair tool when the store itself may hold a
     * degraded (refresh-token-less) document.
     */
    force?: boolean;
}
/**
 * Produce a primary credential we can PROVE belongs to the primary account.
 *
 * Order of trust:
 *   1. the durable store (written only from verified-primary sources)
 *   2. the primary's own on-disk token file
 *   3. the live credential slot
 * Candidates 2 and 3 are adopted only after a successful Google identity probe
 * that matches the pool's recorded primary email.
 *
 * Returns null when nothing can be proven — callers must then refuse to swap
 * the slot rather than guess.
 */
export declare function resolvePrimaryCredential(pool: AccountPoolManager | undefined, options?: ResolveOptions): Promise<PrimaryCredential | null>;
export interface SlotLease {
    release(): void;
    /** Identity the slot was verified to hold while this lease was active. */
    identity?: string;
}
export declare class SlotUnavailableError extends Error {
    constructor(message: string);
}
/** Live same-identity run count — exported for diagnostics. */
export declare function fastPathRunCount(): number;
/** Default ceiling for holding the slot while waiting for the first event. */
export declare const SLOT_HANDOFF_TIMEOUT_MS = 45000;
export interface SlotHandoff {
    /** The run produced its first event: agy has read the credential. */
    onFirstEvent(): void;
    /** The run ended (or was abandoned) before the first event. */
    dispose(): void;
    /** True once the lease was handed back. */
    released(): boolean;
    /** True when the timeout (not the first event) triggered the hand-off. */
    timedOut(): boolean;
}
/**
 * Arrange for a credential-slot lease to be released after the startup read.
 *
 * Correctness rests on the caller's spawn ordering, which does not change: the
 * identity is installed UNDER the mutex immediately before the spawn, so
 * whatever a later switcher does cannot affect a run that is already past its
 * read. The residual exposure is a mid-run 401 forcing a re-auth (agy would
 * then read whatever identity is installed at that moment); the hand-off logs
 * when it fires so that case is diagnosable instead of silent.
 */
export declare function armSlotHandoff(opts: {
    release: () => void;
    timeoutMs?: number;
    log?: (msg: string) => void;
}): SlotHandoff;
/** True while a run is waiting for (or performing) a slot identity switch. */
export declare function isSlotSwitchPending(): boolean;
/**
 * Take ownership of the credential slot for a run and arrange its guaranteed
 * restoration.
 *
 * Non-Windows platforms have no shared slot (per-account Keychain isolation
 * works), so this is a no-op there.
 *
 * Same-identity runs take a FAST PATH: when the slot provably holds THIS
 * account's credential and no switch is pending, the run starts IMMEDIATELY
 * without the mutex, so multiple sessions on one account run truly in parallel
 * (agy is a stateless CLI and handles concurrent processes natively). For a
 * secondary account the first run performs the handoff and later runs on the
 * same grant join it — including runs that were already QUEUED for the slot,
 * which poll and join as soon as their own grant is installed. The last holder
 * restores the primary. Only identity SWITCHES serialize.
 *
 * @param options.signal  cancels the wait for the slot — without it a turn
 *   queued behind another session's long run ignored Stop entirely (the
 *   cardboard-empire zombie turn, 2026-10-16).
 * @param options.dispatchTimeoutMs  bounds the wait; 0/undefined waits
 *   indefinitely (the wait stays observable and cancellable either way).
 * @param options.parallel  same-account fast path (default true). false
 *   restores full-run exclusivity.
 * @throws SlotUnavailableError when the slot cannot be handed over safely.
 *   The caller must abort the run instead of silently signing in as the wrong
 *   account (which would spend that account's quota).
 * @throws AbortedWaitError when the signal aborted while queued.
 * @throws WaitTimeoutError when the bounded wait elapsed.
 */
export declare function acquireCredentialSlot(account: ManagedAccount | undefined, pool: AccountPoolManager | undefined, options?: ResolveOptions): Promise<SlotLease | undefined>;
export interface DuplicateIdentityReport {
    fingerprint: string;
    locations: string[];
}
/**
 * Detect several accounts sharing one credential identity — the signature of
 * the historical slot-corruption bug. Read-only.
 */
export declare function findDuplicateCredentialIdentities(accounts: readonly ManagedAccount[], homeDir: string): DuplicateIdentityReport[];
