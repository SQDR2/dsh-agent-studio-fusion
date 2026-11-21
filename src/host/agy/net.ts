// Proxy-aware fetch for Google endpoints.
//
// Node's built-in fetch ignores HTTP_PROXY/HTTPS_PROXY env vars, which
// silently broke every quota/OAuth call behind a proxy ("fetch failed"
// while curl worked). We use undici's OWN fetch with EnvHttpProxyAgent:
// mixing an external undici dispatcher into Node's built-in fetch throws
// UND_ERR_INVALID_ARG (bundled-undici version skew), so the dispatcher and
// the fetch must come from the same undici copy. An explicit per-account
// proxyUrl wins over the environment. Everything is per-request — the host
// process's global dispatcher stays untouched.
// Ported from dsh-agy-worker (MIT License, Copyright (c) 2026 dsh-agy-worker
// contributors), itself a fork of dsh-agy-link. See docs/ATTRIBUTION-AGY.md.
import { EnvHttpProxyAgent, ProxyAgent, fetch as undiciFetch } from 'undici'
import { detectSystemProxy } from './wincred.js'

const envAgent = new EnvHttpProxyAgent()
const perProxyAgents = new Map<string, ProxyAgent>()

function agentFor(proxyUrl?: string): EnvHttpProxyAgent | ProxyAgent {
  const effective = proxyUrl || detectSystemProxy()
  if (effective) {
    let agent = perProxyAgents.get(effective)
    if (!agent) {
      agent = new ProxyAgent(effective)
      perProxyAgents.set(effective, agent)
    }
    return agent
  }
  return envAgent
}

/**
 * Default timeout for one Google endpoint call. undici's own default
 * headers timeout is 300s, so a hung refresh-token / quota endpoint used to
 * park the whole chain (token refresh → two endpoints → userinfo) for many
 * minutes — enough for `/agy refresh-quota` to look dead. Callers may pass
 * their own `signal`; it is combined with the timeout.
 */
export const AGY_FETCH_TIMEOUT_MS = 10_000

/** fetch() honoring env proxies, or an explicit per-account proxy URL. */
export function agyFetch(url: string, init: RequestInit = {}, proxyUrl?: string, timeoutMs: number | null = AGY_FETCH_TIMEOUT_MS): Promise<Response> {
  // Keep the caller's signal and the default timeout. Streaming inference opts
  // out of the short HTTP timeout and uses Foreman's own abort budget instead.
  const callerSignal = (init as { signal?: AbortSignal | null }).signal ?? undefined
  const timeout = timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs)
  const signal = timeout && callerSignal ? AbortSignal.any([timeout, callerSignal]) : timeout ?? callerSignal
  return undiciFetch(url, {
    ...(init as object),
    signal,
    dispatcher: agentFor(proxyUrl),
  }) as unknown as Promise<Response>
}
