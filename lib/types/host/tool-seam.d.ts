/**
 * Version-adaptive seam over the DSH tool runtime.
 *
 * `@deepseek-ai/dsh-tools` changed shape between the supported releases:
 *
 * | Concern | 0.2.1-rc.5 ... 0.2.1 | 0.2.2 |
 * | --- | --- | --- |
 * | Per-scope presentation | `ctx.tools.presentAs('native')` | removed; a scoped `ToolExecutor` is selected with `setExecutor()` |
 * | Model-facing tool table | carried in `system-prompt/assemble` | owned by the selected executor's `describe()` |
 * | Programmatic dispatch | `ctx.tools.execute(input)` runs ONE call | `ctx.tools.execute(batch)` runs a raw call batch |
 *
 * Fusion must not depend on the newer symbols at import time: this repository typechecks
 * against the published 0.2.0-rc.2 declarations, which declare neither `setExecutor` nor
 * the batch overload. Every newer capability is read structurally from the live service
 * and only the branch that actually exists is called. Detection is the presence of the
 * function, never a version string.
 */
import type { Context } from '@deepseek-ai/cordis';
/** One tool definition as an executor's `describe` receives it. */
export interface ToolDefinitionLike extends ToolSchemaLike {
    readonly output: unknown;
}
/** Model-facing tool schema as the 0.2.2 executor contract spells it. */
export interface ToolSchemaLike {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
    readonly deferLoading?: boolean;
}
/** Structural view of a canonical tool result (identical on both releases). */
export interface ToolExecutionOutcome {
    readonly isError: boolean;
    readonly content: readonly unknown[];
    readonly value?: unknown;
    readonly additionalContexts?: readonly unknown[];
}
/**
 * Structural view of `ctx.tools`. Optional members are the version markers:
 * `presentAs` is 0.2.1-only, `setExecutor` is 0.2.2-and-later.
 */
export interface ScopedToolService {
    presentAs?(mode: 'native' | 'ptc'): () => void;
    setExecutor?(executor: unknown): () => void;
    restrict?(filter: {
        allow?: readonly string[];
        deny?: readonly string[];
    }): () => void;
    guard?(guard: (exec: never) => string | undefined): () => void;
    get?(name: string): unknown;
    schemas?(scope?: unknown): readonly ToolSchemaLike[];
    execute?(input: unknown): Promise<unknown>;
}
/** One call Fusion dispatches programmatically (a frozen acceptance check, an ACP bridge call). */
export interface SingleToolCall {
    readonly name: string;
    readonly arguments: unknown;
    readonly agent: unknown;
    readonly callId: string;
    readonly signal: AbortSignal;
    /** 0.2.1-only nested-dispatch correlation. Ignored by the 0.2.2 batch contract. */
    readonly rootCallId?: string;
    readonly parent?: symbol;
}
/** The root call id an execution belongs to, for either release. */
export declare function rootCallIdOf(exec: {
    callId: string;
    rootCallId?: string;
}): string;
/** Whether this Host replaced `presentAs` with the scoped executor contract. */
export declare function usesToolExecutors(tools: ScopedToolService): boolean;
/**
 * Resolve the deployment's native executor once, before any Agent exists.
 *
 * The per-scope install below is synchronous (a step may assemble a prompt immediately),
 * so the optional package has to be resolved during plugin load. A 0.2.1 Host has no
 * executor contract at all and needs nothing; a 0.2.2 Host without the package keeps its
 * own selection and is told why, because Fusion cannot then narrow a role's table.
 * @param ctx - plugin context, used for the one warning.
 */
export declare function prepareToolSeam(ctx: Context): Promise<void>;
/**
 * Present one role's tools natively, narrowed to a ceiling that changes over its lifetime.
 *
 * 0.2.1 selects a presentation mode and applies the ceiling to the request table in the
 * `system-prompt/assemble` waterfall. Re-selecting is free there, so the caller keeps its
 * own disposer per ceiling.
 *
 * 0.2.2 replaced that with a per-scope executor whose `describe()` builds the table. Three
 * properties of that contract shape this function:
 *
 * - A restriction cannot stand in for it: restrictions never apply to the viewing scope's
 *   own registrations, and the tools a role ceiling narrows are exactly that (Fusion's own
 *   capabilities, a preset's `write`/`edit`).
 * - `setExecutor` may be called only once per scope, and it throws on a second call.
 * - Disposing it leaves the selection *unavailable* rather than restoring the previous one.
 *
 * Fusion installs and detaches its role scope repeatedly on one Agent (a model-menu switch
 * out of Fusion and back, a coordinator replacement). So the executor is registered exactly
 * once per Agent and kept for that Agent's whole lifetime, while the ceiling and the
 * ownership flag are swapped into it on each install. Detached, it is a pass-through.
 * @param agent - the Agent whose scope this is; the registration is keyed by the object.
 * @param scope - the Agent's own (scoped) context.
 * @param permit - the role's permitted names, or undefined when the role has no ceiling.
 * @param owned - whether Fusion currently owns this role's table.
 * @returns a function that detaches this install's ceiling; never unregisters the executor.
 */
export declare function installNativePresentation(agent: object, scope: Context, permit: () => readonly string[] | undefined, owned: () => boolean): (() => void) | undefined;
/**
 * Run one programmatic call through the guarded pipeline on either release.
 *
 * 0.2.1 takes the call itself; 0.2.2 takes a raw batch, where `arguments` is the model's
 * JSON string and the outcome is correlated by `callId`. `log` is deliberately omitted on
 * the batch path: neither release records `tool/call`/`tool/result` for a call Fusion
 * dispatches outside a model step, and passing it would invent root events.
 * @param tools - `ctx.tools`.
 * @param call - the single call to dispatch.
 * @returns its canonical settled result.
 */
export declare function executeSingleTool(tools: ScopedToolService, call: SingleToolCall): Promise<ToolExecutionOutcome>;
