import { describe, expect, it } from 'vitest'
import { WORKER_IMPLEMENTATION_OUTPUT_TOKENS, choiceFromProfile, missingRoutes, modelProfileFromChoice, profileFromChoice, validatePairChoice } from '../src/host/settings.js'
import { completeProfile, resolveProfile } from '../src/profile/resolve.js'
import { profileRoutes } from '../src/profile/compactor.js'
import { FOREMAN_MAX_OUTPUT_TOKENS, FOREMAN_TIMEOUT_MS } from '../src/profile/foreman.js'
import { loadModelPromptBundle, loadPromptBundle } from '../src/prompts.js'
import { readBinding } from '../src/host/bindings.js'

const catalog = { groups: [{ id: 'physical', name: 'Connected provider', models: [
  { id: 'lead', name: 'Lead', reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } },
  { id: 'worker', name: 'Worker' },
] }] }
const pair = { lead: { provider: 'physical', model: 'lead', reasoningEffort: 'high' }, worker: { provider: 'physical', model: 'worker' } }

describe('independent Fusion settings', () => {
  it('round-trips role output limits into frozen request and context policies', () => {
    const prompts = loadPromptBundle(), original = completeProfile(profileFromChoice(pair), prompts)
    expect(choiceFromProfile(original)).toEqual(pair)
    const chosen = validatePairChoice({ ...pair, outputTokens: { lead: 12000, worker: 16000 } }, catalog)
    const frozen = completeProfile(profileFromChoice(chosen), prompts)
    expect(frozen.context.lead.reserveOutputTokens).toBe(12000)
    expect(frozen.context.worker.reserveOutputTokens).toBe(16000)
    expect(choiceFromProfile(frozen)).toEqual(chosen)
    expect(frozen.digest).not.toBe(original.digest)
    expect(original.context.lead.reserveOutputTokens).toBe(8000)
    expect(readBinding({ schemaVersion: 1, sessionId: 'frozen', taskId: 'task', selected: true, profile: original, prompts }, 'frozen').profile).toEqual(original)
    for (const outputTokens of [null, [], true, { lead: 0 }, { lead: 1.5 }, { lead: 128001 }, { worker: '12000' }, { compactor: 8000 }]) {
      expect(() => validatePairChoice({ ...pair, outputTokens }, catalog)).toThrow('每次响应上限')
    }
  })
  it('requires both explicitly configured physical models, including their supported efforts', () => {
    expect(() => validatePairChoice({}, catalog)).toThrow('请选择')
    expect(() => validatePairChoice({ ...pair, worker: { provider: 'dsh-fusion', model: 'auto' } }, catalog)).toThrow('真实模型')
    expect(() => validatePairChoice({ ...pair, worker: { provider: 'physical', model: 'missing' } }, catalog)).toThrow('不可用')
    expect(() => validatePairChoice({ ...pair, worker: { ...pair.worker, reasoningEffort: 'high' } }, catalog)).toThrow('推理强度')
    expect(validatePairChoice(pair, catalog)).toEqual(pair)
    const widened = validatePairChoice({ ...pair, outputTokens: { worker: WORKER_IMPLEMENTATION_OUTPUT_TOKENS } }, catalog)
    const variant = completeProfile(profileFromChoice(widened), loadPromptBundle())
    expect(variant.version).toBe('0.1.0-worker-128k')
    expect(variant.context.worker.reserveOutputTokens).toBe(WORKER_IMPLEMENTATION_OUTPUT_TOKENS)
    expect(variant.context.lead.reserveOutputTokens).toBe(8000)
    expect(profileFromChoice(pair).version).toBe('0.1.0-faithful')
    const resolved = completeProfile(profileFromChoice(validatePairChoice(pair, catalog)), loadPromptBundle())
    expect(resolved).toMatchObject({ enabled: true, lead: pair.lead, worker: pair.worker })
  })
  it('requires explicit per-role cache opt-in and preserves previously frozen profiles without migration', () => {
    const prompts = loadPromptBundle(), original = completeProfile(profileFromChoice(pair), prompts)
    expect(original.cacheKeepalive).toBeUndefined()
    expect(readBinding({ schemaVersion: 1, sessionId: 'frozen', taskId: 'task', selected: true, profile: original, prompts }, 'frozen').profile).toEqual(original)
    for (const cacheKeepalive of [true, ['lead'], { lead: true }, { lead: true, worker: 'false' }, { lead: true, worker: false, interval: 1 }]) {
      expect(() => validatePairChoice({ ...pair, cacheKeepalive }, catalog)).toThrow('keepalive')
      expect(() => completeProfile({ ...original, cacheKeepalive }, prompts)).toThrow('keepalive')
    }
    const chosen = validatePairChoice({ ...pair, cacheKeepalive: { lead: true, worker: false } }, catalog)
    const frozen = completeProfile(profileFromChoice(chosen), prompts)
    expect(frozen.cacheKeepalive).toEqual({ lead: true, worker: false })
    expect(frozen.digest).not.toBe(original.digest)
  })
  it('keeps the optional compactor empty by default and freezes its route, effort and cap', () => {
    const prompts = loadPromptBundle(), original = completeProfile(profileFromChoice(pair), prompts)
    expect(original).not.toHaveProperty('compactor')
    const compactor = { route: pair.lead, maxOutputTokens: 2048 }
    const chosen = validatePairChoice({ ...pair, compactor }, catalog)
    const frozen = completeProfile(profileFromChoice(chosen), prompts)
    expect(frozen.compactor).toEqual(compactor)
    expect(frozen.digest).not.toBe(original.digest)
    const binding = { schemaVersion: 1, sessionId: 'frozen', taskId: 'task', selected: true, profile: frozen, prompts }
    expect(readBinding(binding, 'frozen').profile).toEqual(frozen)
    expect(() => readBinding({ ...binding, profile: { ...frozen, compactor: { ...compactor, maxOutputTokens: 4096 } } }, 'frozen')).toThrow('digest changed')
    expect(profileRoutes(frozen)).toEqual([pair.lead, pair.worker, compactor.route])
    const third = { ...compactor, route: { provider: 'other', model: 'summary' } }
    expect(() => resolveProfile({ ...profileFromChoice(pair), compactor: third }, prompts,
      { authorizedRoutes: [pair.lead, pair.worker] })).toThrow('not authorized')
  })
  it('rejects unavailable, recursive, unsupported or unbounded compactor choices', () => {
    const compactor = { route: pair.lead, maxOutputTokens: 2048 }
    for (const invalid of [null, false, [], {}, { ...compactor, maxOutputTokens: 0 }, { ...compactor, maxOutputTokens: 1.5 },
      { ...compactor, maxOutputTokens: 128001 }, { ...compactor, extra: true }, { ...compactor, route: { ...pair.lead, token: 'not-allowed' } }]) {
      expect(() => validatePairChoice({ ...pair, compactor: invalid }, catalog)).toThrow()
      expect(() => completeProfile({ ...profileFromChoice(pair), compactor: invalid }, loadPromptBundle())).toThrow()
    }
    expect(() => validatePairChoice({ ...pair, compactor: { ...compactor, route: { provider: 'dsh-fusion', model: 'auto' } } }, catalog)).toThrow('真实模型')
    expect(() => validatePairChoice({ ...pair, compactor: { ...compactor, route: { provider: 'physical', model: 'missing' } } }, catalog)).toThrow('不可用')
    expect(() => validatePairChoice({ ...pair, compactor: { ...compactor, route: { ...pair.worker, reasoningEffort: 'high' } } }, catalog)).toThrow('推理强度')
  })
  it('keeps the optional foreman empty by default and freezes its route, output cap and timeout', () => {
    const prompts = loadPromptBundle(), original = completeProfile(profileFromChoice(pair), prompts)
    expect(original).not.toHaveProperty('foreman')
    const foreman = { route: pair.lead, maxOutputTokens: 4000, timeoutMs: 30000 }
    const chosen = validatePairChoice({ ...pair, foreman }, catalog)
    const frozen = completeProfile(profileFromChoice(chosen), prompts)
    expect(frozen.foreman).toEqual(foreman)
    expect(choiceFromProfile(frozen)).toEqual(chosen)
    expect(frozen.digest).not.toBe(original.digest)
    const binding = { schemaVersion: 1, sessionId: 'frozen', taskId: 'task', selected: true, profile: frozen, prompts }
    expect(readBinding(binding, 'frozen').profile).toEqual(frozen)
    expect(() => readBinding({ ...binding, profile: { ...frozen, foreman: { ...foreman, maxOutputTokens: 8000 } } }, 'frozen')).toThrow('digest changed')
    expect(profileRoutes(frozen)).toEqual([pair.lead, pair.worker, foreman.route])
    const missing = missingRoutes({ ...pair, foreman: { route: { provider: 'physical', model: 'missing-m' }, maxOutputTokens: 4000, timeoutMs: 10000 } }, catalog)
    expect(missing).toEqual([{ role: 'foreman', route: { provider: 'physical', model: 'missing-m' } }])
    const third = { ...foreman, route: { provider: 'other', model: 'summary' } }
    expect(() => resolveProfile({ ...profileFromChoice(pair), foreman: third }, prompts,
      { authorizedRoutes: [pair.lead, pair.worker] })).toThrow('not authorized')
  })
  it('rejects unavailable, unsupported or out-of-bounds foreman choices', () => {
    const foreman = { route: pair.lead, maxOutputTokens: 4000, timeoutMs: 30000 }
    for (const invalid of [null, false, [], {}, { ...foreman, maxOutputTokens: 0 }, { ...foreman, maxOutputTokens: 1.5 },
      { ...foreman, maxOutputTokens: FOREMAN_MAX_OUTPUT_TOKENS + 1 }, { ...foreman, timeoutMs: FOREMAN_TIMEOUT_MS.min - 1 },
      { ...foreman, timeoutMs: FOREMAN_TIMEOUT_MS.max + 1 },
      { ...foreman, timeoutMs: 1000.5 }, { ...foreman, extra: true }, { ...foreman, route: { ...pair.lead, token: 'not-allowed' } }]) {
      expect(() => validatePairChoice({ ...pair, foreman: invalid }, catalog)).toThrow()
      expect(() => completeProfile({ ...profileFromChoice(pair), foreman: invalid }, loadPromptBundle())).toThrow()
    }
    expect(() => validatePairChoice({ ...pair, foreman: { ...foreman, route: { provider: 'dsh-fusion', model: 'auto' } } }, catalog)).toThrow('真实模型')
    expect(() => validatePairChoice({ ...pair, foreman: { ...foreman, route: { provider: 'physical', model: 'missing' } } }, catalog)).toThrow('不可用')
    expect(() => validatePairChoice({ ...pair, foreman: { ...foreman, route: { ...pair.worker, reasoningEffort: 'high' } } }, catalog)).toThrow('推理强度')
    // The timeout bound admits a multi-minute review: a slow model on a large plan
    // used to be refused because the ceiling was two minutes.
    expect(() => validatePairChoice({ ...pair, foreman: { ...foreman, timeoutMs: 300_000 } }, catalog)).not.toThrow()
    expect(() => validatePairChoice({ ...pair, foreman: { ...foreman, timeoutMs: FOREMAN_TIMEOUT_MS.max } }, catalog)).not.toThrow()
  })
})

 it('uses native output behavior and separate prompts for new product sessions', () => {
  const prompts = loadModelPromptBundle()
  const profile = completeProfile(modelProfileFromChoice({ ...pair, outputTokens: { worker: 128000 } }), prompts)
  expect(profile.interactionMode).toBe('model-like')
  expect(choiceFromProfile(profile)).toEqual(pair)
  expect(profile.workflowPolicy).toBe('enforced-v3')
  // The Lead is no longer fenced off from the workspace: both roles run in the user's own
  // mode, and the only remaining boundary is the one-writer-per-workspace lease. The prompt
  // says so, which is what replaced the read-only sandbox sentence.
  expect(prompts.lead).toContain('FUSION_LEAD_WRITE_CONFLICT')
  expect(prompts.lead).not.toContain('read-only sandbox')
  expect(readBinding({ schemaVersion: 1, sessionId: 'new', taskId: 'task', selected: true, profile, prompts }, 'new').profile).toEqual(profile)
})
