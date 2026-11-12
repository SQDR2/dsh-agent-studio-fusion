import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/host/agy/config.js'
import { defaultConfig, isAccountScopedFailure, looksLikeAuthFailure, looksLikeNetworkError } from '../src/host/agy/types.js'
import type { PluginConfig } from '../src/host/agy/types.js'
import { buildMirrorRunCode, MIRROR_TOOL_NAME, WRAPPER_TOOL_NAME } from '../src/host/agy/mirror-tool.js'
import { mergeFallbackFamilyQuota } from '../src/host/agy/quota.js'

/**
 * `Config.agy` is the same layered config the standalone `dsh-agy-worker` entry
 * carried. These cases pin the behaviours a Fusion user relies on: the Sidekick
 * requirements, the provider-route defaults, and the two route facts Fusion's
 * `route-transport.ts` already names.
 */
describe('Config.agy keeps the standalone plugin config surface', () => {
  it('installs nothing when the block disables the capability', () => {
    const config = resolveConfig({ enabled: false }, {}, {})
    // `enabled: false` is the documented opt-out: no adapter, no /agy command,
    // no mirror tool and no background timers.
    expect(config.enabled).toBe(false)
    expect(resolveConfig({}, { DSH_AGY_ENABLED: 'false' }, {}).enabled).toBe(false)
  })

  it('keeps the Sidekick requirements the route needs: mcpBridge on, permissionMode skip', () => {
    const config = defaultConfig()
    expect(config.mcpBridge).toBe(true)
    expect(config.permissionMode).toBe('skip')
    // The bridge falls over to no-bridge only by an explicit opt-out.
    expect(resolveConfig({ mcpBridge: false }, {}, {}).mcpBridge).toBe(false)
  })

  it('keeps the provider route and its transport tool named as Fusion expects', () => {
    // src/host/route-transport.ts maps `antigravity` -> `agy_tool`; both names are
    // produced by the ported host half and must not drift.
    expect(MIRROR_TOOL_NAME).toBe('agy_tool')
    expect(WRAPPER_TOOL_NAME).toBe('run_code')
  })

  it('builds the exact wrapper the run_code view recognizes', () => {
    const generated = buildMirrorRunCode('run-9', 3, 'run_command')
    expect(generated.code).toBe(
      '// dsh-agy-worker mirror: replay recorded agy tool step 3 (run_command)\n' +
      "return await tools['agy_tool']({\"run\":\"run-9\",\"step\":3})")
    // The brief becomes the row's human preview; without one the tool name does.
    expect(generated.description).toBe('run_command')
    expect(buildMirrorRunCode('run-9', 3, 'run_command', 'List files').description).toBe('List files · run_command')
  })

  it('keeps auxiliary calls opt-out-able and long-tool idle handling', () => {
    const config: PluginConfig = resolveConfig({ allowAuxiliary: false, longToolIdleMinutes: 30 }, {}, {})
    expect(config.allowAuxiliary).toBe(false)
    expect(config.longToolIdleMinutes).toBe(30)
  })

  it('keeps telemetry off by default and the quota poll clamped by env', () => {
    expect(defaultConfig().disableTelemetry).toBe(true)
    // A sub-minute poll would be a rate-limit risk; the resolver refuses it.
    expect(resolveConfig({}, { DSH_AGY_QUOTA_POLL_INTERVAL_MS: '1000' }, {}).quotaPollIntervalMs)
      .toBe(defaultConfig().quotaPollIntervalMs)
    expect(resolveConfig({}, { DSH_AGY_QUOTA_POLL_INTERVAL_MS: '120000' }, {}).quotaPollIntervalMs).toBe(120_000)
  })
})

describe('the ported route error vocabulary is unchanged', () => {
  it('still separates an account-scoped failure from a request-level one', () => {
    expect(isAccountScopedFailure('RATE_LIMIT')).toBe(true)
    expect(isAccountScopedFailure('AUTH')).toBe(true)
    expect(isAccountScopedFailure('AGY_ERROR')).toBe(false)
  })

  it('still refuses to read a transport blip as a dead login', () => {
    expect(looksLikeAuthFailure('Please sign in to Antigravity')).toBe(true)
    expect(looksLikeNetworkError('Post "…/loadCodeAssist": EOF')).toBe(true)
  })
})

describe('the ported quota merge keeps last-known-good data', () => {
  it('never lets a partial fallback overwrite a complete family entry', () => {
    const complete = { remainingFraction: 0.8, weeklyFraction: 0.5, resetTime: '2030-01-01T00:00:00Z' }
    const partial = { remainingFraction: 0.1 }
    expect(mergeFallbackFamilyQuota(complete, partial)).toMatchObject({ remainingFraction: 0.8, weeklyFraction: 0.5 })
  })
})
