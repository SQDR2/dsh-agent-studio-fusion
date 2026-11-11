/**
 * The ACP Sidekick bridge mounted on a real Host web server.
 *
 * `installAcp` registers exactly one route and resolves its endpoint from the Host's own
 * origin, so this test mounts the production `WebServer` on a loopback bind and drives the
 * mounted route over HTTP. It proves the wiring the unit tests stub: the origin accessor
 * exists and answers, the route is an `exact` registration at the bridge path, a real
 * request reaches the bridge (which refuses it without a capability), and disposing the
 * plugin removes exactly that route.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { installAcp } from '../src/host/acp/index.js'
import { ACP_MCP_PATH } from '../src/host/acp/bridge.js'
import { hostPlugin } from './host-plugin.js'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

/** The web server surface this test reads, without widening the production seams. */
interface OriginServer {
  getOrigin: () => string
  register: (route: { kind: 'exact' | 'prefix'; path: string; handler: (req: unknown, res: unknown) => void }) => () => void
}

async function mountBridgeHost() {
  const home = mkdtempSync(join(tmpdir(), 'fusion-acp-route-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx, { tools: { mode: 'native' } })
  await ctx.plugin(hostPlugin(WebServer), { host: '127.0.0.1', port: 0 })
  const server = ctx.get('webServer') as unknown as OriginServer
  const dispose = installAcp(ctx, { workerTools: ['read'], profiles: () => new Map(), coordinator: () => undefined })
  let disposed = false
  const close = async (): Promise<void> => {
    if (!disposed) {
      disposed = true
      dispose()
    }
    await ctx.fiber.dispose()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
  cleanups.push(close)
  return { server, dispose }
}

describe('ACP Sidekick bridge on the real Host web server', () => {
  it('resolves its endpoint from the Host origin and is mounted as an exact route', async () => {
    const { server } = await mountBridgeHost()
    const origin = server.getOrigin()
    // A real listener on a concrete loopback bind: the origin the plugin reads, not a guess.
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(origin.endsWith(':0')).toBe(false)
    // Exact registration: a second exact route at this path is a composition error, while a
    // prefix route at the same path is accepted — so only the exact one may throw.
    expect(() => server.register({ kind: 'exact', path: ACP_MCP_PATH, handler: () => {} }))
      .toThrow(/duplicate exact route/)
    const disposePrefix = server.register({ kind: 'prefix', path: ACP_MCP_PATH, handler: () => {} })
    disposePrefix()
  })

  it('serves the mounted endpoint over HTTP and refuses it without a capability', async () => {
    const { server } = await mountBridgeHost()
    const response = await fetch(`${server.getOrigin()}${ACP_MCP_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { error?: { code?: number } }
    // The bridge answered, and it refuses anything without a live Sidekick grant.
    expect(body.error).toMatchObject({ code: -32001 })
    // A suffix path is not this endpoint: the Host's own bare 404, not the bridge's handler.
    const suffix = await fetch(`${server.getOrigin()}${ACP_MCP_PATH}/token`, { method: 'POST' })
    expect(suffix.status).toBe(404)
    expect(await suffix.text()).toBe('')
  })

  it('removes exactly its route when the plugin is disposed', async () => {
    const { server, dispose } = await mountBridgeHost()
    dispose()
    // The path is free again, and only for the exact kind the plugin registered.
    const disposeExact = server.register({ kind: 'exact', path: ACP_MCP_PATH, handler: () => {} })
    const disposePrefix = server.register({ kind: 'prefix', path: ACP_MCP_PATH, handler: () => {} })
    disposeExact()
    disposePrefix()
  })
})
