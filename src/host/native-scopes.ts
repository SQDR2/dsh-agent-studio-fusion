import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { requestOutputReservation } from '../context/guard.js'
import type { PhysicalRoute, Role } from '../contracts.js'
import type { SessionBinding } from './bindings.js'
import { digestOf } from '../digest.js'
import { isFusionSelectionLabel } from '../identity.js'
import { fusionToolDiagnostic, projectRoleTools } from './tool-table.js'
import { installNativePresentation } from './tool-seam.js'
import { pinNativeRoute, requiresSelectedRoute, restoreNativeIntent } from './route-pin.js'

export interface FusionScopeCallbacks {
  route?(binding: SessionBinding, role: Role): PhysicalRoute
  /**
   * Whether this Host still runs that exact Agent object. A session id outlives
   * the Agent that owned it, and a retired Agent keeps its last phase, so this is
   * the only way to tell "replacement in flight" from "the live Agent moved on".
   */
  live?(agent: Agent): boolean
  beforeTurn?(agent: Agent, binding: SessionBinding, role: Role, turn: number): SessionBinding
  taskContext?(agent: Agent, binding: SessionBinding, role: Role): UserMessage | undefined
  beforeStep?(agent: Agent, binding: SessionBinding, role: Role): void
  projectMessage?(agent: Agent, binding: SessionBinding, role: Role, message: UserMessage): UserMessage
  /** All independent pause, budget, recovery and unknown-effect gates are checked here. */
  canAccess?(agent: Agent, binding: SessionBinding, role: Role): string | undefined
  /** Shared gates plus limits that apply only to admitting a new generation. */
  prepareRequest?(agent: Agent, binding: SessionBinding, role: Role, signal: AbortSignal): Promise<void>
  canRequest(agent: Agent, binding: SessionBinding, role: Role): string | undefined
  /**
   * Report a gate that rejects the next step. A rejected step never reaches the
   * model, so the turn ends as `blocked` with nothing in the conversation; the
   * Host uses this to write the reason once instead of leaving a silent dead
   * end the user can only escape by starting a new session.
   */
  blockedNotice?(agent: Agent, binding: SessionBinding, role: Role, reason: string): void
  canExecute(exec: Readonly<ToolExecution>, binding: SessionBinding, role: Role): string | undefined
  beforeRequest(agent: Agent, turn: number, step: number, binding: SessionBinding, role: Role): void
  /** Disclosed context window for this physical model, read when the request is built. */
  modelLimits?(provider: string, model: string): Promise<{ contextWindow: number; defaultMaxTokens?: number; testedOutputCap?: number }>
  /** Read-stage tools, presented natively. Undefined restores the native composition. */
  readOnlyTools?(agent: Agent, binding: SessionBinding, role: Role): readonly string[] | undefined
  /**
   * Tools this role keeps in its request table even when the role's ceiling would
   * narrow them away — the reporting contract a Worker cannot lose. Read per
   * request, so a work-order-dependent tool appears only where it is usable.
   */
  alwaysTools?(binding: SessionBinding, role: Role): readonly string[]
  installTools(scope: Context, agent: Agent, binding: SessionBinding, role: Role): readonly (() => void)[]
}

/**
 * Tools a Worker keeps even when its ceiling would narrow them away: the reporting
 * contract an assignment cannot lose. The Lead has none — its ceiling is the table.
 */
function workerAlwaysTools(role: Role): readonly string[] {
  return role === 'worker' ? ['fusion_read_state', 'fusion_read_evidence', 'fusion_submit_result'] : []
}

interface ScopeEntry {
  readonly agent: Agent
  binding: SessionBinding
  readonly role: Role
  readonly dispose: (() => void)[]
  refreshTools(): void
  ready: boolean
}

/** Physical routing, prompt and tools live in the exact native Agent scope. */
export class NativeFusionScopes {
  readonly #entries = new Map<string, ScopeEntry>()
  constructor(private readonly callbacks: FusionScopeCallbacks) {}

  get(agent: Agent): { binding: SessionBinding; role: Role } | undefined {
    const entry = this.#entries.get(agent.id)
    return entry?.agent === agent ? { binding: entry.binding, role: entry.role } : undefined
  }

  assertReady(agent: Agent): void {
    const entry = this.#entries.get(agent.id)
    if (!entry || entry.agent !== agent || !entry.ready) throw new Error('Fusion Agent scope is not ready; execution is blocked')
    const reason = (this.callbacks.canAccess ?? this.callbacks.canRequest)(agent, entry.binding, entry.role)
    if (reason) throw new Error(reason)
  }

  install(agent: Agent, binding: SessionBinding, role: Role): void {
    const old = this.#entries.get(agent.id)
    if (old) {
      if (old.agent === agent && old.binding.taskId === binding.taskId && old.role === role && old.ready) return
      // A native continuable activation may be released between turns. Its
      // resumed Agent has the same durable id but a fresh exact scope.
      if (old.agent !== agent && this.#retired(old.agent)) this.releaseRetired(old.agent)
      else if (old.agent !== agent && old.agent.status === 'idle') this.detach(old.agent)
      else throw new Error('An existing Fusion scope must settle and detach before replacement')
    }
    const entry: ScopeEntry = { agent, binding: structuredClone(binding), role, dispose: [], ready: false, refreshTools: () => {} }
    this.#entries.set(agent.id, entry)
    const policy = entry.binding.profile.context[role]
    const scope = agent.ctx
    let readOnlyTools: readonly string[] | undefined
    let presentationKey: string | undefined
    const stageDisposers: (() => void)[] = []
    const clearStage = () => { for (const dispose of stageDisposers.splice(0).reverse()) dispose() }
    entry.dispose.push(clearStage)
    // Present once, read the ceiling per `describe`. Presenting repeatedly is not an option
    // on 0.2.2 (a second executor selection throws, and releasing one leaves the scope with
    // no selection at all), and a cached ceiling is not an option either: 0.2.2 describes the
    // table BEFORE `agent/pre-step` runs, so a cached value always lags one step behind a
    // work-order or phase change made during the turn.
    const detachPresentation = installNativePresentation(agent, scope, () => {
      const ceiling = this.callbacks.readOnlyTools?.(agent, entry.binding, role)
      return ceiling === undefined ? undefined
        : [...new Set([...ceiling, ...(this.callbacks.alwaysTools?.(entry.binding, role) ?? workerAlwaysTools(role))])]
    }, () => entry.ready)
    if (detachPresentation) entry.dispose.push(detachPresentation)
    entry.refreshTools = () => {
      const tools = this.callbacks.readOnlyTools?.(agent, entry.binding, role)
      const key = JSON.stringify(tools ?? null)
      if (key === presentationKey) return
      clearStage()
      readOnlyTools = tools
      // A Lead's capability ceiling is also used when validating a new child. Only mask
      // its prompt; restricting inheritance would disable Worker writes. Empty and absent
      // means "no mask", so a finished task must not register a restriction at all.
      if (role === 'worker' && tools !== undefined) stageDisposers.push(scope.tools.restrict({ allow: tools }))
      presentationKey = key
    }
    // Register the deny-only native guard first. A failed partial install stays closed.
    entry.dispose.push(scope.tools.guard(exec => {
      if (!entry.ready) return 'Fusion scope initialization failed'
      return this.callbacks.canExecute(exec, entry.binding, role)
    }))
    entry.dispose.push(scope.on('session/event', (session, event) => {
      if (session !== agent.session || event.type !== 'turn/start' || !entry.ready || !this.callbacks.beforeTurn) return
      try {
        const nextBinding = this.callbacks.beforeTurn(agent, entry.binding, role, event.data.turn)
        if (nextBinding.sessionId !== entry.binding.sessionId || digestOf(nextBinding.profile) !== digestOf(entry.binding.profile)
          || digestOf(nextBinding.prompts) !== digestOf(entry.binding.prompts)) throw new Error('Task rollover must preserve the frozen route and prompts')
        entry.binding = structuredClone(nextBinding)
        entry.refreshTools()
      } catch (error) { entry.ready = false; throw error }
      // Step preparation reads the selection before any waterfall, so the physical route
      // has to be recorded here on a Host that owns Agent selection. A turn that rolls the
      // task over gets the newly frozen route for the same reason.
      pinNativeRoute(agent, this.callbacks.route?.(entry.binding, role) ?? entry.binding.profile[role])
    }))
    // The running reservation is synchronous and precedes prompt assembly, which is the
    // documented place to select a route; a session/event observer cannot append the event
    // that carries it. The pin is idempotent, so only the first turn of a task records one.
    entry.dispose.push(scope.on('agent/status', ({ agent: changed, status }) => {
      if (changed !== agent || status === 'idle') return
      try { this.#pin(agent, entry, role) } catch (error) { entry.ready = false; throw error }
    }))
    entry.dispose.push(scope.on('agent/pre-step', async (payload, next) => {
      if (payload.agent !== agent || !entry.ready) {
        this.callbacks.blockedNotice?.(agent, entry.binding, role, 'Fusion scope initialization failed')
        return { kind: 'reject' }
      }
      await this.callbacks.prepareRequest?.(agent, entry.binding, role, payload.signal)
      payload.signal.throwIfAborted()
      const blocked = this.callbacks.canRequest(agent, entry.binding, role)
      if (blocked) {
        this.callbacks.blockedNotice?.(agent, entry.binding, role, blocked)
        return { kind: 'reject' }
      }
      this.callbacks.beforeStep?.(agent, entry.binding, role)
      const decision = await next()
      if (decision.kind === 'reject') return decision
      // Native compaction can run inside next(), after prompt assembly. Form
      // this user-role snapshot afterwards so the next request retains facts.
      const taskContext = this.callbacks.taskContext?.(agent, entry.binding, role)
      // Native selection compares the virtual menu route to the physical
      // request header. That is not a new model change on every Fusion step.
      return { ...decision, messages: [...decision.messages.filter(message => {
        const source = message.source
        return !(source?.kind === 'model-selection' && source.form === 'notice'
          && isFusionSelectionLabel(source.summary))
      }).map(message =>
        this.callbacks.projectMessage?.(agent, entry.binding, role, message) ?? message), ...(taskContext ? [taskContext] : [])] }
    }, { prepend: true }))
    entry.dispose.push(scope.systemPrompt.section({ name: 'fusion-role', order: 90, text: entry.binding.prompts[role] }))
    entry.dispose.push(scope.on('system-prompt/assemble', async (_assembly, _context, next) => {
      entry.refreshTools()
      const assembled = await next()
      const route = this.callbacks.route?.(entry.binding, role) ?? entry.binding.profile[role]
      const variables = { ...assembled.variables, provider: route.provider, model: route.model }
      // 0.2.1 carried the model-facing tool table through this waterfall; 0.2.2 removed it
      // from the payload and gave it to the scoped executor's `describe()` instead, which
      // `installNativePresentation` already owns. Test the payload shape, not the version:
      // only a waterfall that actually handed `tools` in can have it replaced from here.
      if (!('tools' in assembled) || assembled.tools === undefined) return { ...assembled, variables }
      // Another plugin may replace assembled.tools inside next() (dsh-tool-search swaps
      // in its eager set). Put this role's permitted tools back from the registry.
      // Required means "this agent registered it and the role may see it", so a legacy
      // allowlist that names a model-like-only tool is not a gap. The deny-only guard
      // still rejects a hidden local tool that was not restored.
      const projected = projectRoleTools({
        assembled: assembled.tools,
        allowlist: readOnlyTools,
        registry: scope.tools.schemas(agent),
        always: this.callbacks.alwaysTools?.(entry.binding, role) ?? workerAlwaysTools(role),
      })
      if (projected.missing.length) throw new Error(fusionToolDiagnostic(projected.missing))
      return { ...assembled, variables, tools: projected.tools }
    }, { prepend: true }))
    entry.dispose.push(scope.on('agent/request', async ({ agent: requesting, turn, step, signal }, next) => {
      this.assertReady(requesting)
      await this.callbacks.prepareRequest?.(requesting, entry.binding, role, signal)
      signal.throwIfAborted()
      const reason = this.callbacks.canRequest(requesting, entry.binding, role)
      if (reason) throw new Error(reason)
      const config = await next()
      const route = this.callbacks.route?.(entry.binding, role) ?? entry.binding.profile[role]
      this.callbacks.beforeRequest(agent, turn, step, entry.binding, role)
      const { reasoningEffort: _prior, ...rest } = config
      // 0.2.2 fixed provider, model and effort at step preparation and rejects a proposal
      // that changes them; the route was already pinned at `turn/start`. Assert instead of
      // proposing, so a Host that failed to pin fails loudly here rather than dispatching a
      // request the user never chose. 0.2.1 has no Agent-owned selection, so it still takes
      // the rewrite below.
      const selected = requiresSelectedRoute(requesting)
      if (selected) {
        if (rest.provider !== route.provider || rest.model !== route.model) {
          throw new Error(`Fusion route was not pinned before step preparation: this step uses "${rest.provider}/${rest.model}", the frozen route is "${route.provider}/${route.model}"`)
        }
      }
      if (entry.binding.profile.interactionMode === 'model-like') {
        const { maxTokens, ...native } = rest
        const controls = {
          // 0.2.2: the step's selection is already the physical route and its effort, so
          // passing either back would be a change the loop rejects.
          ...selected ? {} : { provider: route.provider, model: route.model,
            ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }) },
        }
        return { ...native, ...controls, ...(role === 'lead' && maxTokens !== undefined ? { maxTokens } : {}) }
      }
      const disclosed = this.callbacks.modelLimits
        ? await this.callbacks.modelLimits(route.provider, route.model) : undefined
      // A new native child inherits its parent's creation maxTokens, whereas
      // a cold continuable activation deliberately does not persist that value.
      // The Worker is plugin-owned: resolve its own route allowance on both
      // paths. An explicit cap on the user-facing Lead still takes precedence.
      const requested = role === 'lead' ? config.maxTokens : undefined
      const maxTokens = disclosed
        ? requestOutputReservation(disclosed.contextWindow, requested, disclosed.defaultMaxTokens, disclosed.testedOutputCap, policy.reserveOutputTokens)
        : Math.min(requested ?? policy.reserveOutputTokens, policy.reserveOutputTokens)
      return { ...rest, maxTokens,
        ...selected ? {} : { provider: route.provider, model: route.model,
          ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }) } }
    }, { prepend: true }))
    entry.refreshTools()
    entry.dispose.push(...this.callbacks.installTools(scope, agent, entry.binding, role))
    entry.ready = true
  }

  /**
   * Re-pin a live scope's frozen route.
   *
   * A caller that appends the session's virtual selection during the running reservation
   * leaves that append as the newest one, and the step about to be prepared would then read
   * a route no adapter can answer. Every such caller re-pins after it has finished.
   */
  pinRoute(agent: Agent): void {
    const entry = this.#entries.get(agent.id)
    if (!entry || entry.agent !== agent || !entry.ready) return
    this.#pin(agent, entry, entry.role)
  }

  /** Pin the frozen physical route at the one synchronous point a step still reads. */
  #pin(agent: Agent, entry: ScopeEntry, role: Role): void {
    pinNativeRoute(agent, this.callbacks.route?.(entry.binding, role) ?? entry.binding.profile[role])
  }

  /** Refresh at the persisted state transition, before native prompt providers run. */
  refreshTools(agent: Agent): void {
    const entry = this.#entries.get(agent.id)
    if (entry?.agent !== agent || !entry.ready) return
    try { entry.refreshTools() }
    catch (error) { entry.ready = false; throw error }
  }

  /**
   * Caller owns quiescence and the original session-controller model selection.
   * Removing these listeners reveals that existing selection; it does not mutate
   * a request header or fabricate a replacement global default.
   */
  detach(agent: Agent): void {
    const entry = this.#entries.get(agent.id)
    if (!entry || entry.agent !== agent) return
    if (agent.status !== 'idle') throw new Error('Cannot detach Fusion while the native Agent is running')
    entry.ready = false
    // Removing the Fusion scope must restore the session's own route, not leave the
    // frozen physical one behind: the pin is a durable selection, so nothing else would
    // ever undo it.
    restoreNativeIntent(agent)
    for (const dispose of entry.dispose.reverse()) dispose()
    this.#entries.delete(agent.id)
  }

  /**
   * Whether this Host no longer runs the Agent that owns the recorded scope.
   *
   * Both refusals below are right for a LIVE Agent and permanent for a retired
   * one: a resumed session hands the same id to a fresh Agent object while the
   * previous object keeps whatever phase it was in, so a scope held by the old
   * object could never settle and every later install threw. The live Agent then
   * ran with no Fusion scope at all — the Host's own tool table, no role prompt,
   * `fusion_delegate` merely "unknown tool" (session-a5409fb4, after aborting a
   * turn and switching model). Only the registry can tell the two apart.
   */
  #retired(agent: Agent): boolean {
    return this.callbacks.live?.(agent) === false
  }

  /** Release a scope whose Agent this Host no longer runs. Never for a live Agent. */
  private releaseRetired(agent: Agent): void {
    const entry = this.#entries.get(agent.id)
    if (!entry || entry.agent !== agent) return
    entry.ready = false
    for (const dispose of entry.dispose.reverse()) dispose()
    this.#entries.delete(agent.id)
  }
}
