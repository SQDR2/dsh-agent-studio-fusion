import type { Context } from '@deepseek-ai/cordis';
/** The transport name this provider route needs, registered or not. */
export declare function routeTransportName(provider: string): string | undefined;
/**
 * Whether `name` is a bridge-route transport. Such a tool only replays a step
 * the route already executed in its own loop: it is presentation, not an effect
 * this Host authorizes, bills or holds a write lease for.
 */
export declare function isRouteTransportName(name: string): boolean;
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
export declare function registeredRouteTransport(ctx: Context, provider: string): string | undefined;
/** Add the route's transport to a capability ceiling without duplicating a configured entry. */
export declare function withRouteTransport(ceiling: readonly string[], transport: string | undefined): readonly string[];
