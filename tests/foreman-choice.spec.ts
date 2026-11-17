import { describe, expect, it } from 'vitest'
import { FOREMAN_MAX_OUTPUT_TOKENS, FOREMAN_TIMEOUT_MS, foremanChoice } from '../src/profile/foreman.js'

const route = { provider: 'physical', model: 'audit' }
const valid = { route, maxOutputTokens: 4096, timeoutMs: 30_000 }

describe('foreman configuration validation', () => {
  it('reads a well-formed foreman', () => {
    expect(foremanChoice(valid)).toEqual(valid)
    expect(foremanChoice(undefined)).toBeUndefined()
    // A reasoning effort travels with the route, as it does for the other roles.
    expect(foremanChoice({ ...valid, route: { ...route, reasoningEffort: 'high' } })?.route)
      .toEqual({ ...route, reasoningEffort: 'high' })
  })

  // One combined sentence listing model, output limit and timeout left the user
  // guessing which of the three was rejected: a save failed and the page could not
  // say that the timeout alone was out of range.
  it('names the field that is out of range, with the value it received', () => {
    expect(() => foremanChoice({ ...valid, maxOutputTokens: 0 })).toThrow('工长输出上限')
    expect(() => foremanChoice({ ...valid, maxOutputTokens: 0 })).toThrow('0')
    expect(() => foremanChoice({ ...valid, maxOutputTokens: FOREMAN_MAX_OUTPUT_TOKENS + 1 })).toThrow('工长输出上限')
    expect(() => foremanChoice({ ...valid, timeoutMs: 1 })).toThrow('工长超时')
    expect(() => foremanChoice({ ...valid, timeoutMs: 1 })).toThrow('1')
    expect(() => foremanChoice({ ...valid, timeoutMs: FOREMAN_TIMEOUT_MS.max + 1 })).toThrow('工长超时')
    // A missing model is its own message, not a restatement of every bound.
    expect(() => foremanChoice({ ...valid, route: { provider: '', model: '' } })).toThrow('请为工长选择模型')
    expect(() => foremanChoice({ ...valid, extra: true })).toThrow()
  })

  // A combo saved while the reviewer had a policy still carries one. Reading it must
  // keep the Foreman (now unconditional) instead of dropping it as an unknown field,
  // which would silently switch plan review off for every existing installation.
  it('keeps a stored Foreman that still carries the retired policy key', () => {
    const stored = { ...valid, policy: 'risk-gated' }
    expect(foremanChoice(stored)).toEqual(valid)
    expect(foremanChoice(stored)).not.toHaveProperty('policy')
  })

  // The bound has to admit a review that a slow model and a large plan need: five
  // minutes is a normal setting and must not be refused.
  it('accepts a multi-minute review timeout', () => {
    expect(foremanChoice({ ...valid, timeoutMs: 300_000 })?.timeoutMs).toBe(300_000)
    expect(foremanChoice({ ...valid, timeoutMs: FOREMAN_TIMEOUT_MS.max })?.timeoutMs).toBe(FOREMAN_TIMEOUT_MS.max)
    expect(FOREMAN_TIMEOUT_MS.max).toBeGreaterThanOrEqual(300_000)
  })
})
