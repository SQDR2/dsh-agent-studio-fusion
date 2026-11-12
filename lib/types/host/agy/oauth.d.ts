/**
 * Public Google consumer-OAuth credentials shipped inside the Antigravity
 * desktop product and its agy CLI (also embedded in many public tools).
 * Not secrets owned by this project; AGY_CLIENT_ID / AGY_CLIENT_SECRET env
 * vars override them for BYO OAuth app setups.
 */
export declare const AGY_PUBLIC_CLIENT_ID: string;
export declare const AGY_PUBLIC_CLIENT_SECRET: string;
export declare function resolveClientCredentials(): {
    clientId: string;
    clientSecret: string;
};
/**
 * Required scopes. `openid` must NOT be added: it routes Google into the
 * hanging firstparty/nativeapp consent for this client (verified by
 * OmniRoute captures).
 */
export declare const AGY_SCOPES: readonly string[];
export declare const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export declare const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export declare const OAUTH_USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo";
/** Fixed loopback callback registered for the Antigravity client (like opencode). */
export declare const OAUTH_CALLBACK_PORT = 51121;
export declare const OAUTH_CALLBACK_PATH = "/oauth-callback";
export declare const OAUTH_REDIRECT_URI = "http://localhost:51121/oauth-callback";
/** Runtime endpoint fallback order (Antigravity endpoint first, then Cloud Code PA fallbacks). */
export declare const AGY_ENDPOINTS: readonly string[];
export interface PkcePair {
    verifier: string;
    challenge: string;
}
export declare function generatePkce(): PkcePair;
export declare function buildAuthorizeUrl(challenge: string, state: string): string;
export interface TokenSet {
    access_token: string;
    token_type?: string;
    refresh_token?: string;
    /** Epoch milliseconds when the access token expires. */
    expiryMs?: number;
}
/** Exchange an authorization code for tokens (PKCE-verified). */
export declare function exchangeCode(code: string, verifier: string, proxyUrl?: string): Promise<TokenSet>;
/** Refresh an access token; throws on invalid_grant (credential revoked). */
export declare function refreshTokens(refreshToken: string, proxyUrl?: string): Promise<TokenSet>;
/** Fetch the account email for a valid access token (best effort). */
export declare function fetchUserEmail(accessToken: string, proxyUrl?: string): Promise<string | undefined>;
/**
 * Persist tokens in agy's own on-disk format so the official binary is
 * signed in for the given HOME. Verified against agy 1.1.16 output:
 *   {"token": {access_token, token_type, refresh_token, expiry}, "auth_method": "consumer"}
 * where expiry is a local-time ISO-8601 string with timezone offset.
 */
export declare function writeAgyTokenFile(homeDir: string, tokens: TokenSet): string;
export interface CallbackResult {
    code: string;
    state: string;
}
export interface CallbackHandle {
    result: Promise<CallbackResult>;
    close(): Promise<void>;
}
/**
 * Listen on 127.0.0.1:OAUTH_CALLBACK_PORT for the OAuth redirect.
 * Rejects on bind failure (e.g. port busy) so callers can fall back to
 * manual code paste. Resolves with the first well-formed callback.
 */
export declare function startCallbackListener(timeoutMs?: number): CallbackHandle;
/** Open a URL in the system browser. Resolves false when the launch fails. */
export declare function openBrowser(url: string): Promise<boolean>;
/**
 * Parse a manual paste: accepts a bare authorization code or a full
 * loopback redirect URL (http://localhost:51121/oauth-callback?code=...&state=...).
 */
export declare function parsePastedCode(input: string): {
    code: string;
    state?: string;
} | null;
