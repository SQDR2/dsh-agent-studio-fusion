import { bi } from '../bilingual.js'
import type { PairProfile, PhysicalRoute } from '../contracts.js'
import { keepaliveChoice } from '../profile/keepalive.js'
import { compactorChoice } from '../profile/compactor.js'
import { isFusionProvider } from '../identity.js'

export interface PairChoice {
  lead: PhysicalRoute
  worker: PhysicalRoute
  outputTokens?: Partial<Record<'lead' | 'worker', number>>
  cacheKeepalive?: PairProfile['cacheKeepalive']
  compactor?: PairProfile['compactor']
}
export interface SettingsCatalog {
  groups: readonly { id: string; name: string; models: readonly {
    id: string; name: string; reasoning?: { efforts: readonly { id: string; name: string }[]; defaultEffort?: string }
  }[] }[]
}

/** Saved Lead route from a raw settings or profile document, or undefined when unconfigured or pointed at Fusion itself. */
export function savedLeadRoute(value: unknown): { provider: string; model: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const route = (value as Record<string, unknown>).lead
  if (!route || typeof route !== 'object' || Array.isArray(route)) return undefined
  const provider = (route as Record<string, unknown>).provider, model = (route as Record<string, unknown>).model
  if (typeof provider !== 'string' || typeof model !== 'string' || isFusionProvider(provider)) return undefined
  return { provider, model }
}

/** The roles a saved pair names, in the order the settings page shows them. */
export type PairRole = 'lead' | 'worker' | 'compactor'

/**
 * The routes a saved choice still names that the current catalog no longer
 * offers: a provider that was renamed or removed, or a model that was retired.
 *
 * Reading a saved combo tolerates a stale route so the row stays visible and
 * editable, but saving one does not. Without this, the page can only say that
 * *some* model is gone, which is unusable when the stale route is not the one
 * being edited — the user then cannot tell which combo to fix.
 */
export function missingRoutes(value: Partial<PairChoice> | undefined, catalog: SettingsCatalog): { role: PairRole; route: PhysicalRoute }[] {
  if (!value) return []
  const stale = (role: PairRole, route: PhysicalRoute | undefined) => route !== undefined
    && !catalog.groups.find(group => group.id === route.provider)?.models.find(model => model.id === route.model)
    ? [{ role, route }] : []
  return [...stale('lead', value.lead), ...stale('worker', value.worker), ...stale('compactor', value.compactor?.route)]
}

/** Configuration chooses registered physical models; it cannot create adapters. */
export function validatePairChoice(value: unknown, catalog: SettingsCatalog, combo?: string): PairChoice {
  // A list is validated row by row, so the failure has to say which row it came
  // from; `bi` carries both languages, so the label joins the message here
  // instead of being glued onto an already-bilingual string.
  const say = (zh: string, en: string) => combo
    ? bi(`组合「${combo}」：${zh}`, `Combo "${combo}": ${en}`) : bi(zh, en)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(say('请选择 Lead 和 Worker', 'Choose a Lead and a Sidekick'))
  const raw = value as Record<string, unknown>
  const route = (role: string, candidate: unknown): PhysicalRoute => {
    const item = candidate as Record<string, unknown> | undefined
    if (!item || typeof item.provider !== 'string' || typeof item.model !== 'string') throw new Error(say(`请选择 ${role} 模型`, `Choose the ${role} model`))
    if (isFusionProvider(item.provider)) throw new Error(say('Fusion 必须选择真实模型', 'Fusion needs real models, not Fusion itself'))
    const group = catalog.groups.find(group => group.id === item.provider)
    const model = group?.models.find(model => model.id === item.model)
    // Name the exact route: after a provider rename the model usually still
    // exists elsewhere, so "refresh and choose again" alone leaves the user
    // guessing which of the two roles went stale.
    if (!model) throw new Error(say(`${role} 模型已不可用：${item.provider}/${item.model}。请为该角色重新选择模型`,
      `The ${role} model is no longer available: ${item.provider}/${item.model}. Choose a model for that role again`))
    if (item.reasoningEffort !== undefined && (typeof item.reasoningEffort !== 'string'
      || !model.reasoning?.efforts.some(effort => effort.id === item.reasoningEffort))) {
      throw new Error(say(`${role} 不支持所选推理强度`, `${role} does not support the selected reasoning level`))
    }
    return { provider: item.provider, model: item.model,
      ...(item.reasoningEffort === undefined ? {} : { reasoningEffort: item.reasoningEffort as string }) }
  }
  const cacheKeepalive = keepaliveChoice(raw.cacheKeepalive)
  const compactor = compactorChoice(raw.compactor)
  let outputTokens: PairChoice['outputTokens']
  if (raw.outputTokens !== undefined) {
    const value = raw.outputTokens
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.entries(value).some(([role, tokens]) => !['lead', 'worker'].includes(role)
        || !Number.isSafeInteger(tokens) || Number(tokens) < 1 || Number(tokens) > 128_000)) {
      throw new Error(say('每次响应上限必须是 1–128000 的整数 Token 数', 'The per-response limit must be an integer of 1–128000 tokens'))
    }
    outputTokens = { ...value } as PairChoice['outputTokens']
  }
  return { lead: route('lead', raw.lead), worker: route('worker', raw.worker),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(cacheKeepalive === undefined ? {} : { cacheKeepalive }),
    ...(compactor === undefined ? {} : { compactor: { ...compactor, route: route('压缩 · Compaction', compactor.route) } }) }
}

/** New sessions can opt into this Worker cap. Frozen sessions keep their saved profile. */
export const WORKER_IMPLEMENTATION_OUTPUT_TOKENS = 128_000

export function profileFromChoice(pair: PairChoice, id = 'fusion-auto'): Record<string, unknown> {
  const { outputTokens, ...routes } = pair
  const version = outputTokens?.worker === WORKER_IMPLEMENTATION_OUTPUT_TOKENS ? '0.1.0-worker-128k' : '0.1.0-faithful'
  return { schemaVersion: 1, id, version, enabled: true, quality: 'experimental',
    ...routes, workerUpgradePath: [], dataPolicyId: 'native-host-workspace-policy', evidenceCampaignIds: [],
    ...(outputTokens === undefined ? {} : { context: Object.fromEntries(Object.entries(outputTokens)
      .map(([role, reserveOutputTokens]) => [role, { reserveOutputTokens }])) }) }
}

/**
 * Product defaults; explicit legacy/benchmark profiles retain their old contract.
 * `id` names the combo; the first one keeps the historical `fusion-auto` so a
 * profile frozen before combos existed keeps its identity.
 */
export function modelProfileFromChoice(pair: PairChoice, id = 'fusion-auto'): Record<string, unknown> {
  const { outputTokens: _output, ...native } = pair
  return { ...profileFromChoice(native, id), version: '0.2.0-enforced-v3', interactionMode: 'model-like', workflowPolicy: 'enforced-v3' }
}

/** Keep existing default settings stable; expose explicit larger/smaller limits on reload. */
export function choiceFromProfile(profile: PairProfile): PairChoice {
  const outputTokens = Object.fromEntries((['lead', 'worker'] as const)
    .filter(role => profile.context[role].reserveOutputTokens !== 8_000)
    .map(role => [role, profile.context[role].reserveOutputTokens]))
  return { lead: profile.lead, worker: profile.worker,
    ...(profile.interactionMode !== 'model-like' && Object.keys(outputTokens).length ? { outputTokens } : {}),
    ...(profile.compactor === undefined ? {} : { compactor: profile.compactor }),
    ...(profile.cacheKeepalive === undefined ? {} : { cacheKeepalive: profile.cacheKeepalive }) }
}
