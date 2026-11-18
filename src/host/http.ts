import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** One route handler, as the Host's web server hands it a request. */
export type ExactRoute = {
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void
}

/** The one web-server method these mount points need: `register` on an exact path. */
interface WebServerLike {
  register(spec: { kind: 'exact'; path: string; handler: ExactRoute['handler'] }): () => void
}

/**
 * Mount exact HTTP routes as soon as the Host provides `webServer`.
 *
 * The service is deliberately absent from this plugin's `inject`: headless
 * compositions (multica/stdio) never provide it, and on `dsh web` it can become
 * active *after* this plugin loads (load-order race). A one-shot
 * `ctx.get('webServer')` registered nothing in either case and never retried, so
 * the panel's own `/api/fusion` requests fell through to the `/api` transport
 * prefix and the page reported "无法读取 Fusion 设置" with no Host-side error.
 * A reactive sub-fiber starts whenever the service appears, and its routes go
 * away with it. The returned disposer removes its routes synchronously: callers
 * that dispose a plugin and immediately mount the same path again (the ACP
 * bridge test does exactly that) must not hit a duplicate-route error while the
 * sub-fiber's own unload is still pending.
 * @param ctx - the plugin context that owns the sub-fiber.
 * @param routes - exact paths and their handlers.
 * @returns a disposer that retires the sub-fiber and every route it mounted.
 */
export function installExactRoutes(ctx: Context, routes: readonly ExactRoute[]): () => void {
  const mounted = new Set<() => void>()
  const removeMounted = (): void => {
    for (const dispose of [...mounted]) {
      mounted.delete(dispose)
      try { dispose() } catch { /* the route table may already be gone */ }
    }
  }
  const fiber = ctx.inject(['webServer'], ((sub: Context) => {
    const webServer = sub.get('webServer') as WebServerLike | undefined
    if (!webServer) return
    for (const route of routes) {
      mounted.add(webServer.register({ kind: 'exact', path: route.path, handler: route.handler }))
    }
    // The sub-fiber owns the routes while it lives: a withdrawn webServer (or a
    // reload) takes them down instead of leaving stale handlers behind.
    sub.effect(() => () => { removeMounted() })
  }) as never) as unknown as { dispose: () => Promise<void> }
  return () => { removeMounted(); void fiber.dispose() }
}

export function trustedRequest(req: IncomingMessage): boolean {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) return false
  if (req.headers['sec-fetch-site'] === 'cross-site' || !req.headers.host) return false
  try {
    const target = new URL(`http://${req.headers.host}`)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) return false
    return !req.headers.origin || new URL(req.headers.origin).host === target.host
  } catch { return false }
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(body))
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new Error('JSON content type required')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 256 * 1024) throw new Error('Request body exceeds 256 KiB')
    chunks.push(Buffer.from(chunk))
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required')
  return value as Record<string, unknown>
}
