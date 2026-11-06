import { afterEach, describe, expect, it } from 'vitest'
import { SqliteFusionStore } from '../src/task/sqlite-store.js'
import { PAIRS_DOCUMENT, readPairs, validatePairs, writePairs } from '../src/host/pairs.js'
import { modelProfileFromChoice, profileFromChoice, type PairChoice, type SettingsCatalog } from '../src/host/settings.js'

const stores: SqliteFusionStore[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close() })
const memory = () => { const store = new SqliteFusionStore(':memory:'); stores.push(store); return store }

const catalog: SettingsCatalog = {
  groups: [
    { id: 'llm-deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-v4', name: 'DeepSeek V4' }, { id: 'deepseek-v4-mini', name: 'DeepSeek V4 Mini' }] },
    { id: 'pi-anthropic', name: 'Anthropic', models: [{ id: 'claude-opus-5', name: 'Claude Opus 5' }] },
  ],
} as unknown as SettingsCatalog

const choice = (lead: string, worker: string): PairChoice => ({
  lead: { provider: 'llm-deepseek', model: lead }, worker: { provider: 'llm-deepseek', model: worker },
})
const opus: PairChoice = {
  lead: { provider: 'pi-anthropic', model: 'claude-opus-5' }, worker: { provider: 'llm-deepseek', model: 'deepseek-v4-mini' },
}

describe('saved combos', () => {
  it('migrates a pre-combo settings:profile into one "auto" combo without writing anything', () => {
    const store = memory()
    store.writeDocument('settings:profile', 0, modelProfileFromChoice(choice('deepseek-v4', 'deepseek-v4-mini')))
    const snapshot = readPairs(store)
    expect(snapshot).toMatchObject({ revision: 0, migrated: true })
    expect(snapshot.pairs).toHaveLength(1)
    expect(snapshot.pairs[0]).toMatchObject({ id: 'auto', name: '自动', pair: choice('deepseek-v4', 'deepseek-v4-mini') })
    // Reading is not writing: the legacy document keeps its own revision.
    expect(store.readDocument(PAIRS_DOCUMENT)).toBeUndefined()
  })

  it('reports no combos on a fresh installation', () => {
    expect(readPairs(memory())).toEqual({ revision: 0, pairs: [], migrated: false })
  })

  it('assigns an id to every new row and keeps the ids the Host already issued', () => {
    const store = memory()
    const first = validatePairs([{ name: '快', pair: choice('deepseek-v4', 'deepseek-v4-mini') }], catalog, [])
    expect(first[0]!.id).toMatch(/^pair-[a-z0-9]{8}$/)
    writePairs(store, 0, first)
    const saved = readPairs(store).pairs
    // A rename and a reorder keep the frozen identity of the row.
    const reordered = validatePairs([{ id: saved[0]!.id, name: '快一些', pair: opus }], catalog, saved)
    expect(reordered[0]!.id).toBe(saved[0]!.id)
    expect(reordered[0]!.name).toBe('快一些')
  })

  it('rejects what the model menu cannot advertise', () => {
    const store = memory()
    const saved = validatePairs([{ name: '快', pair: choice('deepseek-v4', 'deepseek-v4-mini') }], catalog, [])
    writePairs(store, 0, saved)
    expect(() => validatePairs([], catalog, saved)).toThrow('请至少保留一个组合')
    expect(() => validatePairs([{ name: '快', pair: choice('deepseek-v4', 'deepseek-v4-mini') },
      { name: '快', pair: choice('deepseek-v4', 'deepseek-v4-mini') }], catalog, saved)).toThrow('重复')
    expect(() => validatePairs([{ name: 'x'.repeat(41), pair: choice('deepseek-v4', 'deepseek-v4-mini') }], catalog, saved)).toThrow()
    // Seven entries cannot all fit in one menu.
    expect(() => validatePairs(Array.from({ length: 7 }, () => ({ name: `c${Math.random()}`, pair: choice('deepseek-v4', 'deepseek-v4-mini') })), catalog, saved)).toThrow('最多保存')
    // A model the catalog does not know cannot be saved.
    expect(() => validatePairs([{ name: '坏', pair: choice('retired-model', 'deepseek-v4-mini') }], catalog, saved)).toThrow()
  })

  it('compare-and-swap the list and mirrors the first combo for older readers', () => {
    const store = memory()
    const pairs = validatePairs([{ id: 'auto', name: '自动', pair: choice('deepseek-v4', 'deepseek-v4-mini') },
      { name: '稳', pair: opus }], catalog, [])
    expect(writePairs(store, 0, pairs)).toBe(1)
    expect(readPairs(store)).toMatchObject({ revision: 1 })
    expect(readPairs(store).pairs.map(pair => pair.name)).toEqual(['自动', '稳'])
    // The first combo also lands where the pre-combo code looked for it.
    expect(store.readDocument('settings:profile')?.value).toMatchObject({ id: 'fusion-auto', lead: { model: 'deepseek-v4' } })
    expect(() => writePairs(store, 0, pairs)).toThrow()
    expect(writePairs(store, 1, pairs.slice(0, 1))).toBe(2)
    expect(readPairs(store).pairs).toHaveLength(1)
  })

  it('gives each combo its own frozen profile identity', () => {
    expect(profileFromChoice(choice('deepseek-v4', 'deepseek-v4-mini'), 'fusion-auto')).toMatchObject({ id: 'fusion-auto' })
    expect(modelProfileFromChoice(choice('deepseek-v4', 'deepseek-v4-mini'), 'fusion-pair-a1b2c3d4'))
      .toMatchObject({ id: 'fusion-pair-a1b2c3d4', interactionMode: 'model-like', workflowPolicy: 'enforced-v3' })
  })
})
