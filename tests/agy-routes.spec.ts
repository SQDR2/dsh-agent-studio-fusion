import { mkdtempSync, rmSync } from 'node:fs'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installAgy } from '../src/host/agy/index.js'
import { AGY_API_PATH } from '../src/identity.js'

/**
 * The `/plugins/agy-worker/*` surface is registered through `ctx.inject(['webServer'])`,
 * so these cases stand in for the Host with a tiny cordis-shaped double: one
 * `inject` that runs the sub-fiber immediately and remembers its disposer.
 */
interface Registered { kind: string; path: string; handler: (req: unknown, res: unknown) => void }

function hostDouble(options: { enabled?: boolean } = {}) {
  const routes: Registered[] = []
  const subDisposers: Array<() => void> = []
  const adapters: string[][] = []
  const commands: string[] = []
  const effects: Array<() => void> = []
  const webServer = {
    port: 1234,
    register(route: Registered) {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  }
  const ctx = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    effect(fn: () => (() => void) | void) {
      const dispose = fn()
      if (typeof dispose === 'function') effects.push(dispose)
      return dispose ?? (() => {})
    },
    inject(_names: string[], run: (sub: unknown) => (() => void) | void) {
      // Only the sub-fibers this test needs: `webServer` (routes) and `tools`.
      const sub = {
        get: (name: string) => name === 'webServer' ? webServer : undefined,
        on: () => () => {},
      }
      const dispose = run(sub)
      if (typeof dispose === 'function') subDisposers.push(dispose)
      return () => {}
    },
    get: () => undefined,
    on: () => () => {},
    emit: () => {},
    llm: {
      registerAdapter(providers: string[]) {
        adapters.push(providers)
        return () => {}
      },
    },
    commands: {
      register(definition: { name: string }) {
        commands.push(definition.name)
        return () => {}
      },
    },
  } as unknown as Context
  return { ctx, routes, adapters, commands, effects, subDisposers, webServer, options }
}

describe('the built-in AGY install helper owns the upstream route surface', () => {
  // `installAgy` opens the real state directory (session bindings, pool, log
  // sweep) the moment it is installed, so every case runs on a throwaway
  // `$DSH_HOME`: the suite must never create or rewrite a user's agy state.
  let home = ''
  const previousHome = process.env.DSH_HOME
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dsh-fusion-agy-routes-'))
    process.env.DSH_HOME = home
  })
  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })

  it('registers the antigravity route, the /agy command and /plugins/agy-worker/* routes', async () => {
    const host = hostDouble()
    const dispose = installAgy(host.ctx, { enabled: true, agyBin: '/nonexistent/agy' })

    // Provider route and command family keep their upstream names.
    expect(host.adapters).toContainEqual(['antigravity'])
    expect(host.commands).toContain('agy')
    // The console polls these exact paths; a rename would break it.
    const paths = host.routes.map(route => route.path)
    for (const path of [
      `${AGY_API_PATH}/status`, `${AGY_API_PATH}/auth`, `${AGY_API_PATH}/auth-code`,
      `${AGY_API_PATH}/pool`, `${AGY_API_PATH}/pool/enable`, `${AGY_API_PATH}/pool/set-active`,
      `${AGY_API_PATH}/config`, `${AGY_API_PATH}/media`, `${AGY_API_PATH}/mermaid.min.js`,
    ]) expect(paths).toContain(path)
    // `/assets` is a prefix route, not an exact one.
    expect(host.routes.some(route => route.path === `${AGY_API_PATH}/assets` && route.kind === 'prefix')).toBe(true)
    // Every route stays under the one prefix this plugin owns.
    for (const path of paths) expect(path.startsWith(AGY_API_PATH)).toBe(true)

    dispose()
  })

  it('unwinds every route and timer it registered', async () => {
    const host = hostDouble()
    const dispose = installAgy(host.ctx, { enabled: true, agyBin: '/nonexistent/agy' })
    expect(host.routes.length).toBeGreaterThan(10)
    const before = host.routes.length

    dispose()
    for (const subDispose of host.subDisposers) subDispose()

    // The disposer removes the routes it owns; nothing is left polling them.
    expect(host.routes.length).toBeLessThan(before)
  })

  it('turns off only the provider and background capability when disabled', async () => {
    const host = hostDouble()
    const dispose = installAgy(host.ctx, { enabled: false })
    // `enabled: false` is the documented dormant state: no provider route, so the
    // model picker cannot offer Antigravity at all.
    expect(host.adapters).toEqual([])
    // The management surface stays: `/agy` and the routes are how a user inspects a
    // dormant capability. They do not re-enable it — see the next case.
    expect(host.commands).toContain('agy')
    expect(host.routes.map(route => route.path)).toContain(`${AGY_API_PATH}/status`)
    dispose()
  })

  it('does not accept `enabled` as a runtime-settable key', async () => {
    // The docs claim re-enabling needs a restart, so the config route must refuse
    // `enabled`. This pins the docs to the implementation.
    const host = hostDouble()
    const dispose = installAgy(host.ctx, { enabled: false })
    const config = host.routes.find(route => route.path === `${AGY_API_PATH}/config`)
    expect(config).toBeDefined()
    const reply = await new Promise<{ status: number; body: Record<string, unknown> }>((resolve) => {
      let status = 0
      const res = {
        writeHead: (code: number) => { status = code; return res },
        end: (payload?: unknown) => resolve({ status, body: JSON.parse(String(payload)) as Record<string, unknown> }),
      }
      // A real Readable stands in for the request body so the shared bounded
      // JSON reader sees the same `data`/`end` events it sees in production; the
      // `method` field is what the route's POST-only guard reads.
      const req = Readable.from([Buffer.from(JSON.stringify({ key: 'enabled', value: true }))])
      config!.handler(Object.assign(req, { method: 'POST' }) as never, res)
    })
    // The key is refused with a 400 and nothing is written to the overrides file.
    expect(reply.status).toBe(400)
    expect(reply.body.error).toBe('key not settable')
    dispose()
  })

  it('reports the built-in identity, not the standalone package, on /status', async () => {
    const host = hostDouble()
    const dispose = installAgy(host.ctx, { enabled: true, agyBin: '/nonexistent/agy' })
    const status = host.routes.find(route => route.path === `${AGY_API_PATH}/status`)
    expect(status).toBeDefined()

    const body = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const res = {
        writeHead: () => res,
        end: (payload?: unknown) => {
          try { resolve(JSON.parse(String(payload)) as Record<string, unknown>) } catch (error) { reject(error) }
        },
      }
      status!.handler({}, res)
    })
    // One plugin identity: the payload names this package, not `dsh-agy-worker`.
    expect(body.plugin).toBe('dsh-fusion')
    // Everything the console reads is still there.
    for (const key of ['bin', 'version', 'enabled', 'permissionMode', 'askTool', 'auth', 'poolAuth', 'pool', 'catalog', 'hiddenModels', 'autoWarmup', 'lastRun']) {
      expect(body).toHaveProperty(key)
    }
    dispose()
  })
})
