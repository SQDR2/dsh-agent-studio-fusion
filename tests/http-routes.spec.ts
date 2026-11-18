import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { installExactRoutes } from '../src/host/http.js'
import { FUSION_API_PATH, LEGACY_FUSION_API_PATH } from '../src/identity.js'

interface Mounted { kind: string; path: string; handler: unknown }

/** Let a reactive sub-fiber finish its first activation. */
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

/**
 * The panel's routes are mounted through `ctx.inject(['webServer'])` because the
 * service can appear after this plugin loads on `dsh web`, and headless
 * compositions never provide it. The one-shot `ctx.get('webServer')` this
 * replaces registered nothing when it lost that race — the page then reported
 * "无法读取 Fusion 设置" while the Host logged no error at all.
 */
describe('exact routes follow the webServer service', () => {
  it('mounts when webServer appears later and leaves with it', async () => {
    const ctx = new Context()
    const routes: Mounted[] = []
    const handler = (): void => {}
    const disposeRoutes = installExactRoutes(ctx, [
      { path: FUSION_API_PATH, handler },
      { path: LEGACY_FUSION_API_PATH, handler },
    ])
    await settle()
    expect(routes).toEqual([])

    const server = {
      register(route: Mounted) {
        routes.push(route)
        return () => {
          const at = routes.indexOf(route)
          if (at >= 0) routes.splice(at, 1)
        }
      },
    }
    const disposeProvide = ctx.provide('webServer', server)
    await settle()
    expect(routes.map(route => route.path)).toEqual([FUSION_API_PATH, LEGACY_FUSION_API_PATH])
    expect(routes.every(route => route.kind === 'exact' && route.handler === handler)).toBe(true)

    // The routes belong to the injected sub-fiber: the service going away retires them.
    disposeProvide()
    await settle()
    expect(routes).toEqual([])

    disposeRoutes()
  })

  it('mounts at once when webServer is already active, and the disposer removes exactly its routes', async () => {
    const ctx = new Context()
    const routes: Mounted[] = []
    const disposeProvide = ctx.provide('webServer', {
      register(route: Mounted) {
        if (routes.some(mounted => mounted.kind === route.kind && mounted.path === route.path)) {
          throw new Error(`duplicate ${route.kind} route "${route.path}"`)
        }
        routes.push(route)
        return () => {
          const at = routes.indexOf(route)
          if (at >= 0) routes.splice(at, 1)
        }
      },
    })
    const disposeRoutes = installExactRoutes(ctx, [{ path: FUSION_API_PATH, handler: () => {} }])
    await settle()
    expect(routes.map(route => route.path)).toEqual([FUSION_API_PATH])

    // Removal is synchronous: a caller may mount the same path again right away
    // (the ACP bridge's dispose-and-remount test does), before the sub-fiber's
    // own asynchronous unload has run.
    disposeRoutes()
    expect(routes).toEqual([])
    const live = ctx.get('webServer') as unknown as { register: (route: Mounted) => () => void }
    expect(() => live.register({ kind: 'exact', path: FUSION_API_PATH, handler: () => {} })).not.toThrow()
    await settle()
    disposeProvide()
  })

  it('stays dormant in a composition that never provides webServer', async () => {
    const ctx = new Context()
    const disposeRoutes = installExactRoutes(ctx, [{ path: FUSION_API_PATH, handler: () => {} }])
    await settle()
    expect(() => disposeRoutes()).not.toThrow()
  })
})