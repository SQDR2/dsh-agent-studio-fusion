import type { Context } from '@deepseek-ai/cordis';
/** The standalone plugin's ids, kept only for route/state compatibility. */
export { PROVIDER_ID } from './types.js';
/** Registry/diagnostic tag; the HTTP route prefix stays `/plugins/agy-worker`. */
export declare const AGY_LOG_TAG = "[dsh-fusion/agy] ";
/**
 * Install the built-in AGY capability into an existing dsh-fusion context.
 *
 * `entryConfig` is this plugin's `agy` subconfig (`config.agy`); the layered
 * resolver still gives env and the runtime overrides file precedence. Returns
 * the disposer that unwinds every effect registered here.
 */
export declare function installAgy(ctx: Context, entryConfig?: Record<string, unknown>): () => void;
