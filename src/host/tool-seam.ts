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

import type { Context } from '@deepseek-ai/cordis'

/** Structural constructor of the 0.2.2 native executor. */
type NativeExecutorConstructor = new (ctx: Context) => ExecutorLike

/** The executor members Fusion reads; `describe` owns the model-facing table. */
interface ExecutorLike {
  readonly sections?: readonly unknown[]
  describe(tools: readonly ToolDefinitionLike[]): { readonly schemas: readonly ToolSchemaLike[] }
  execute(input: unknown): Promise<unknown>
}

/** One tool definition as an executor's `describe` receives it. */
export interface ToolDefinitionLike extends ToolSchemaLike {
  readonly output: unknown
}

/**
 * The deployment's native executor constructor, when this Host ships one.
 *
 * A static import would bind the plugin to a package that does not exist on 0.2.1. The
 * specifier is a literal so the bundler can see and externalize it, and a Host that has no
 * such package answers `undefined`, which leaves every branch below inert.
 */
async function resolveNativeExecutor(): Promise<NativeExecutorConstructor | undefined> {
  try {
    const module = await import('@deepseek-ai/dsh-tool-executor-native') as { NativeToolExecutor?: NativeExecutorConstructor }
    return typeof module.NativeToolExecutor === 'function' ? module.NativeToolExecutor : undefined
  } catch { return undefined }
}

let nativeExecutor: NativeExecutorConstructor | undefined

/**
 * Resolution starts at module load, not at plugin load.
 *
 * Scope installation is synchronous and can happen through any composition that mounts
 * this plugin's parts directly (Fusion's own coordinator tests do exactly that), so the
 * executor must be in hand by the time the first Agent installs a role — not merely by the
 * time `apply()` finishes.
 */
const executorReady: Promise<void> = resolveNativeExecutor().then((Native) => { nativeExecutor = Native })

/** Model-facing tool schema as the 0.2.2 executor contract spells it. */
export interface ToolSchemaLike {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly deferLoading?: boolean
}

/** Structural view of a canonical tool result (identical on both releases). */
export interface ToolExecutionOutcome {
  readonly isError: boolean
  readonly content: readonly unknown[]
  readonly value?: unknown
  readonly additionalContexts?: readonly unknown[]
}

/**
 * Structural view of `ctx.tools`. Optional members are the version markers:
 * `presentAs` is 0.2.1-only, `setExecutor` is 0.2.2-and-later.
 */
export interface ScopedToolService {
  presentAs?(mode: 'native' | 'ptc'): () => void
  setExecutor?(executor: unknown): () => void
  restrict?(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
  guard?(guard: (exec: never) => string | undefined): () => void
  get?(name: string): unknown
  schemas?(scope?: unknown): readonly ToolSchemaLike[]
  execute?(input: unknown): Promise<unknown>
}

/** One call Fusion dispatches programmatically (a frozen acceptance check, an ACP bridge call). */
export interface SingleToolCall {
  readonly name: string
  readonly arguments: unknown
  readonly agent: unknown
  readonly callId: string
  readonly signal: AbortSignal
  /** 0.2.1-only nested-dispatch correlation. Ignored by the 0.2.2 batch contract. */
  readonly rootCallId?: string
  readonly parent?: symbol
}

/**
 * Which enclosing model call a Fusion-dispatched check belongs to.
 *
 * 0.2.1 carries this as the call's own `parent`/`rootCallId`, so every observer reads it
 * straight off the execution. 0.2.2's batch contract has no nested-dispatch concept at all:
 * the check arrives as a root call and records itself as one. Fusion still needs the
 * enclosing call — it is how an approval, an effect and a review receipt prove which model
 * turn caused them — so the correlation is kept here, keyed by the exact call id Fusion
 * generated, and {@link rootCallIdOf} answers it on both releases.
 */
const enclosingRoot = new Map<string, string>()

/** The root call id an execution belongs to, for either release. */
export function rootCallIdOf(exec: { callId: string; rootCallId?: string }): string {
  return enclosingRoot.get(exec.callId) ?? exec.rootCallId ?? exec.callId
}

/** Whether this Host replaced `presentAs` with the scoped executor contract. */
export function usesToolExecutors(tools: ScopedToolService): boolean {
  return typeof tools.setExecutor === 'function'
}

/**
 * Resolve the deployment's native executor once, before any Agent exists.
 *
 * The per-scope install below is synchronous (a step may assemble a prompt immediately),
 * so the optional package has to be resolved during plugin load. A 0.2.1 Host has no
 * executor contract at all and needs nothing; a 0.2.2 Host without the package keeps its
 * own selection and is told why, because Fusion cannot then narrow a role's table.
 * @param ctx - plugin context, used for the one warning.
 */
export async function prepareToolSeam(ctx: Context): Promise<void> {
  const tools = ctx.tools as unknown as ScopedToolService
  if (!usesToolExecutors(tools)) return
  await executorReady
  if (nativeExecutor === undefined) {
    ctx.logger.warn('dsh-agent-studio-fusion: this Host exposes scoped tool executors but no @deepseek-ai/dsh-tool-executor-native; Fusion roles keep the deployment tool table')
  }
}

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
export function installNativePresentation(
  agent: object,
  scope: Context,
  permit: () => readonly string[] | undefined,
  owned: () => boolean,
): (() => void) | undefined {
  const tools = scope.tools as unknown as ScopedToolService
  if (typeof tools.presentAs === 'function') return tools.presentAs('native')
  if (typeof tools.setExecutor !== 'function') return undefined
  const standing = executors.get(agent)
  if (standing !== undefined) {
    standing.install(permit, owned)
    return () => standing.release()
  }
  const Native = nativeExecutor
  if (Native === undefined) {
    scope.logger.warn('dsh-agent-studio-fusion: no native tool executor is available on this Host, so Fusion roles keep the deployment tool table')
    return undefined
  }
  const wrapped = new RestrictedExecutor(new Native(scope))
  const handle = new ExecutorHandle(wrapped, tools.setExecutor(wrapped))
  executors.set(agent, handle)
  handle.install(permit, owned)
  return () => handle.release()
}

/**
 * The one executor registration each Agent keeps for its lifetime.
 *
 * Keyed by the Agent OBJECT, not its durable id: two Agents can share an id (a resumed
 * session replaces the object) while owning different scopes, and the executor is bound to
 * the scope it was constructed in. Keying by id would hand one Agent's executor — and its
 * stale ceiling stack — to an unrelated Scope-less namesake.
 */
const executors = new WeakMap<object, ExecutorHandle>()

/**
 * Owns one Agent's executor registration and the ceiling currently layered on it.
 *
 * Several role scopes can be installed and detached over one Agent's life, but only one
 * registration may exist. This keeps that registration and treats `install`/`release` as a
 * stack, so a detach that races a replacement cannot leave the wrong ceiling in force.
 */
class ExecutorHandle {
  private layers: { permit: () => readonly string[] | undefined; owned: () => boolean }[] = []

  constructor(
    private readonly executor: RestrictedExecutor,
    private readonly disposer: () => void,
  ) {
    this.executor.bind(() => this.layers.at(-1))
  }

  install(permit: () => readonly string[] | undefined, owned: () => boolean): void {
    this.layers.push({ permit, owned })
  }

  release(): void {
    this.layers.pop()
  }

}

/**
 * A native executor whose model-facing table is the role's permitted subset.
 *
 * Execution delegates untouched: the ceiling is a description contract here, while the
 * deny-only guard and `tools.restrict()` remain the gates that refuse a call. The active
 * layer is read per `describe`, so a work-order or lease change reaches the next request
 * without touching the executor registration.
 */
class RestrictedExecutor {
  private layer: (() => { permit: () => readonly string[] | undefined; owned: () => boolean } | undefined) = () => undefined

  constructor(private readonly native: ExecutorLike) {}

  bind(layer: () => { permit: () => readonly string[] | undefined; owned: () => boolean } | undefined): void {
    this.layer = layer
  }

  get sections(): readonly unknown[] | undefined { return this.native.sections }

  describe(tools: readonly ToolDefinitionLike[]): { readonly schemas: readonly ToolSchemaLike[] } {
    const active = this.layer()

    // Nothing installed or not owned: the deployment's whole table stands.
    if (active === undefined || !active.owned()) return this.native.describe(tools)
    const permit = active.permit()
    // No ceiling is not an empty ceiling: an undefined list keeps the whole table.
    if (permit === undefined) return this.native.describe(tools)
    const permitted = new Set(permit)
    return this.native.describe(tools.filter(tool => permitted.has(tool.name)))
  }

  execute(input: unknown): Promise<unknown> {
    return this.native.execute(input)
  }
}

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
export async function executeSingleTool(
  tools: ScopedToolService,
  call: SingleToolCall,
): Promise<ToolExecutionOutcome> {
  if (typeof tools.execute !== 'function') throw new Error('This Host exposes no ctx.tools.execute; Fusion cannot dispatch a native check')
  if (!usesToolExecutors(tools)) {
    return await tools.execute({
      callId: call.callId, rootCallId: call.rootCallId, parent: call.parent,
      name: call.name, arguments: call.arguments, agent: call.agent, signal: call.signal,
    }) as ToolExecutionOutcome
  }
  // Record the correlation before dispatch so an approval raised during the call can already
  // resolve it, and drop it afterwards so the map cannot grow with every check.
  if (call.rootCallId !== undefined) enclosingRoot.set(call.callId, call.rootCallId)
  const settled = await tools.execute({
    calls: [{ type: 'tool-call', id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }],
    signal: call.signal,
    agent: call.agent,
  }).finally(() => { enclosingRoot.delete(call.callId) }) as {
    readonly results?: readonly { readonly callId: string; readonly result: ToolExecutionOutcome }[]
    readonly additionalContexts?: readonly unknown[]
  }
  const outcome = settled.results?.find(item => item.callId === call.callId)?.result ?? settled.results?.[0]?.result
  if (outcome === undefined) throw new Error(`The tool batch produced no outcome for ${call.name}`)
  // A batch has no nested-dispatch concept, so this call records ITSELF as the root. Every
  // observer that correlates an approval or an effect with the call that caused it reads
  // `rootCallId`, and inheriting the enclosing call's id (which only the 0.2.1 input carries)
  // would no longer be reachable from this Host's own event stream.
  // A batch owns deferred context at its own level, while a single call carried it on the
  // result. Re-attach it so callers keep reading one shape: dropping it silently loses the
  // tool's next-step instructions.
  const deferred = settled.additionalContexts ?? []
  return deferred.length === 0 ? outcome : { ...outcome, additionalContexts: [...(outcome.additionalContexts ?? []), ...deferred] }
}
