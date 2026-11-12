/**
 * The built-in Antigravity route surface on a real Host.
 *
 * `tests/agy-routes.spec.ts` drives the registration logic against a cordis
 * double; this file mounts the production services the capability actually talks
 * to — the LLM registry, the command registry, the tool runtime and a listening
 * web server — and proves three things the double cannot:
 *
 *   1. the `/agy` command, the `antigravity` provider and the `/plugins/agy-worker/*`
 *      routes are accepted by the real registries (a duplicate would throw);
 *   2. they coexist with Fusion's own `/api/fusion` route on the same server;
 *   3. calling the disposer `installAgy` returns removes *all* of them, including
 *      the two reactive sub-fibers (`tools`, `webServer`) — the regression this
 *      file exists for.
 *
 * It never spawns `agy`: the binary is absent, so the capability stays dormant.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { installAgy } from '../src/host/agy/index.js'
import { AGY_API_PATH, FUSION_API_PATH } from '../src/identity.js'
import { hostPlugin } from './host-plugin.js'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

/** The web server surface this test reads, without widening the production seams. */
interface RouteServer {
  getOrigin: () => string
  register: (route: { kind: 'exact' | 'prefix'; path: string; handler: (req: unknown, res: unknown) => void }) => () => void
}

interface LLMRegistry {
  /** The live provider routes, as the model picker sees them. */
  listProviders: () => readonly { id: string }[]
}

interface CommandRegistry {
  register: (definition: { name: string; description: string; handler: () => unknown }) => () => void
}

interface ToolRegistry {
  get: (name: string) => unknown
  schemas: () => readonly { name: string }[]
}

/** Let the reactive sub-fibers (`tools`, `webServer`) finish their first activation. */
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

async function mountAgyHost(agyConfig: Record<string, unknown> = { enabled: true, agyBin: '/nonexistent/agy' }) {
  const home = mkdtempSync(join(tmpdir(), 'fusion-agy-native-'))
  const previousHome = process.env.DSH_HOME
  // A throwaway state root: the capability opens the session store and the pool
  // on install, and must never touch the real one from a test.
  process.env.DSH_HOME = home

  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx, { tools: { mode: 'native' } })
  await ctx.plugin(hostPlugin(CommandRuntime))
  await ctx.plugin(hostPlugin(WebServer), { host: '127.0.0.1', port: 0 })
  const server = ctx.get('webServer') as unknown as RouteServer

  // Fusion's own API route, mounted first: the AGY routes must coexist with it.
  const disposeFusionRoute = server.register({ kind: 'exact', path: FUSION_API_PATH, handler: (_req, res) => {
    (res as { writeHead: (status: number) => unknown }).writeHead(204)
    ;(res as { end: () => unknown }).end()
  } })
  let disposed = false
  const disposeAgy = installAgy(ctx, agyConfig)
  await settle()
  const close = async (): Promise<void> => {
    if (!disposed) {
      disposed = true
      disposeAgy()
    }
    disposeFusionRoute()
    await ctx.fiber.dispose()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
  cleanups.push(close)
  return { ctx, server, disposeAgy }
}

/** A second exact registration at `path` throws only while the first one is live. */
const exactPathIsOccupied = (server: RouteServer, path: string): boolean => {
  try {
    server.register({ kind: 'exact', path, handler: () => {} })()
    return false
  } catch (error) {
    return /duplicate exact route/.test(String(error))
  }
}

describe('built-in Antigravity on the real Host', () => {
  it('registers the provider route, the /agy command and the management routes', async () => {
    const { ctx, server } = await mountAgyHost()

    // The provider route is live in the real LLM registry, as the model picker reads it.
    const llm = ctx.get('llm') as unknown as LLMRegistry
    expect(llm.listProviders().map(provider => provider.id)).toContain('antigravity')

    // The `/agy` command is live in the real command registry.
    const commands = ctx.get('commands') as unknown as CommandRegistry
    let commandLive = false
    try {
      commands.register({ name: 'agy', description: 'probe', handler: () => undefined })()
    } catch (error) {
      commandLive = /already registered/.test(String(error))
    }
    expect(commandLive).toBe(true)

    // The status route the console polls is mounted, and so is Fusion's own route.
    expect(exactPathIsOccupied(server, `${AGY_API_PATH}/status`)).toBe(true)
    expect(exactPathIsOccupied(server, `${AGY_API_PATH}/config`)).toBe(true)
    expect(exactPathIsOccupied(server, FUSION_API_PATH)).toBe(true)
  })

  it('answers /plugins/agy-worker/status over HTTP, claiming the dsh-fusion identity', async () => {
    const { server } = await mountAgyHost()
    const response = await fetch(`${server.getOrigin()}${AGY_API_PATH}/status`)
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    // One plugin identity: the payload names this package, not the upstream one.
    expect(body.plugin).toBe('dsh-fusion')
    // Whatever `agy` resolves to on this machine is reported verbatim — the port
    // does not invent a version, and a missing binary stays `null`.
    expect(body.bin === null || typeof body.bin === 'string').toBe(true)
    expect(body.version === null || typeof body.version === 'string').toBe(true)
    expect(body.dormantReason === null || typeof body.dormantReason === 'string').toBe(true)
    for (const key of ['enabled', 'permissionMode', 'auth', 'poolAuth', 'pool', 'catalog', 'hiddenModels', 'lastRun']) {
      expect(body).toHaveProperty(key)
    }
  })

  it('registers the agy_tool mirror with the real tool runtime', async () => {
    const { ctx } = await mountAgyHost()
    const tools = ctx.get('tools') as unknown as ToolRegistry
    // The transport Fusion's route-transport.ts names must actually exist here.
    expect(tools.get('agy_tool')).toBeDefined()
  })

  it('removes every route, tool and sub-fiber the disposer owns', async () => {
    const { ctx, server, disposeAgy } = await mountAgyHost()
    expect(exactPathIsOccupied(server, `${AGY_API_PATH}/status`)).toBe(true)

    disposeAgy()

    // Routes gone — including the ones registered through the `webServer` sub-fiber.
    expect(exactPathIsOccupied(server, `${AGY_API_PATH}/status`)).toBe(false)
    expect(exactPathIsOccupied(server, `${AGY_API_PATH}/config`)).toBe(false)
    // Fusion's own route is not this capability's to remove.
    expect(exactPathIsOccupied(server, FUSION_API_PATH)).toBe(true)

    // The mirror tool and its pre-execute hook went with the `tools` sub-fiber.
    const tools = ctx.get('tools') as unknown as ToolRegistry
    expect(tools.get('agy_tool')).toBeUndefined()
  })

  it('installs nothing when the agy block disables the capability', async () => {
    const { ctx, server, disposeAgy } = await mountAgyHost({ enabled: false })

    // No provider route: the picker cannot offer Antigravity at all.
    const llm = ctx.get('llm') as unknown as LLMRegistry
    expect(llm.listProviders().map(provider => provider.id)).not.toContain('antigravity')

    // No mirror tool: nothing to replay agy steps through.
    const tools = ctx.get('tools') as unknown as ToolRegistry
    expect(tools.get('agy_tool')).toBeUndefined()

    // The management surface still answers — `/agy status` and these routes are how
    // a user inspects the dormant capability and its configuration. `enabled` is
    // resolved at install time, so turning it back on means restarting the Host
    // with a changed block; it is not a live switch (`/agy` and `/plugins/.../config`
    // do not accept it as a settable key).
    expect(exactPathIsOccupied(server, `${AGY_API_PATH}/status`)).toBe(true)
    const response = await fetch(`${server.getOrigin()}${AGY_API_PATH}/status`)
    expect(response.status).toBe(200)
    expect((await response.json() as { enabled?: boolean }).enabled).toBe(false)

    disposeAgy()
    expect(exactPathIsOccupied(server, `${AGY_API_PATH}/status`)).toBe(false)
  })
})
