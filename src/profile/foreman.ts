import { bi } from '../bilingual.js'
import type { PairProfile } from '../contracts.js'

/** Output ceiling for one review call; the same bound the compaction model uses. */
export const FOREMAN_MAX_OUTPUT_TOKENS = 128_000
/**
 * The range one combo may set for the review ceiling.
 *
 * This is the longest the Lead is ever made to wait, not the length of a review: the review
 * starts with a shorter window and each completed tool call extends it (see
 * `FOREMAN_BASE_BUDGET_MS` / `FOREMAN_TOOL_CALL_BUDGET_MS`), so the ceiling is only reached by
 * a reviewer that keeps demonstrating work. Fifteen minutes, because a code-level audit reads
 * the files its findings depend on: the review that aborted at the old five-minute default had
 * made twenty-one tool calls in four minutes and was still reading.
 */
export const FOREMAN_TIMEOUT_MS = { min: 1_000, max: 900_000 } as const

/**
 * What a combo starts with when the reviewer is switched on.
 *
 * Each raise of this default has been a fix for the same failure. Two minutes aborted a
 * `reasoningEffort: high` reviewer that emitted no stream at all; five minutes then aborted
 * one that was streaming steadily at ~115 tokens/s across sixteen turns and twenty-one tool
 * calls, with nothing wrong with the route. A fixed second count cannot separate "slow" from
 * "stuck", and the reviewer now does real work per review, so the default moved to ten
 * minutes — the ceiling a review only reaches if it keeps producing evidence.
 */
export const FOREMAN_DEFAULT_TIMEOUT_MS = 600_000

/**
 * How long the reviewer may stay silent before the attempt is treated as never having
 * started, independent of {@link FOREMAN_DEFAULT_TIMEOUT_MS}.
 *
 * The two budgets answer different questions. A total timeout alone cannot tell "still
 * thinking" from "the gateway never answered", so it spends the whole budget on a stall
 * and reports one undifferentiated `TimeoutError`. Waiting only this long for the first
 * chunk distinguishes the two, and a route that produced nothing has not been reviewed
 * at all, so that case is worth one retry — where a review still streaming at its ceiling
 * is a slow reviewer whose partial output would be discarded anyway.
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
