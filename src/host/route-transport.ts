import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

/**
 * Provider routes that run their OWN agent loop instead of answering one model
 * call. Their adapter can only hand a tool call back to this Host under its own
 * transport name, so a caller-driven tool ceiling that lists only the caller's
 * own tools advertises names the route can never emit.
 *
 * `antigravity` is dsh-agy-link: `agy` executes the bridged call inside its own
 * loop, and the adapter reports that step as `agy_tool`, which this Host replays
 * as a native card. Fusion's Worker is exactly such a caller — its ceiling was
 * `workerTools` + `fusion_*`, so the delegation ran as prose and the Host
 * (correctly) diagnosed `WORKER_TOOLS_UNREACHABLE`.
 */
const ROUTE_TRANSPORT: Readonly<Record<string, string>> = { antigravity: 'agy_tool' }

/** Every transport a bridge route may report a step through. */
const ROUTE_TRANSPORT_NAMES: ReadonlySet<string> = new Set(Object.values(ROUTE_TRANSPORT))

/** The transport name this provider route needs, registered or not. */
export function routeTransportName(provider: string): string | undefined {
  return ROUTE_TRANSPORT[provider]
}

/**
 * Whether `name` is a bridge-route transport. Such a tool only replays a step
 * the route already executed in its own loop: it is presentation, not an effect
 * this Host authorizes, bills or holds a write lease for.
 */
export function isRouteTransportName(name: string): boolean {
  return ROUTE_TRANSPORT_NAMES.has(name)
}

/**
 * The transport this route needs AND this Host can actually accept. An
 * unregistered name is skipped, because a call naming it is rejected as
 * `unknown tool` — the adapter must never invent one either.
 *
 * The lookup is the GLOBAL view on purpose. A bridge registers its transport at
 * the host layer, while an agent scope's own restriction hides inherited tools:
 * reading through the Worker's restricted scope would report "absent" on the
 * very next refresh and shrink the ceiling that had just been widened.
 */
export function registeredRouteTransport(ctx: Context, provider: string): string | undefined {
  const name = routeTransportName(provider)
  if (name === undefined) return undefined
  return ctx.tools.get(name) === undefined ? undefined : name
}

/** Add the route's transport to a capability ceiling without duplicating a configured entry. */
export function withRouteTransport(ceiling: readonly string[], transport: string | undefined): readonly string[] {
  return transport === undefined || ceiling.includes(transport) ? ceiling : [...ceiling, transport]
}
