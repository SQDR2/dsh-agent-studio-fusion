/**
 * Registering the ACP bridge's HTTP endpoint on the Host web server.
 *
 * The MCP Streamable HTTP transport needs one route the ACP agent can POST JSON-RPC to.
 * It is a prefix route so the per-session token rides in the path; the bridge itself
 * authenticates every request and refuses anything that is not a live Sidekick grant.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

export type AcpBridgeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Mount `handler` under `path`; the disposer removes exactly this route. */
export function installAcpBridgeRoute(ctx: Context, path: string, handler: AcpBridgeHandler): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path,
    handler: (req, res) => {
      void handler(req, res).catch((error: unknown) => {
        if (!res.writableEnded) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    },
  })
}
