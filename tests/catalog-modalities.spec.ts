import { describe, expect, it } from 'vitest'
import { FUSION_PROVIDER, FusionCatalogAdapter, FUSION_MODEL } from '../src/host/native-selection.js'
import { savedLeadRoute } from '../src/host/settings.js'

const combo = (id: string, name: string, inputModalities: ('text' | 'image')[]) => ({ id, name, inputModalities })

describe('FusionCatalogAdapter input modalities', () => {
  it('declares text-only until a combo resolver is configured', async () => {
    const unconfigured = new FusionCatalogAdapter()
    expect(await unconfigured.listModels(FUSION_PROVIDER)).toMatchObject({ 0: { id: FUSION_MODEL, inputModalities: ['text'] } })
    const unresolved = new FusionCatalogAdapter(async () => [])
    expect(await unresolved.listModels(FUSION_PROVIDER)).toMatchObject({ 0: { inputModalities: ['text'] } })
  })

  it('admits exactly what each combo Lead admits, unioned with text', async () => {
    const imageLead = new FusionCatalogAdapter(async () => [combo('auto', 'Fusion · 自动', ['image', 'text'])])
    expect(await imageLead.listModels(FUSION_PROVIDER)).toMatchObject({ 0: { inputModalities: ['text', 'image'] } })
    const textLead = new FusionCatalogAdapter(async () => [combo('auto', 'Fusion · 自动', ['text'])])
    expect(await textLead.listModels(FUSION_PROVIDER)).toMatchObject({ 0: { inputModalities: ['text'] } })
  })

  it('advertises one entry per saved combo', async () => {
    const adapter = new FusionCatalogAdapter(async () => [combo('auto', 'Fusion · 快', ['text']), combo('pair-a1b2c3d4', 'Fusion · 稳', ['image'])])
    const models = await adapter.listModels(FUSION_PROVIDER)
    expect(models.map(model => [model.id, model.name, model.inputModalities])).toEqual([
      ['auto', 'Fusion · 快', ['text']], ['pair-a1b2c3d4', 'Fusion · 稳', ['text', 'image']],
    ])
  })

  it('resolves each advertised combo and rejects everything else', async () => {
    const adapter = new FusionCatalogAdapter(async () => [combo('auto', 'Fusion · 快', ['text']), combo('pair-a1b2c3d4', 'Fusion · 稳', ['image'])])
    expect(await adapter.resolveModel(FUSION_PROVIDER, FUSION_MODEL)).toMatchObject({ provider: FUSION_PROVIDER, id: FUSION_MODEL, inputModalities: ['text'] })
    expect(await adapter.resolveModel(FUSION_PROVIDER, 'pair-a1b2c3d4')).toMatchObject({ id: 'pair-a1b2c3d4', inputModalities: ['text', 'image'] })
    await expect(adapter.resolveModel(FUSION_PROVIDER, 'pair-ffffffff')).rejects.toThrow('Unknown local Fusion selection')
    await expect(adapter.resolveModel('llm-deepseek', FUSION_MODEL)).rejects.toThrow('Unknown local Fusion selection')
  })
})

describe('savedLeadRoute', () => {
  it('extracts the saved Lead route and rejects unconfigured or self-referential values', () => {
    expect(savedLeadRoute({ lead: { provider: 'llm-deepseek', model: 'deepseek-chat' } })).toEqual({ provider: 'llm-deepseek', model: 'deepseek-chat' })
    expect(savedLeadRoute(undefined)).toBeUndefined()
    expect(savedLeadRoute({})).toBeUndefined()
    expect(savedLeadRoute({ lead: { provider: 'llm-deepseek' } })).toBeUndefined()
    expect(savedLeadRoute({ lead: { provider: FUSION_PROVIDER, model: FUSION_MODEL } })).toBeUndefined()
  })
})
