import { describe, expect, it } from 'vitest'
import type { PairProfile, PhysicalRoute, TaskId, Digest } from '../src/contracts.js'
import { NativeAuxiliaryRequests } from '../src/host/native-auxiliary.js'
import { projectForemanManifest, validateForemanGuardRequest, type ForemanGuardOwner } from '../src/benchmark/native-run.js'

describe('benchmark foreman manifest and stream guard', () => {
  const route: PhysicalRoute = { provider: 'test-p', model: 'foreman-m' }
  const baseProfile: PairProfile = {
    schemaVersion: 1,
    id: 'p-1',
    version: '1',
    digest: 'd' as any,
    enabled: true,
    lead: { provider: 'test-p', model: 'lead-m' },
    worker: { provider: 'test-p', model: 'worker-m' },
    dataPolicyId: 'local',
  } as unknown as PairProfile

  it('records foreman off in manifest when foreman is not configured in profile', () => {
    const manifest = projectForemanManifest(baseProfile)
    expect(manifest).toEqual({ condition: 'off' })
  })

  it('records shadow, gate, and risk-gated conditions with limits in manifest', () => {
    const shadowProfile: PairProfile = {
      ...baseProfile,
      foreman: { route, maxOutputTokens: 2048, timeoutMs: 15000, policy: 'shadow' },
    }
    expect(projectForemanManifest(shadowProfile)).toEqual({
      condition: 'shadow',
      route,
      maxOutputTokens: 2048,
      timeoutMs: 15000,
    })

    const gateProfile: PairProfile = {
      ...baseProfile,
      foreman: { route, maxOutputTokens: 4096, timeoutMs: 30000, policy: 'gate' },
    }
    expect(projectForemanManifest(gateProfile)).toEqual({
      condition: 'gate',
      route,
      maxOutputTokens: 4096,
      timeoutMs: 30000,
    })

    const riskProfile: PairProfile = {
      ...baseProfile,
      foreman: { route, maxOutputTokens: 4096, timeoutMs: 25000, policy: 'risk-gated' },
    }
    expect(projectForemanManifest(riskProfile)).toEqual({
      condition: 'risk-gated',
      route,
      maxOutputTokens: 4096,
      timeoutMs: 25000,
    })
  })

  it('validates stream guard rules for auxiliary foreman requests', () => {
    const auxiliary = new NativeAuxiliaryRequests()
    const foremanConfig = { route, maxOutputTokens: 2048, timeoutMs: 10000 }
    const validRequest = {
      provider: 'test-p',
      model: 'foreman-m',
      maxTokens: 2048,
      tools: [],
      messages: [],
    }
    const defaultOwner: ForemanGuardOwner = {
      role: 'lead',
      binding: {
        taskId: 't-1' as TaskId,
        sessionId: 's-1',
        profile: { digest: 'd' as Digest },
      },
    }
    auxiliary.tag(validRequest, { purpose: 'foreman', taskId: 't-1' as any, role: 'lead', sessionId: 's-1', profileDigest: 'd' as any })

    function makeTaggedRequest(patch: Record<string, any> = {}) {
      const req = { ...validRequest, ...patch }
      auxiliary.tag(req, { purpose: 'foreman', taskId: 't-1' as any, role: 'lead', sessionId: 's-1', profileDigest: 'd' as any })
      return req
    }

    const profileWithForeman: PairProfile = { ...baseProfile, foreman: foremanConfig }

    // Valid call passes
    expect(() => validateForemanGuardRequest(validRequest, profileWithForeman, auxiliary.get(validRequest), defaultOwner)).not.toThrow()

    // Throws if Foreman not configured in profile
    expect(() => validateForemanGuardRequest(validRequest, baseProfile, auxiliary.get(validRequest), defaultOwner))
      .toThrow('Foreman is not configured')

    // Throws without valid foreman tag
    expect(() => validateForemanGuardRequest(validRequest, profileWithForeman, undefined, defaultOwner))
      .toThrow('without valid foreman tag')

    // Throws if unowned
    expect(() => validateForemanGuardRequest(validRequest, profileWithForeman, auxiliary.get(validRequest), undefined))
      .toThrow('unowned auxiliary Foreman calls')

    // Throws if owner role is worker
    expect(() => validateForemanGuardRequest(validRequest, profileWithForeman, auxiliary.get(validRequest), { ...defaultOwner, role: 'worker' }))
      .toThrow('from non-lead owner')

    // Throws if tag role is not lead
    const reqWorkerTag = { ...validRequest }
    auxiliary.tag(reqWorkerTag, { purpose: 'foreman', taskId: 't-1' as any, role: 'worker', sessionId: 's-1', profileDigest: 'd' as any })
    expect(() => validateForemanGuardRequest(reqWorkerTag, profileWithForeman, auxiliary.get(reqWorkerTag), defaultOwner))
      .toThrow('Foreman tag has invalid role')

    // Throws if tag taskId does not match binding
    const reqWrongTask = { ...validRequest }
    auxiliary.tag(reqWrongTask, { purpose: 'foreman', taskId: 't-2' as any, role: 'lead', sessionId: 's-1', profileDigest: 'd' as any })
    expect(() => validateForemanGuardRequest(reqWrongTask, profileWithForeman, auxiliary.get(reqWrongTask), defaultOwner))
      .toThrow('taskId does not match binding')

    // Throws if tag sessionId does not match binding
    const reqWrongSession = { ...validRequest }
    auxiliary.tag(reqWrongSession, { purpose: 'foreman', taskId: 't-1' as any, role: 'lead', sessionId: 's-2', profileDigest: 'd' as any })
    expect(() => validateForemanGuardRequest(reqWrongSession, profileWithForeman, auxiliary.get(reqWrongSession), defaultOwner))
      .toThrow('sessionId does not match binding')

    // Throws if tag profileDigest does not match binding
    const reqWrongDigest = { ...validRequest }
    auxiliary.tag(reqWrongDigest, { purpose: 'foreman', taskId: 't-1' as any, role: 'lead', sessionId: 's-1', profileDigest: 'other-digest' as any })
    expect(() => validateForemanGuardRequest(reqWrongDigest, profileWithForeman, auxiliary.get(reqWrongDigest), defaultOwner))
      .toThrow('profileDigest does not match binding')

    // Throws if route diverges
    const reqWrongModel = makeTaggedRequest({ model: 'other-model' })
    expect(() => validateForemanGuardRequest(reqWrongModel, profileWithForeman, auxiliary.get(reqWrongModel), defaultOwner))
      .toThrow('diverged from configured Foreman route')

    // Throws if maxTokens diverges
    const reqWrongTokens = makeTaggedRequest({ maxTokens: 8000 })
    expect(() => validateForemanGuardRequest(reqWrongTokens, profileWithForeman, auxiliary.get(reqWrongTokens), defaultOwner))
      .toThrow('diverged from configured maxOutputTokens')

    // Throws if tools undefined
    const reqNoTools = makeTaggedRequest({ tools: undefined })
    expect(() => validateForemanGuardRequest(reqNoTools, profileWithForeman, auxiliary.get(reqNoTools), defaultOwner))
      .toThrow('must have empty tools')

    // Throws if tools non-empty
    const reqWithTools = makeTaggedRequest({ tools: [{ name: 'bash' }] })
    expect(() => validateForemanGuardRequest(reqWithTools, profileWithForeman, auxiliary.get(reqWithTools), defaultOwner))
      .toThrow('must have empty tools')
  })
})

describe('benchmark variant manifest honesty', () => {
  const route: PhysicalRoute = { provider: 'test-p', model: 'foreman-m' }
  const enabled = {
    schemaVersion: 1, id: 'p-1', version: '1', digest: 'd', enabled: true,
    lead: { provider: 'test-p', model: 'lead-m' }, worker: { provider: 'test-p', model: 'worker-m' },
    foreman: { route, maxOutputTokens: 2048, timeoutMs: 15000, policy: 'gate' as const },
    dataPolicyId: 'local',
  } as unknown as PairProfile

  it('records off for every non-fusion variant even when the profile enables the reviewer', () => {
    // Only the fusion variant mounts a plan-review seam; claiming a gate arm in a solo or
    // naive run would invent an experiment condition that never executed.
    for (const variant of ['lead_only', 'worker_only', 'worker_selfreview', 'naive'] as const) {
      expect(projectForemanManifest(enabled, variant)).toEqual({ condition: 'off' })
    }
    expect(projectForemanManifest(enabled, 'fusion')).toMatchObject({ condition: 'gate' })
  })

  it('keeps each selectable condition independently visible for fusion', () => {
    const withPolicy = (policy: 'shadow' | 'gate' | 'risk-gated') => ({ ...enabled,
      foreman: { ...enabled.foreman!, policy } }) as PairProfile
    expect(projectForemanManifest(withPolicy('shadow')).condition).toBe('shadow')
    expect(projectForemanManifest(withPolicy('gate')).condition).toBe('gate')
    expect(projectForemanManifest(withPolicy('risk-gated')).condition).toBe('risk-gated')
    expect(projectForemanManifest({ ...enabled, foreman: undefined } as PairProfile).condition).toBe('off')
  })
})
