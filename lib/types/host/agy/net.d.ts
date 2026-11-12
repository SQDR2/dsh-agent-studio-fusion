/**
 * Default timeout for one Google endpoint call. undici's own default
 * headers timeout is 300s, so a hung refresh-token / quota endpoint used to
 * park the whole chain (token refresh → two endpoints → userinfo) for many
 * minutes — enough for `/agy refresh-quota` to look dead. Callers may pass
 * their own `signal`; it is combined with the timeout.
 */
export declare const AGY_FETCH_TIMEOUT_MS = 10000;
/** fetch() honoring env proxies, or an explicit per-account proxy URL. */
export declare function agyFetch(url: string, init?: RequestInit, proxyUrl?: string): Promise<Response>;
