import { type AccountPoolData, type FamilyQuotaInfo, type ManagedAccount, type ModelFamily } from './pool-types.js';
/**
 * Proactive rotation thresholds: an account at or below these remaining
 * fractions is benched until its reset instead of being served
 * (isAccountEligible / updateAccountQuotas / getEarliestAvailableCountdown).
 *
 * The old 2%/1% values only benched an account AFTER it had already died:
 * 2026-10-17 01:42 — the primary sat at 4.07% (above the old gate), so the
 * sticky affinity kept every session pinned to it while three parallel turns
 * slammed into the wall together and stalled in agy-internal retries, with
 * q98 idle at 100%. Benching at 10%/5% rotates while the successor still has
 * runway; the benched account comes back at its own reset.
 */
export declare const LOW_QUOTA_5H = 0.1;
export declare const LOW_QUOTA_WEEKLY = 0.05;
/**
 * `$DSH_HOME/agy-accounts` — the documented path (see docs/MIGRATION-AGY.md for
 * the one-time copy from an upstream `DSH_STATE_DIR` installation). Never moved
 * automatically.
 */
export declare function defaultPoolDir(): string;
export declare class AccountPoolManager {
    private data;
    private readonly baseDir;
    private readonly file;
    /**
     * Account ids this process has seen (loaded from disk + created here). On
     * persist, disk ids OUTSIDE this set were added by another host process and
     * are preserved instead of being clobbered (same merge contract as
     * sessions.json: web + headless share this file).
     */
    private readonly knownIds;
    /**
     * Consecutive non-authoritative auth failures per account id (noteAuthFailure).
     * Deliberately in-memory: losing the streak on restart only costs one extra
     * confirmation round, while persisting it could quarantine an account for a
     * blip that healed while the process was down.
     */
    private readonly authStrikes;
    /** Serialized snapshot of the last successful persist/load; skips no-op writes. */
    private persistedJson;
    constructor(baseDir?: string);
    /**
     * Directory holding `pool.json` and the durable primary credential. Exposed
     * so credential handling is anchored on the pool actually in use instead of
     * a hidden process-global path (which made tests write to the real pool).
     */
    get dir(): string;
    private load;
    private persist;
    /**
     * Bootstraps the primary account on first start.
     *
     * The primary account rides the REAL system HOME with no directory
     * isolation: agy 1.1.15+ persists credentials in the macOS Keychain
     * ("Antigravity Safe Storage"), not in a ~/.gemini token file, so copying
     * files cannot migrate sign-in state. Injecting HOME would log the
     * primary account out of agy entirely (observed: "Please sign in").
     * Only SECONDARY pool accounts get isolated HOME directories, created
     * and signed in via /agy add-account.
     */
    private bootstrapDefaultAccount;
    /**
     * Migrates pool files created before Keychain-aware primaries: an
     * acc_primary that carries an isolated dir (and likely a broken token
     * copy) is converted back to the system HOME so agy stays signed in.
     * The stale directory is left untouched (never deletes user data).
     */
    private normalizeLegacyPrimary;
    getPoolData(defaultProxy?: string): Readonly<AccountPoolData>;
    getAccounts(): readonly ManagedAccount[];
    getAccount(id: string): ManagedAccount | undefined;
    /**
     * Create an isolated staging directory for an unverified account login attempt.
     */
    createStagingSlot(): {
        id: string;
        dir: string;
    };
    /**
     * Commit a successfully authenticated staging account into the pool.
     */
    commitStagingAccount(id: string, dir: string, alias?: string, email?: string, proxyUrl?: string): ManagedAccount;
    cleanupStagingSlot(dir: string): void;
    /**
     * Remove every staging_* directory left behind by interrupted add-account
     * attempts. Staging dirs are never referenced by committed accounts, so
     * sweeping them at boot is always safe. Returns the number removed.
     */
    sweepStaleStaging(): number;
    /**
     * Sweep agy CLI log files older than maxDays (default: 7) across all managed account directories
     * as well as the primary system ~/.gemini/antigravity-cli/log directory.
     */
    sweepOldLogs(maxDays?: number): number;
    /**
     * Create a new isolated account slot and prepare its filesystem home.
     */
    createAccountSlot(alias?: string): ManagedAccount;
    deleteAccount(id: string): boolean;
    setAccountProxy(id: string, proxyUrl?: string): boolean;
    setAccountAlias(id: string, alias: string): boolean;
    setAccountEnabled(id: string, enabled: boolean): boolean;
    /**
     * Record the account a run actually spawned with. The console derives its
     * single "in use" badge from this; exactly one account runs agy at a time.
     */
    markAccountActive(id: string): void;
    /**
     * Manually pin the active slot for one family (console "设为当前使用").
     * The pin survives until the scheduler legitimately rotates away (quota
     * exhaustion / cooldown / auth flag) — getActiveAccountId still enforces
     * eligibility, so pinning an ineligible slot simply does not stick.
     */
    setActiveAccount(id: string, family?: ModelFamily): boolean;
    markAuthRequired(id: string, reason?: string): void;
    /**
     * Confirmation-gated quarantine for auth-classified failures that carry NO
     * authoritative evidence (no invalid_grant / revoked / unauthorized_client).
     *
     * agy prints the same "not signed in" banner whether the login is really
     * dead or its keyring validation merely missed a 10s window on a flaky
     * network, so one banner used to sticky-quarantine healthy accounts — the
     * user then saw a red 需重新登录 and could not even 设为当前使用. A single
     * strike now only rotates the account away for the current retry; the flag
     * hardens into a real quarantine only when the failure repeats with no
     * success in between. Authoritative OAuth paths keep calling
     * markAuthRequired directly and quarantine on first sight.
     *
     * Returns true when the account is now hard-quarantined.
     */
    noteAuthFailure(id: string, reason?: string): boolean;
    /**
     * External re-login detected (agy logout + new login): identity-bound
     * state from the PREVIOUS account (cooldowns, quotas, auth quarantine)
     * must not leak onto the new one. Resets everything email-bound while
     * keeping slot config (alias, dir, proxy, enabled).
     */
    resetAccountIdentity(id: string, newEmail: string): void;
    clearAuthRequired(id: string): void;
    /**
     * Drop an email label that is provably wrong — e.g. an isolated account
     * whose token file was overwritten by another account's credential. The row
     * then shows its user-chosen alias instead of a foreign address.
     */
    clearAccountEmail(id: string): void;
    setPrimaryAccount(id: string): boolean;
    reorderAccounts(ids: string[]): boolean;
    setMode(mode: 'sequential' | 'round-robin'): void;
    /**
     * Check whether an account is eligible to serve requests for the given family.
     */
    isAccountEligible(acc: ManagedAccount, family: ModelFamily, now?: number): boolean;
    /**
     * Returns the currently active and healthy account ID.
     * If the recorded lastActiveAccountId is healthy, returns it;
     * otherwise falls back to selectAccount(family) to advance to the next healthy candidate,
     * or primaryAccountId if all are exhausted.
     */
    getActiveAccountId(family?: ModelFamily): string | undefined;
    /**
     * Next moment this account's quota state refreshes for one family: the
     * sooner of the 5h window reset and the weekly cap reset. NaN when unknown.
     */
    private nextQuotaResetAt;
    /** Cyclic distance from `fromId` (0 = itself), so ties keep pool order. */
    private cyclicDistance;
    /**
     * "Use it or lose it" rotation order.
     * Priority 1: Weekly quota expiring soonest (least remaining time until weeklyResetTime).
     * Priority 2: 5-hour quota expiring soonest (least remaining time until resetTime).
     * Priority 3: Cyclic distance from `fromId` (or pool order).
     */
    private orderByExpiry;
    /**
     * Move the active pointer past `fromId` for one family WITHOUT cooling the
     * account down, and return the account the next run should use. Used when a
     * run produced no output at all (silent timeout): the retry must try another
     * account, but a healthy account should not be punished with a cooldown
     * because the network blipped.
     */
    advanceAccount(fromId: string, family: ModelFamily): string | null;
    updateAccountQuotas(id: string, quotas: Partial<Record<ModelFamily, FamilyQuotaInfo>>, email?: string): void;
    /**
     * Drop one family's quota row.
     *
     * Used when stored numbers provably cannot be attributed to this account —
     * `updateAccountQuotas` only merges, so an untrustworthy row would otherwise
     * survive every refresh.
     */
    clearQuotaFamily(id: string, family: ModelFamily): void;
    /**
     * Records a rate-limit / 429 error and sets cooldown for the requested model family.
     */
    recordFailure(id: string, family: ModelFamily, reason: string, serverResetTime?: string): void;
    /**
     * Records a successful run, clearing failure counter and authRequired flag for the family.
     */
    recordSuccess(id: string, family: ModelFamily): void;
    /** True when this account has reported a dedicated quota group for `family`. */
    hasDedicatedGroup(id: string, family: ModelFamily): boolean;
    /**
     * Remember that `family` has its own quota group on this account.
     * Persists only on an actual change so a steady-state poll stays write-free.
     */
    noteDedicatedGroup(id: string, family: ModelFamily): void;
    /** Forget a family's dedicated group after it stopped being reported. */
    forgetDedicatedGroup(id: string, family: ModelFamily): void;
    clearCooldown(id?: string, family?: ModelFamily): void;
    /**
     * Core scheduling algorithm: Sticky Sequential Drain.
     * Sticks to the current active account until it runs out of quota/rate-limited,
     * then smoothly advances to the next available account in cyclic order.
     */
    selectAccount(family: ModelFamily): ManagedAccount | null;
    /**
     * Get countdown in milliseconds until the earliest account in cooldown resets.
     */
    getEarliestResetCountdown(family: ModelFamily): number | null;
    /**
     * Earliest moment ANY enabled account could serve `family` again: the sooner
     * of a cooldown expiry and a quota-window reset.
     *
     * `getEarliestResetCountdown` only inspects cooldowns, while an account can
     * be excluded by its remaining 5h/weekly fraction (isAccountEligible) — so a
     * fully quota-drained pool reported NO wait at all ("Add an account or wait
     * for reset") even though every account knew exactly when it resets. Signed
     * out and disabled accounts are skipped: no countdown can fix them.
     */
    getEarliestAvailableCountdown(family: ModelFamily): number | null;
}
