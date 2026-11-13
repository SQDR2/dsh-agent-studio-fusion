/**
 * Runtime detection for the DSH subagent seam.
 * 0.2.1 renamed continuable start/drain and removed `ctx.subagents.start`; the supported
 * baseline is `>=0.2.1-rc.5 <0.2.2-0 || >=0.2.2-rc.2 <0.3.0-0`. The older names remain as a feature-detection
 * fallback only — callers branch on the function that is actually present, never on a
 * version string.
 *
 * 0.2.2 removed `drainChildren`/`drainContinuableChildren` entirely and flattened the
 * activation spec in the same release, so one marker answers both questions:
 * - `startActivation` takes task options at the top level (0.2.2) or nested under `request`
 *   (0.2.1); `requiresNestedActivationRequest` reports the nested form from the removed
 *   drain marker, never from a version string or a declaration read.
 * - A single child is released by the activation receipt's `dispose()`, so the transport
 *   retains the receipt it received. The surviving `drainDescendants` is not a replacement:
 *   it permanently closes the caller's whole subagent tree.
 */

export const supportedDshVersions = '>=0.2.1-rc.5 <0.2.3-0'

export function hasStartActivation(subagents: object): boolean {
  return typeof (subagents as { startActivation?: unknown }).startActivation === 'function'
}

/** Prefer `primary` (the 0.2.1 name) when both exist. */
export function requireSubagentMethod(subagents: object, primary: string, fallback: string): string {
  const api = subagents as Record<string, unknown>
  if (typeof api[primary] === 'function') return primary
  if (typeof api[fallback] === 'function') return fallback
  throw new Error(`Fusion supports DeepSeek Assistant ${supportedDshVersions}; this host has neither subagents.${primary} nor subagents.${fallback}`)
}

/**
 * Whether this Host's `startActivation` still nests task options under `request`.
 *
 * 0.2.1 required `{ provider, label, delivery, request: {...}, signal }`; 0.2.2 accepts the
 * same fields at the top level and removed `request`. The two services are not otherwise
 * distinguishable at runtime, so this test uses the `drainChildren` marker that 0.2.2
 * removed in the same release. It is a proxy, not a reading of the declarations.
 */
export function requiresNestedActivationRequest(subagents: object): boolean {
  return typeof (subagents as { drainChildren?: unknown }).drainChildren === 'function'
}
