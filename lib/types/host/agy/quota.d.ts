import { type FamilyQuotaInfo, type ManagedAccount, type ModelFamily } from './pool-types.js';
import type { AccountPoolManager } from './pool.js';
/**
 * When the quota-summary endpoint transiently fails, per-model fallback
 * data carries a SINGLE window (sometimes the weekly one) and no weekly
 * fields. Overwriting a previously COMPLETE family entry with that partial
 * shape dropped weeklyFraction to none and put wrong-window numbers into
 * the 5h row (observed: 5h=100% / reset a week out / weekly missing).
 * Rule: last-known-good complete data always wins over partial fallback.
 */
export declare function mergeFallbackFamilyQuota(prev: FamilyQuotaInfo | undefined, fallback: FamilyQuotaInfo): FamilyQuotaInfo;
/** Minimal shape of the quota groups `retrieveUserQuotaSummary` returns. */
export interface QuotaGroupShape {
    displayName?: string;
    description?: string;
    buckets?: readonly {
        bucketId?: string;
        displayName?: string;
    }[];
}
/**
 * True when any returned group is the dedicated Argon bucket.
 *
 * The backend stops emitting that group once the plan folds Argon into the
 * larger Gemini bucket (Ultra). From then on the family is governed by the
 * shared bucket, so a cooldown recorded against the retired pool — e.g. a 429
 * taken minutes before an upgrade — must not keep blocking the family for days.
 */
export declare function summaryHasArgonGroup(groups: readonly QuotaGroupShape[]): boolean;
/**
 * Decide whether a family's cooldown belongs to a quota bucket that no longer exists.
 *
 * A cooldown is recorded against the pool that produced the 429. A plan change can
 * retire that pool — a Pro → Ultra upgrade folds Argon into the larger Gemini bucket
 * and the backend stops emitting the `Gemini 4 Argon` group — leaving a cooldown that
 * blocks the family until a reset that no longer applies:
 *
 *   All Antigravity accounts are unavailable: no account can serve argon right now
 *   (1 in cooldown) (earliest reset in 345338s)
 *
 * `groupSeenBefore` is what keeps this from firing on accounts that never had the
 * group at all (free tier, or any plan without an Argon bucket): their argon
 * cooldowns come from genuine 429s and must survive.
 */
export declare function shouldReleaseOrphanedCooldown(state: {
    summaryAuthoritative: boolean;
    groupPresent: boolean;
    groupSeenBefore: boolean;
    hasCooldown: boolean;
}): boolean;
/**
 * Pick the family fraction when this poll's summary carried no group for it.
 *
 * An *authoritative* summary (at least one group returned) means the absence is
 * real: the family lost its own bucket — a Pro → Ultra upgrade folds the
 * separate Argon pool into the larger Gemini bucket, and the backend then stops
 * reporting a `Gemini 4 Argon` group entirely while `fetchAvailableModels`
 * keeps listing the argon models with fresh per-model fractions. Keeping the
 * last-known-good row there would freeze a dead window on screen (0%, a reset
 * time from the previous tier).
 *
 * A failed or empty summary is the case `mergeFallbackFamilyQuota` protects:
 * nothing authoritative arrived, so the previous complete value stays.
 */
export declare function pickFamilyQuota(prev: FamilyQuotaInfo | undefined, fresh: FamilyQuotaInfo, summaryAuthoritative: boolean): FamilyQuotaInfo;
export declare function detectEmailFromAgyLogs(homeDir: string): string | undefined;
export declare const OAUTH_USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo";
/**
 * The backend classifies the caller by its `User-Agent` and only returns the
 * separate `Gemini 4 Argon` quota group for the CLI product (`antigravity/cli/`)
 * at or above this version. Older/other product strings get the legacy two
 * groups, which is why Pro-plan users saw no Argon quota at all.
 */
export declare const AGY_UA_MIN_VERSION = "1.3.0";
/** Platform-faithful agy User-Agent (hardcoding darwin/arm64 on Windows is a bad fingerprint). */
export declare function agyUserAgent(version?: string | null): string;
/**
 * Raw on-disk token document. agy >= 1.1.15 writes a NESTED shape:
 *   {"token": {access_token, token_type, refresh_token, expiry}, "auth_method": "consumer"}
 * where expiry is a local ISO-8601 STRING ("2026-08-20T16:44:43.782+08:00").
 * Older and third-party writers use a flat shape with epoch millis.
 * Reading the nested `token` object as if it were the access token string
 * produced "Authorization: Bearer [object Object]" and silently broke every
 * quota fetch (UI permanently stuck at the 100% default) — hence the strict
 * type validation below.
 */
export interface StoredToken {
    accessToken?: string;
    refreshToken?: string;
    /** Epoch milliseconds, parsed from either ISO strings or numbers. */
    expiryMs?: number;
}
/**
 * Normalize the on-disk token document (nested agy shape or flat legacy
 * shape) to a flat StoredToken. Returns null when no usable string access
 * token is present.
 */
export declare function normalizeStoredToken(raw: Record<string, unknown>): StoredToken | null;
interface DiscoveredModelEntry {
    quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
    };
    displayName?: string;
    modelName?: string;
}
interface DiscoveredModelsResponse {
    models?: Record<string, DiscoveredModelEntry>;
}
interface QuotaSummaryBucket {
    bucketId?: string;
    displayName?: string;
    window?: string;
    resetTime?: string;
    description?: string;
    remainingFraction?: number;
    remainingAmount?: number;
}
interface QuotaSummaryGroup {
    displayName?: string;
    description?: string;
    buckets?: QuotaSummaryBucket[];
}
interface QuotaSummaryResponse {
    groups?: QuotaSummaryGroup[];
    buckets?: QuotaSummaryBucket[];
    description?: string;
}
export interface UserQuotaBucket {
    modelId?: string;
    tokenType?: string;
    remainingFraction?: number;
    remainingAmount?: number;
    resetTime?: string;
}
export interface UserQuotaResponse {
    buckets?: UserQuotaBucket[];
}
/**
 * Detects whether a 5-hour quota bucket from retrieveUserQuotaSummary is an
 * unmetered placeholder (remainingFraction = 1.0 and resetTime = now + ~5h).
 * In unmetered environments (e.g. Cloud Code PA prod for free tier), the window
 * never starts billing and stays frozen at 100% forever.
 */
export declare function isStale5hBucket(remainingFraction?: number, resetTime?: string, now?: number): boolean;
/**
 * True only when two token snapshots belong to the SAME OAuth grant.
 *
 * Used to decide whether the machine credential slot really holds the account
 * we are about to poll through the `agy` CLI. A refresh token identifies a
 * grant; an access token rotates, so it is only consulted when neither side
 * carries a refresh token. Mismatched shapes count as "not proven" — the
 * caller then takes the safe path instead of misattributing a quota row.
 */
export declare function sameCredentialGrant(a: StoredToken | null | undefined, b: StoredToken | null | undefined): boolean;
/** How close two ISO reset stamps must be to name the SAME quota window. */
export declare const QUOTA_WINDOW_MATCH_TOLERANCE_MS: number;
/**
 * Organic stagger delay with randomized jitter for multi-account sequential polling.
 * Prevents rigid periodic cadence against Google Cloud Code endpoints (default: 2000~3500ms).
 */
export declare function staggerJitterMs(baseMs?: number, maxJitterMs?: number): number;
/**
 * True when two reset stamps point at the same quota window.
 *
 * `fetchAvailableModels` returns a per-model `quotaInfo` with NO window label:
 * for some accounts it carries the 5-hour bucket, for others the WEEKLY bucket
 * (live: daoxzeex@gmail.com reports the weekly fraction + weekly reset on every
 * Gemini model). The only reliable discriminator is the reset instant — it
 * matches exactly one of the `retrieveUserQuotaSummary` buckets.
 */
export declare function sameQuotaWindow(a?: string, b?: string, toleranceMs?: number): boolean;
/**
 * Reads the active primary Antigravity OAuth token from the Linux Secret
 * Service (GNOME Keyring / KDE Wallet via FreeDesktop secrets). agy 1.1.15+
 * on Linux stores primary credentials via go-keyring under service "gemini"
 * / username "antigravity" — the same JSON shape as the macOS Keychain.
 * GH #8: without this reader, Linux quota resolution always returned null.
 */
export declare function readLinuxSecretToken(): Promise<StoredToken | null>;
/**
 * Reads the active primary Antigravity OAuth token from the macOS Keychain.
 * agy 1.1.15+ on macOS stores primary credentials via go-keyring in the Keychain
 * under service "gemini" / account "antigravity" (base64-encoded JSON).
 */
export declare function readMacKeychainToken(): Promise<StoredToken | null>;
/**
 * Read the primary Antigravity OAuth token from Windows Credential Manager.
 * agy on Windows stores it via go-keyring under target `gemini:antigravity`
 * (user `antigravity`) as a UTF-8 JSON blob with the same shape as macOS
 * Keychain / Linux Secret Service. Without this reader the quota panel stays
 * empty on Windows: the on-disk `antigravity-oauth-token` file is often
 * absent while agy itself still authenticates via CredRead (issue #30).
 */
export declare function readWindowsCredentialToken(): Promise<StoredToken | null>;
export declare class QuotaService {
    private readonly pool;
    private readonly globalProxy;
    /**
     * Resolves the installed agy version for the quota/model User-Agent.
     * Injected because the version probe lives in the plugin entry point.
     */
    private readonly agyVersion;
    /**
     * Optional CLI quota source (`agy -p /usage`). Primary quota source:
     * 100% official binary, real TLS fingerprint, native token refresh by agy Go runtime.
     * REST endpoints serve as secondary fallback when CLI is unavailable.
     */
    private readonly cliDeps;
    private preferredEndpointIndex;
    /** accountId -> in-flight getValidAccessToken attempt (dedup). */
    private readonly tokenRefreshInFlight;
    /**
     * @param globalProxy resolves the plugin-wide proxy URL; used when the
     * account has no dedicated proxyUrl. Injected so tests stay network-free.
     */
    constructor(pool: AccountPoolManager, globalProxy?: () => string, 
    /**
     * Resolves the installed agy version for the quota/model User-Agent.
     * Injected because the version probe lives in the plugin entry point.
     */
    agyVersion?: () => string | null, 
    /**
     * Optional CLI quota source (`agy -p /usage`). Primary quota source:
     * 100% official binary, real TLS fingerprint, native token refresh by agy Go runtime.
     * REST endpoints serve as secondary fallback when CLI is unavailable.
     */
    cliDeps?: {
        bin?: () => string | null;
        preemptAutoUpdate?: () => boolean;
        viaCli?: () => boolean;
    });
    /**
     * One `agy -p /usage` spawn, mapped onto pool families.
     *
     * SCOPE: only the account that owns the OS credential store. `agy` resolves
     * its credential from the platform keystore (Windows Credential Manager,
     * macOS Keychain, Linux Secret Service) BEFORE the per-HOME token file, and
     * that store is a single per-user entry — so the CLI can only ever answer for
     * one identity no matter which HOME we hand it. Isolated pool accounts never
     * own it, so polling them through the CLI filed the owner's numbers under
     * their rows (2026-10-26: four pool rows showing one account's quota with
     * identical reset instants).
     *
     * That single-owner rule keeps the CLI usage check strictly attributed to the
     * slot owner: isolated accounts fall back to the REST path, which signs with
     * each account's own token and reports authentic quotas (including the dedicated
     * Gemini 4 Argon group for Pro/Ultra plans via the agy User-Agent).
     */
    private readCliUsageFamilies;
    /**
     * True when the machine credential slot provably holds this account's grant.
     *
     * This gates the CLI quota read, which can only ever see the slot owner.
     * Conservative by design: when the two snapshots cannot be shown to be the
     * same grant, the caller falls back to REST rather than risk attributing one
     * account's quota to another.
     */
    private cliSlotHoldsAccount;
    /** Dedicated account proxy wins, then the global config proxy, then detected system proxy. */
    private proxyFor;
    private getTokenFilePath;
    /**
     * Read the system-HOME Keychain credential. Protected so tests (and future
     * platforms) can substitute the reader without touching the real Keychain.
     */
    protected readSystemKeychainToken(): Promise<StoredToken | null>;
    /**
     * Read the active token document and normalize it to a flat StoredToken.
     *
     * Precedence for the primary / system-HOME account: the macOS Keychain
     * WINS over the on-disk token file. agy >= 1.1.15 keeps its CURRENT
     * credential in the Keychain; the on-disk antigravity-oauth-token can be a
     * stale leftover from a PREVIOUS account's login (verified live: disk
     * held an old account's token while agy itself was authenticated as
     * someone else — disk-first precedence made every quota refresh fetch the
     * WRONG account's numbers). Isolated pool accounts only ever read their
     * own directory's file; the Keychain is one shared slot they must not see.
     */
    getStoredToken(account: ManagedAccount): Promise<StoredToken | null>;
    /**
     * Persist a refreshed access token in agy's own on-disk shape.
     *
     * The SHAPE matters: agy >= 1.1.15 writes
     * `{"token":{access_token,token_type,refresh_token,expiry},"auth_method":"consumer"}`
     * and every identity guard keys on `refresh_token`. An earlier version wrote
     * a FLAT `{access_token,expiry}` document when the file did not exist yet,
     * silently DROPPING the refresh token; the credential then had no stable
     * identity, so two snapshots of one account compared as different grants and
     * the corruption guards could not fire.
     */
    private persistRefreshedToken;
    /**
     * Get a valid access token, refreshing via refresh_token when expired.
     * Uses the public Antigravity client credentials (env-overridable), so
     * refresh works out of the box.
     *
     * Concurrent calls for the SAME account share one in-flight attempt: the
     * poll timer, three manual HTTP entry points and per-account allSettled
     * used to race into duplicate refreshTokens for one account (double
     * risk-control exposure for the same outcome).
     */
    getValidAccessToken(account: ManagedAccount): Promise<string | null>;
    private getValidAccessTokenUncached;
    /**
     * Query live user info (email) from Google OAuth userinfo endpoint.
     */
    fetchUserInfo(accessToken: string, proxyUrl?: string): Promise<{
        email?: string;
        name?: string;
    } | null>;
    /**
     * Re-order endpoints so the preferred/working endpoint is tried first.
     */
    private getOrderedEndpoints;
    protected fetchSummaryEndpoint(endpoint: string, accessToken: string, proxyUrl?: string): Promise<Response>;
    /**
     * Fetch official multi-bucket quota summary (both weekly and 5h limit windows)
     * via v1internal:retrieveUserQuotaSummary.
     */
    fetchQuotaSummary(accessToken: string, proxyUrl?: string): Promise<QuotaSummaryResponse | null>;
    protected fetchUserQuotaEndpoint(endpoint: string, accessToken: string, proxyUrl?: string): Promise<Response>;
    /**
     * Fetch per-model live user quota via v1internal:retrieveUserQuota.
     */
    fetchUserQuota(accessToken: string, proxyUrl?: string): Promise<UserQuotaResponse | null>;
    /**
     * Fetch available models and model-level quotas via v1internal:fetchAvailableModels.
     */
    fetchAvailableModels(accessToken: string, proxyUrl?: string): Promise<DiscoveredModelsResponse | null>;
    /**
     * Fetch and aggregate live quota statistics (both 5-hour limit and weekly limit)
     * for a single account across model families.
     * Includes 10s cache throttle to avoid spamming Google APIs on fast clicks.
     */
    refreshAccountQuota(account: ManagedAccount, force?: boolean): Promise<Partial<Record<ModelFamily, FamilyQuotaInfo>> | null>;
    /**
     * Refresh quota statistics for all accounts in the pool.
     * Automatic polling (force=false) skips restricted accounts (disabled /
     * auth-quarantined / in cooldown) so the poller never keeps knocking on
     * Google endpoints for accounts already known to be limited. Manual force
     * refresh from the UI refreshes everything.
     *
     * Before gating, a ZERO-NETWORK identity reconciliation runs for flagged
     * slots: an external `agy logout` + re-login writes the new email into the
     * newest CLI logs, and detecting that locally lets us reset the stale
     * quarantine/cooldowns so the slot rejoins polling — no extra request to
     * Google is made for this check (risk-control neutral).
     */
    refreshAllQuotas(force?: boolean): Promise<void>;
}
export {};
