import { bi } from '../bilingual.js'
import type { PairProfile } from '../contracts.js'

/** Output ceiling for one review call; the same bound the compaction model uses. */
export const FOREMAN_MAX_OUTPUT_TOKENS = 128_000
/**
 * A review call is bounded, but a large candidate plan on a slow model legitimately
 * needs minutes: the earlier two-minute ceiling turned a working setting into a
 * save failure. Ten minutes still bounds the call without binding it to a model's pace.
 */
export const FOREMAN_TIMEOUT_MS = { min: 1_000, max: 600_000 } as const

/**
 * What a combo starts with when the reviewer is switched on.
 *
 * Two minutes was this default and it was not enough to finish the work it was meant to
 * bound. A reasoning reviewer spends tens of seconds before its first token even on a
 * two-word request, and a candidate plan is orders of magnitude larger: one implement
 * candidate on a `reasoningEffort: high` route aborted at 120 006 ms having emitted no
 * stream at all, and the gate reads an abort as approval, so the plan shipped unaudited
 * with only a notice to say so. Five minutes keeps the documented ceiling for headroom
 * above the case that failed instead of sitting one queue stall away from it.
 */
export const FOREMAN_DEFAULT_TIMEOUT_MS = 300_000

/**
 * How long the reviewer may stay silent before the attempt is treated as never having
 * started, independent of {@link FOREMAN_DEFAULT_TIMEOUT_MS}.
 *
 * The two budgets answer different questions. A total timeout alone cannot tell "still
 * thinking" from "the gateway never answered", so it spends the whole budget on a stall
 * and reports one undifferentiated `TimeoutError`. Waiting only this long for the first
 * chunk distinguishes the two, and a route that produced nothing has not been reviewed
 * at all, so that case is worth one retry — where a review still streaming at its total
 * deadline is a slow reviewer whose partial output would be discarded anyway.
 */
export const FOREMAN_NO_PROGRESS_TIMEOUT_MS = 120_000

/** A separate shadow plan auditor model is never inferred from a provider name or enabled by default. */
export function foremanChoice(value: unknown): PairProfile['foreman'] {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(bi('工长审查模型配置无效', 'Invalid foreman model setting'))
  const raw = value as Record<string, unknown>, route = raw.route as Record<string, unknown> | undefined
  // Each field is reported on its own: one combined sentence listing model, output
  // limit and timeout left the user guessing which of the three had been rejected.
  // `policy` is a retired setting: a combo saved before the reviewer became
  // unconditional still carries it, and refusing the key would silently disable the
  // Foreman on the next save instead of upgrading it to "always reviews".
  if (Object.keys(raw).some(key => !['route', 'maxOutputTokens', 'timeoutMs', 'policy'].includes(key))
    || !route || typeof route !== 'object' || Array.isArray(route)
    || Object.keys(route).some(key => !['provider', 'model', 'reasoningEffort'].includes(key))
    || typeof route.provider !== 'string' || !route.provider.trim()
    || typeof route.model !== 'string' || !route.model.trim()
    || (route.reasoningEffort !== undefined && (typeof route.reasoningEffort !== 'string' || !route.reasoningEffort.trim()))) {
    throw new Error(bi('请为工长选择模型', 'Choose a model for the foreman'))
  }
  if (!Number.isSafeInteger(raw.maxOutputTokens) || Number(raw.maxOutputTokens) < 1 || Number(raw.maxOutputTokens) > FOREMAN_MAX_OUTPUT_TOKENS) {
    throw new Error(bi(`工长输出上限必须是 1–${FOREMAN_MAX_OUTPUT_TOKENS} 的整数 Token，现在是 ${String(raw.maxOutputTokens)}`,
      `The foreman output limit must be an integer of 1–${FOREMAN_MAX_OUTPUT_TOKENS} tokens; it is ${String(raw.maxOutputTokens)}`))
  }
  if (!Number.isSafeInteger(raw.timeoutMs) || Number(raw.timeoutMs) < FOREMAN_TIMEOUT_MS.min || Number(raw.timeoutMs) > FOREMAN_TIMEOUT_MS.max) {
    throw new Error(bi(`工长超时必须 ${FOREMAN_TIMEOUT_MS.min}–${FOREMAN_TIMEOUT_MS.max} 毫秒，现在是 ${String(raw.timeoutMs)}`,
      `The foreman timeout must be ${FOREMAN_TIMEOUT_MS.min}–${FOREMAN_TIMEOUT_MS.max} ms; it is ${String(raw.timeoutMs)}`))
  }
  return {
    route: {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort as string }),
    },
    maxOutputTokens: Number(raw.maxOutputTokens),
    timeoutMs: Number(raw.timeoutMs),
  }
}
