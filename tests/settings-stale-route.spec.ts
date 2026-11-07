import { describe, expect, it } from 'vitest'
import { missingRoutes, validatePairChoice, type SettingsCatalog } from '../src/host/settings.js'
import { validatePairs } from '../src/host/pairs.js'

const catalog: SettingsCatalog = {
  groups: [{ id: 'physical', name: 'Connected provider', models: [
    { id: 'lead', name: 'Lead', reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } },
    { id: 'worker', name: 'Worker' },
  ] }],
} as unknown as SettingsCatalog

const pair = { lead: { provider: 'physical', model: 'lead', reasoningEffort: 'high' }, worker: { provider: 'physical', model: 'worker' } }

describe('a saved route the catalog dropped', () => {
  it('names the exact stale route, not only the role', () => {
    // A provider rename leaves the same model reachable under another provider
    // id, so "refresh and choose again" alone never says what went stale.
    const renamed = { ...pair, lead: { provider: 'physical-old', model: 'lead' } }
    expect(() => validatePairChoice(renamed, catalog)).toThrow('physical-old/lead')
    expect(() => validatePairChoice(renamed, catalog)).toThrow('lead')
    // The compactor is edited from the same row, so it is named too.
    expect(() => validatePairChoice({ ...pair, compactor: { route: { provider: 'gone', model: 'summary' }, maxOutputTokens: 2048 } }, catalog))
      .toThrow('gone/summary')
    // A retired model in an otherwise valid provider is equally explicit.
    expect(() => validatePairChoice({ ...pair, worker: { provider: 'physical', model: 'retired' } }, catalog)).toThrow('physical/retired')
  })

  it('says which combo failed, because the list validates row by row', () => {
    const stale = { lead: { provider: 'physical-old', model: 'lead' }, worker: { provider: 'physical', model: 'worker' } }
    expect(() => validatePairChoice(stale, catalog, '日常逻辑开发')).toThrow('日常逻辑开发')
    expect(() => validatePairChoice(stale, catalog, '日常逻辑开发')).toThrow('physical-old/lead')
    // The same failure reaches the settings page through the list validator.
    expect(() => validatePairs([
      { id: 'auto', name: '快', pair },
      { id: 'pair-a1b2c3d4', name: '日常逻辑开发', pair: stale },
    ], catalog, [])).toThrow('日常逻辑开发')
  })

  it('reports every stale route of a choice, in the order the page edits them', () => {
    expect(missingRoutes(pair, catalog)).toEqual([])
    expect(missingRoutes({ lead: { provider: 'physical-old', model: 'lead' }, worker: { provider: 'physical', model: 'retired' } }, catalog))
      .toEqual([{ role: 'lead', route: { provider: 'physical-old', model: 'lead' } },
        { role: 'worker', route: { provider: 'physical', model: 'retired' } }])
    // The compactor is optional, so only a present one can be stale.
    expect(missingRoutes({ ...pair, compactor: { route: { provider: 'gone', model: 'summary' }, maxOutputTokens: 2048 } }, catalog))
      .toEqual([{ role: 'compactor', route: { provider: 'gone', model: 'summary' } }])
    expect(missingRoutes(undefined, catalog)).toEqual([])
    expect(missingRoutes({}, catalog)).toEqual([])
    // A route that is merely half-chosen is not stale: the page checks that first.
    expect(missingRoutes({ worker: pair.worker }, catalog)).toEqual([])
  })
})
