export type AuthPhase = 'idle' | 'pending' | 'submitting' | 'ok' | 'failed' | 'signed-out';
export interface AuthStatus {
    phase: AuthPhase;
    accountId?: string;
    url?: string;
    qrDataUrl?: string;
    startedAt?: number;
    /** agy hard-codes a wait for the code; fresh URL after that. */
    expiresAt?: number;
    message?: string;
}
export declare class AuthHelper {
    private readonly bin;
    /** Issue #49: pre-empt agy's auto-updater before probe/login spawns. */
    private readonly preemptAutoUpdate;
    private state;
    private probe;
    private capturedUrl;
    private urlWaiter;
    private urlTimer;
    private activeHomeDir;
    private activeAccountId;
    /** Monotonic begin() generation; a superseded begin must not write state. */
    private beginSeq;
    private signedInCache;
    private signedInFlight;
    constructor(bin: () => string | null, 
    /** Issue #49: pre-empt agy's auto-updater before probe/login spawns. */
    preemptAutoUpdate?: () => boolean);
    status(): AuthStatus;
    /**
     * Ground-truth login probe: `agy models` succeeds only when signed in and
     * prints a sign-in error otherwise. Cached for 60s; in-flight calls share
     * one spawn. Returns true/false, or null when undeterminable (no binary,
     * spawn failure, ambiguous output). While a login flow is active the
     * in-memory phase wins and the probe is skipped.
     */
    probeSignedIn(force?: boolean, homeDir?: string): Promise<boolean | null>;
    /** status() enriched with a lazily probed login state for idle phases. */
    resolvedStatus(): Promise<AuthStatus>;
    private startProbe;
    /** Start (or restart) the login flow; resolves with the consent URL. */
    begin(homeDir?: string, accountId?: string, proxyUrl?: string): Promise<AuthStatus>;
    /** Pipe the pasted authorization code into the waiting probe. */
    submitCode(code: string): Promise<AuthStatus>;
    cancelAuth(): AuthStatus;
    cancel(): void;
    dispose(): void;
}
