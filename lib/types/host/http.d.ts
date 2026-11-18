import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/** One route handler, as the Host's web server hands it a request. */
export type ExactRoute = {
    readonly path: string;
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void;
};
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
export declare function installExactRoutes(ctx: Context, routes: readonly ExactRoute[]): () => void;
export declare function trustedRequest(req: IncomingMessage): boolean;
export declare function json(res: ServerResponse, status: number, body: unknown): void;
export declare function readJson(req: IncomingMessage): Promise<Record<string, unknown>>;
