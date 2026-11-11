/**
 * Registering the ACP bridge's HTTP endpoint on the Host web server.
 *
 * The MCP Streamable HTTP transport needs one route the ACP agent can POST JSON-RPC to.
 * It is a prefix route so the per-session token rides in the path; the bridge itself
 * authenticates every request and refuses anything that is not a live Sidekick grant.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { IncomingMessage, ServerResponse } from 'node:http';
export type AcpBridgeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
/** Mount `handler` under `path`; the disposer removes exactly this route. */
export declare function installAcpBridgeRoute(ctx: Context, path: string, handler: AcpBridgeHandler): () => void;
