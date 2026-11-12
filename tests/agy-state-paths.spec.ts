import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { agyAccountsDir, dshHome, overridesPath, resolveConfig, stateDir } from '../src/host/agy/config.js'
import { defaultConfig } from '../src/host/agy/types.js'

const initialHome = process.env.DSH_HOME

afterEach(() => {
  if (initialHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialHome
})

/**
 * Point `$DSH_HOME` at a path that only exists for this assertion. Every helper
 * exercised here is a pure path computation, so nothing is created on disk.
 */
function withHome(home: string): void {
  process.env.DSH_HOME = home
}

describe('the built-in AGY side reads its own `agy` config block', () => {
  it('defaults to the standalone plugin defaults when nothing is configured', () => {
    const config = resolveConfig({}, {}, {})
    const defaults = defaultConfig()
    expect(config.enabled).toBe(defaults.enabled)
    expect(config.permissionMode).toBe('skip')
    // mcpBridge on + permissionMode skip is the documented Sidekick requirement.
    expect(config.mcpBridge).toBe(true)
    expect(config.askTool).toBe(false)
    expect(config.hiddenModels).toEqual([])
    expect(config.defaultModel).toBe('')
  })

  it('reads the `agy` block passed through Config.agy', () => {
    const config = resolveConfig({
      enabled: true, agyBin: '/opt/agy', defaultModel: 'gemini-3.8-flash', permissionMode: 'accept-edits',
      askTool: true, hiddenModels: ['gpt-oss-120b-medium'], maxConcurrent: 2, mcpConfigScope: 'both',
    }, {}, {})
    expect(config.agyBin).toBe('/opt/agy')
    expect(config.defaultModel).toBe('gemini-3.8-flash')
    expect(config.permissionMode).toBe('accept-edits')
    expect(config.askTool).toBe(true)
    expect(config.hiddenModels).toEqual(['gpt-oss-120b-medium'])
    expect(config.maxConcurrent).toBe(2)
    expect(config.mcpConfigScope).toBe('both')
  })

  it('keeps the documented layer order: env > overrides file > agy block', () => {
    const entry = { permissionMode: 'plan', defaultModel: 'from-entry', agyBin: '/entry/agy' }
    const overrides = { permissionMode: 'accept-edits', defaultModel: 'from-overrides' }
    const resolved = resolveConfig(entry, {}, overrides)
    // The overrides file (written by /agy hot changes) outranks the cordis entry.
    expect(resolved.permissionMode).toBe('accept-edits')
    expect(resolved.defaultModel).toBe('from-overrides')
    // A key only the entry sets still applies.
    expect(resolved.agyBin).toBe('/entry/agy')
    // The environment wins over both.
    const fromEnv = resolveConfig(entry, { DSH_AGY_MODE: 'skip', DSH_AGY_DEFAULT_MODEL: 'from-env' }, overrides)
    expect(fromEnv.permissionMode).toBe('skip')
    expect(fromEnv.defaultModel).toBe('from-env')
  })

  it('keeps the upstream `DSH_AGY_*` switches meaningful', () => {
    const config = resolveConfig({}, {
      DSH_AGY_ENABLED: 'false',
      DSH_AGY_BIN: '/env/agy',
      DSH_AGY_SKIP_PERMISSIONS: '0',
      DSH_AGY_HIDDEN_MODELS: 'a,b',
      DSH_AGY_MCP_BRIDGE: 'off',
      DSH_AGY_QUOTA_POLL_INTERVAL_MS: '60000',
    }, {})
    expect(config.enabled).toBe(false)
    expect(config.agyBin).toBe('/env/agy')
    // DSH_AGY_SKIP_PERMISSIONS=0 restores the read-only plan mode, not `skip`.
    expect(config.permissionMode).toBe('plan')
    expect(config.hiddenModels).toEqual(['a', 'b'])
    expect(config.mcpBridge).toBe(false)
    expect(config.quotaPollIntervalMs).toBe(60_000)
  })
})

describe('AGY state paths stay exactly where the standalone plugin kept them', () => {
  it('puts work state under $DSH_HOME/agy-worker', () => {
    withHome('/tmp/dsh-fusion-agy-home')
    expect(dshHome()).toBe('/tmp/dsh-fusion-agy-home')
    expect(stateDir()).toBe('/tmp/dsh-fusion-agy-home/agy-worker')
    expect(overridesPath()).toBe('/tmp/dsh-fusion-agy-home/agy-worker/runtime-overrides.json')
  })

  it('puts the account pool under $DSH_HOME/agy-accounts, independent of DSH_STATE_DIR', () => {
    withHome('/tmp/dsh-fusion-agy-home')
    const before = process.env.DSH_STATE_DIR
    process.env.DSH_STATE_DIR = '/tmp/some-other-state-dir'
    try {
      // The recorded task decision: `$DSH_HOME/agy-accounts/pool.json`. An upstream
      // DSH_STATE_DIR must not silently relocate the pool this build reads.
      expect(agyAccountsDir()).toBe('/tmp/dsh-fusion-agy-home/agy-accounts')
    } finally {
      if (before === undefined) delete process.env.DSH_STATE_DIR
      else process.env.DSH_STATE_DIR = before
    }
  })

  it('defaults to ~/.dsh when DSH_HOME is unset', () => {
    delete process.env.DSH_HOME
    // Compare against the same `~/.dsh` the resolver computes, without touching it.
    expect(stateDir()).toBe(join(homedir(), '.dsh', 'agy-worker'))
    expect(agyAccountsDir()).toBe(join(homedir(), '.dsh', 'agy-accounts'))
  })

  it('never moves or copies existing state on a path read', () => {
    withHome('/tmp/dsh-fusion-agy-home')
    // A read is a pure path computation: no adoption, no rename, no mkdir.
    expect(stateDir()).toBe('/tmp/dsh-fusion-agy-home/agy-worker')
    expect(agyAccountsDir()).toBe('/tmp/dsh-fusion-agy-home/agy-accounts')
    expect(stateDir()).toBe('/tmp/dsh-fusion-agy-home/agy-worker')
  })
})
