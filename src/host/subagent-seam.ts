/**
 * Runtime detection for the DSH subagent seam.
 * 0.2.1 renamed continuable start/drain and removed `ctx.subagents.start`; the supported
 * baseline is `>=0.2.1-rc.5 <0.3.0-0`. The older names remain as a feature-detection
 * fallback only — callers branch on the function that is actually present, never on a
 * version string.
 */

export const supportedDshVersions = '>=0.2.1-rc.5 <0.3.0-0'

export function hasStartActivation(subagents: object): boolean {
  return typeof (subagents as { startActivation?: unknown }).startActivation === 'function'
}

/** Prefer `primary` (the 0.2.1 name) when both exist. */
export function requireSubagentMethod(subagents: object, primary: string, fallback: string): string {
  const api = subagents as Record<string, unknown>
  if (typeof api[primary] === 'function') return primary
  if (typeof api[fallback] === 'function') return fallback
  throw new Error(`Fusion supports DeepSeek Harness ${supportedDshVersions}; this host has neither subagents.${primary} nor subagents.${fallback}`)
}
