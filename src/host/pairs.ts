import { randomUUID } from 'node:crypto'
import { bi } from '../bilingual.js'
import { FUSION_MODEL, isFusionModel } from '../identity.js'
import { keepaliveChoice } from '../profile/keepalive.js'
import { compactorChoice } from '../profile/compactor.js'
import type { SqliteFusionStore } from '../task/sqlite-store.js'
import type { PairChoice, SettingsCatalog } from './settings.js'
import { modelProfileFromChoice, validatePairChoice } from './settings.js'

/**
 * One saved combo: the model id the native menu advertises, the label beside
 * it, and the pair that id freezes. The id is the durable identity — a session
 * that selected it keeps its own frozen copy — so renaming never moves a combo.
 */
export interface PairEntry {
  readonly id: string
  readonly name: string
  readonly pair: PairChoice
}

/** The saved combos, in menu order. `auto` is the historical first combo. */
export interface PairsSnapshot {
  readonly revision: number
  readonly pairs: readonly PairEntry[]
  /** True when these came from a pre-combo `settings:profile` document. */
  readonly migrated: boolean
}

/** Where the combo list lives; `settings:profile` stays readable for migration. */
export const PAIRS_DOCUMENT = 'settings:pairs'
const LEGACY_PROFILE_DOCUMENT = 'settings:profile'

/** Every menu entry costs one row in the native picker, so the list stays short. */
export const MAX_PAIRS = 6
export const MAX_PAIR_NAME = 40
/** The migrated first combo keeps the label the historical entry had. */
export const DEFAULT_PAIR_NAME = '自动'

export const profileIdOf = (model: string): string => `fusion-${model}`

/** The combo a frozen profile belongs to, or undefined for a non-combo profile. */
export function modelOfProfileId(id: string): string | undefined {
  const model = id.startsWith('fusion-') ? id.slice('fusion-'.length) : undefined
  return isFusionModel(model) ? model : undefined
}

const newModel = (taken: readonly string[]): string => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const model = `pair-${randomUUID().replace(/-/g, '').slice(0, 8)}`
    if (!taken.includes(model)) return model
  }
  throw new Error(bi('无法生成新的组合标识', 'Could not allocate a new combo id'))
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function route(value: unknown): PairChoice['lead'] | undefined {
  const item = object(value)
  if (!item || typeof item.provider !== 'string' || !item.provider.trim() || typeof item.model !== 'string' || !item.model.trim()) return undefined
  return { provider: item.provider, model: item.model,
    ...(typeof item.reasoningEffort === 'string' && item.reasoningEffort.trim() ? { reasoningEffort: item.reasoningEffort } : {}) }
}

/**
 * Read one stored pair without the Host catalog: a combo whose model has since
 * been retired must stay visible (and editable) instead of hiding the list.
 */
function structuralPair(value: unknown): PairChoice | undefined {
  const raw = object(value)
  const lead = route(raw?.lead), worker = route(raw?.worker)
  if (!raw || !lead || !worker) return undefined
  const compactorRoute = route(object(raw.compactor)?.route)
  const maxOutputTokens = object(raw.compactor)?.maxOutputTokens
  let cacheKeepalive: PairChoice['cacheKeepalive']
  try { cacheKeepalive = keepaliveChoice(raw.cacheKeepalive) } catch { cacheKeepalive = undefined }
  let compactor: PairChoice['compactor']
  try { compactor = compactorRoute ? compactorChoice({ route: compactorRoute, maxOutputTokens }) : undefined } catch { compactor = undefined }
  return { lead, worker, ...(compactor === undefined ? {} : { compactor }), ...(cacheKeepalive === undefined ? {} : { cacheKeepalive }) }
}

/** A pre-combo profile document as the choice it was saved from. */
export function choiceFromStoredProfile(value: unknown): PairChoice | undefined {
  const raw = object(value)
  const pair = structuralPair(raw)
  if (!raw || !pair) return undefined
  if (raw.interactionMode === 'model-like') return pair
  // Legacy profiles keep explicit per-role output limits in `context`.
  const context = object(raw.context)
  const outputTokens = Object.fromEntries((['lead', 'worker'] as const)
    .map(role => [role, object(context?.[role])?.reserveOutputTokens] as const)
    .filter(([, tokens]) => Number.isSafeInteger(tokens) && Number(tokens) > 0 && Number(tokens) !== 8_000)
    .map(([role, tokens]) => [role, Number(tokens)]))
  return Object.keys(outputTokens).length ? { ...pair, outputTokens } : pair
}

function parsePairs(value: unknown): PairEntry[] | undefined {
  const raw = object(value)
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.pairs)) return undefined
  const seen = new Set<string>()
  return raw.pairs.flatMap((item): PairEntry[] => {
    const entry = object(item)
    const pair = structuralPair(entry?.pair)
    if (!entry || !pair || typeof entry.id !== 'string' || !isFusionModel(entry.id) || seen.has(entry.id)) return []
    if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > MAX_PAIR_NAME) return []
    seen.add(entry.id)
    return [{ id: entry.id, name: entry.name, pair }]
  })
}

/** The saved combos; a pre-combo installation migrates to one `auto` combo on read. */
export function readPairs(store: SqliteFusionStore): PairsSnapshot {
  const document = store.readDocument(PAIRS_DOCUMENT)
  if (document) {
    const pairs = parsePairs(document.value)
    if (!pairs?.length) throw new Error(bi('组合配置已损坏，请在 Fusion 页面重新保存', 'The combo list is unreadable; save it again from the Fusion page'))
    return { revision: document.revision, pairs, migrated: false }
  }
  const legacy = choiceFromStoredProfile(store.readDocument(LEGACY_PROFILE_DOCUMENT)?.value)
  // Revision 0 lets the first save create the document without a conflict.
  return legacy ? { revision: 0, pairs: [{ id: FUSION_MODEL, name: DEFAULT_PAIR_NAME, pair: legacy }], migrated: true }
    : { revision: 0, pairs: [], migrated: false }
}

export function pairName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const name = value.trim()
  if (!name) return fallback
  if (name.length > MAX_PAIR_NAME) throw new Error(bi(`组合名称最多 ${MAX_PAIR_NAME} 个字符`, `A combo name is at most ${MAX_PAIR_NAME} characters`))
  return name
}

/**
 * Validate the list a settings action proposes. Ids are assigned here, never by
 * the client, so a stale tab cannot name a combo that is already frozen
 * elsewhere; reordering only moves the menu rows.
 */
export function validatePairs(value: unknown, catalog: SettingsCatalog, existing: readonly PairEntry[]): PairEntry[] {
  if (!Array.isArray(value) || !value.length) throw new Error(bi('请至少保留一个组合', 'Keep at least one combo'))
  if (value.length > MAX_PAIRS) throw new Error(bi(`最多保存 ${MAX_PAIRS} 个组合`, `At most ${MAX_PAIRS} combos can be saved`))
  const known = new Set(existing.map(pair => pair.id))
  const taken = new Set<string>()
  const names = new Set<string>()
  return value.map((item, index) => {
    const raw = object(item)
    if (!raw) throw new Error(bi('组合配置无效', 'Invalid combo entry'))
    // A frozen session keeps its own copy, so an id may be renamed or reordered
    // freely; a new row (or a duplicate) gets an id this Host has never issued.
    // `auto` is the reserved historical id, so the first combo may claim it even
    // on a fresh installation: selections made before combos existed still name it.
    const requested = typeof raw.id === 'string' ? raw.id : ''
    const id = (known.has(requested) || requested === FUSION_MODEL) && !taken.has(requested) ? requested : newModel([...taken])
    taken.add(id)
    const name = pairName(raw.name, index === 0 ? DEFAULT_PAIR_NAME : `组合 ${index + 1}`)
    if (names.has(name)) throw new Error(bi(`组合名称 "${name}" 重复`, `The combo name "${name}" is used twice`))
    names.add(name)
    // The name goes in so a stale route in the second row does not read like a
    // complaint about the first one.
    return { id, name, pair: validatePairChoice(raw.pair, catalog, name) }
  })
}

export function pairsDocument(pairs: readonly PairEntry[]): Record<string, unknown> {
  return { schemaVersion: 1, pairs: pairs.map(({ id, name, pair }) => ({ id, name, pair })) }
}

/**
 * Persist the list under one compare-and-swap revision. The first combo is
 * mirrored into the pre-combo `settings:profile` document so an older tab (or a
 * downgrade) still finds the pair it knows about.
 */
export function writePairs(store: SqliteFusionStore, expectedRevision: number, pairs: readonly PairEntry[]): number {
  const mirror = pairs.find(pair => pair.id === FUSION_MODEL) ?? pairs[0]!
  const legacy = store.readDocument(LEGACY_PROFILE_DOCUMENT)
  return store.writeDocuments([
    { id: PAIRS_DOCUMENT, expectedRevision, value: pairsDocument(pairs) },
    { id: LEGACY_PROFILE_DOCUMENT, expectedRevision: legacy?.revision ?? 0, value: modelProfileFromChoice(mirror.pair, profileIdOf(mirror.id)) },
  ])[0]!
}
