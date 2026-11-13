import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import type { PhysicalRoute } from '../contracts.js'
import { requireSubagentMethod, requiresNestedActivationRequest, supportedDshVersions } from './subagent-seam.js'

export interface NativeWorkerRequest {
  readonly childId: string
  readonly label: string
  /** Model-authored brief from the Lead's native tool call. */
  readonly brief: string
  readonly route: PhysicalRoute
  /** 0.2.0 startContinuable persona. 0.2.1 rejects it; the role scope carries the prompt. */
  readonly persona: string
  /** 0.2.0 start-time tool ceiling. 0.2.1 rejects toolFilter; the role scope narrows tools. */
  readonly allowedTools: readonly string[]
}

export interface NativeWorkerAcceptance {
  readonly childId: string
  readonly messageId: MessageId
}

interface WorkerStartRequest {
  readonly parent: Agent
  readonly prompt: readonly { readonly type: 'text'; readonly text: string }[]
  readonly agentOptions: { readonly provider: string; readonly model: string; readonly reasoningEffort?: ReturnType<typeof ReasoningEffortId> }
  readonly maxDepth: number
  readonly persona?: string
  readonly toolFilter?: { readonly allow: readonly string[] }
}

interface StartedWorker {
  readonly childId: string
  readonly messageId?: MessageId
  /**
   * 0.2.1 and later return the exact-activation receipt. It is optional because the
   * published 0.2.0 declaration only promises the start fields; only `dispose` is used.
   */
  dispose?(): Promise<void>
}

/** One start's task options, flattened for 0.2.2 and nested under `request` for 0.2.1. */
interface ActivationTaskOptions {
  readonly parent: Agent
  readonly prompt: readonly { readonly type: 'text'; readonly text: string }[]
  readonly agentOptions: WorkerStartRequest['agentOptions']
  readonly maxDepth: number
  readonly persona?: string
  readonly toolFilter?: { readonly allow: readonly string[] }
}

/** Structural view of the three DSH subagent seams. Only the branch that exists is called. */
interface SubagentSeam {
  startActivation?(spec: {
    readonly provider: string
    readonly label: string
    readonly childId: ReturnType<typeof SessionId>
    readonly delivery: 'parent'
    readonly request: ActivationTaskOptions
    readonly signal: AbortSignal
  } | {
    readonly provider: string
    readonly label: string
    readonly childId: ReturnType<typeof SessionId>
    readonly delivery: 'parent'
    readonly parent: Agent
    readonly prompt: readonly { readonly type: 'text'; readonly text: string }[]
    readonly agentOptions: WorkerStartRequest['agentOptions']
    readonly maxDepth: number
    readonly signal: AbortSignal
  }): Promise<StartedWorker>
  startContinuable?(spec: {
    readonly provider: string
    readonly label: string
    readonly childId: ReturnType<typeof SessionId>
    readonly request: ActivationTaskOptions
    readonly signal: AbortSignal
  }): Promise<StartedWorker>
  drainChildren?(parent: Agent, childIds: readonly ReturnType<typeof SessionId>[]): Promise<void>
  drainContinuableChildren?(parent: Agent, childIds: readonly ReturnType<typeof SessionId>[]): Promise<void>
}

/** Version-pinned public API adapter. It never calls an LLM adapter or runs a shell itself. */
/**
 * Child id → the `dispose` of the receipt that started it.
 *
 * 0.2.2 has no release-by-id service method, so this retained receipt is the only way to
 * release exactly one child. It lives on the plugin's own context rather than on one
 * transport instance: a coordinator replacement constructs a fresh transport over the SAME
 * Host, and the child that has to be released is the one it started. A per-instance map
 * would strand that child — and the Host would then have no way to release it at all.
 */
const receiptsByContext = new WeakMap<Context, Map<string, () => Promise<void>>>()

export class NativeWorkerTransport {
  readonly #flushed = new WeakMap<Agent, number>()
  readonly #receipts: Map<string, () => Promise<void>>
  constructor(private readonly ctx: Context, private readonly provider = 'spawn') {
    let receipts = receiptsByContext.get(ctx)
    if (receipts === undefined) { receipts = new Map(); receiptsByContext.set(ctx, receipts) }
    this.#receipts = receipts
  }

  assertAvailable(): void {
    const provider = this.ctx.subagents.getProvider(this.provider)
    if (!provider?.prepareContinuable || provider.inheritsParentContext !== false) {
      throw new Error(`Fusion requires an independent continuable provider: ${this.provider}`)
    }
  }

  /** Caller durably reserves the child and operation before entering this method. */
  async start(parent: Agent, request: NativeWorkerRequest, signal: AbortSignal): Promise<NativeWorkerAcceptance> {
    this.assertAvailable()
    signal.throwIfAborted()
    if (this.ctx.agents.get(SessionId(request.childId))) throw new Error('Reserved Worker already exists; reconcile before retrying')
    const prompt = [{ type: 'text' as const, text: request.brief }]
    const agentOptions = {
      provider: request.route.provider,
      model: request.route.model,
      ...(request.route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(request.route.reasoningEffort) }),
    }
    const maxDepth = (parent.session.header.delegationDepth ?? 0) + 1
    const childId = SessionId(request.childId)
    // `startActivation` is the 0.2.1 name. `delivery: 'parent'` keeps the 0.2.0
    // settlement: it reaches the Lead's inbox, which this transport reconciles
    // from the session log. 0.2.1 rejects `persona` and `toolFilter`; the
    // `fusion-role` section and NativeFusionScopes own both, and the scope is
    // installed at `agent/created` before the child's first request.
    // Otherwise this is 0.2.0 `startContinuable`, persona and toolFilter included.
    const subagents = this.ctx.subagents as SubagentSeam
    const start = requireSubagentMethod(subagents, 'startActivation', 'startContinuable')
    const accepted = start === 'startActivation'
      // 0.2.2 moved these task options out of `request` to the top level; the
      // nested marker decides which object this Host accepts.
      ? requiresNestedActivationRequest(subagents)
        ? await subagents.startActivation!({
          provider: this.provider, label: request.label, childId, delivery: 'parent',
          request: { parent, prompt, agentOptions, maxDepth }, signal,
        })
        : await subagents.startActivation!({
          provider: this.provider, label: request.label, childId, delivery: 'parent',
          parent, prompt, agentOptions, maxDepth, signal,
        })
      : await subagents.startContinuable!({
        provider: this.provider, label: request.label, childId,
        request: { parent, prompt, persona: request.persona, agentOptions, toolFilter: { allow: [...request.allowedTools] }, maxDepth },
        signal,
      })
    // Retain the receipt first: a later identity or message rejection still
    // leaves a resident activation that only this receipt can release.
    if (typeof accepted.dispose === 'function') this.#receipts.set(accepted.childId, accepted.dispose.bind(accepted))
    if (accepted.childId !== request.childId) throw new Error('Native Worker identity changed during creation')
    if (!accepted.messageId) throw new Error('Native Worker start did not accept an initial message')
    return { childId: accepted.childId, messageId: accepted.messageId }
  }

  /** Only Lead-authored feedback is sent through this public model-message API. */
  async continue(parent: Agent, childId: string, feedback: string, signal: AbortSignal): Promise<NativeWorkerAcceptance> {
    signal.throwIfAborted()
    const messageId = await this.ctx.subagents.sendMessage(
      parent, SessionId(childId), [{ type: 'text', text: feedback }], { signal },
    )
    return { childId, messageId }
  }

  /**
   * Replace an in-flight generation through public cancellation, then deliver
   * to the same durable child. The caller must first exclude live/unknown
   * effectful tools. Otherwise use continue(), which steers at a step boundary.
   */
  async interruptAndContinue(parent: Agent, childId: string, feedback: string, signal: AbortSignal): Promise<NativeWorkerAcceptance> {
    signal.throwIfAborted()
    await this.stop(parent, childId)
    signal.throwIfAborted()
    return this.continue(parent, childId, feedback, signal)
  }

  /** Interrupt acceptance is insufficient: wait for the exact native Agent to settle and flush. */
  settle(parent: Agent, childId: string, signal: AbortSignal): Promise<Agent>
  /** Yield a blocking tool to native user steering without canceling or releasing the Worker. */
  settle(parent: Agent, childId: string, signal: AbortSignal, yieldToSteering: true): Promise<Agent | undefined>
  async settle(parent: Agent, childId: string, signal: AbortSignal, yieldToSteering = false): Promise<Agent | undefined> {
    const child = this.#requireChild(parent, childId)
    let interruptError: unknown
    let removeSteering = () => {}
    const interrupt = () => {
      try { this.ctx.subagents.interrupt(child.id, { kind: 'ancestor', agent: parent }) }
      catch (error) { interruptError = error }
    }
    signal.addEventListener('abort', interrupt, { once: true })
    if (signal.aborted) interrupt()
    try {
      if (yieldToSteering && !signal.aborted) {
        const steering = new Promise<true>(resolve => {
          const check = () => {
            // Queue/next-turn and plugin context keep their native semantics.
            if (parent.inbox.nextStep.some(message => message.source.kind === 'user')) resolve(true)
          }
          removeSteering = parent.ctx.on('agent/inbox/inserted', ({ agent }) => { if (agent === parent) check() })
          check() // A message may already have arrived during delegation setup.
        })
        const yielded = await Promise.race([child.whenIdle().then(() => false), steering])
        // Cancellation still owns full settlement; an already idle Worker can
        // be flushed normally. The Lead alone authors any revised Worker brief.
        if (yielded && !signal.aborted && child.status !== 'idle') return undefined
      }
      await child.whenIdle()
      if (interruptError) throw interruptError
      if (this.ctx.agents.get(child.id) !== child) throw new Error('Worker residency changed; quiescence requires reconciliation')
      await this.#flushSettled(child)
      return child
    } finally { removeSteering(); signal.removeEventListener('abort', interrupt) }
  }

  async stop(parent: Agent, childId: string): Promise<Agent> {
    const child = this.#requireChild(parent, childId)
    // Native continuation teardown may already be closing this idle handle.
    // Reuse only our exact prior quiescence+flush proof at the unchanged log seq.
    if (child.status === 'idle' && this.#flushed.get(child) === (child.session.snapshotEvents().at(-1)?.seq ?? 0)) return child
    this.ctx.subagents.interrupt(child.id, { kind: 'ancestor', agent: parent })
    await child.whenIdle()
    if (this.ctx.agents.get(child.id) !== child) throw new Error('Worker residency changed during stop')
    await this.#flushSettled(child)
    return child
  }

  /**
   * 0.2.1 natural settlement flushes the child, then closes the persistence
   * handle. A stop that loses that race must not treat the closed handle as a
   * lost log. Any other flush failure still means the log is not durable.
   */
  async #flushSettled(child: Agent): Promise<void> {
    try {
      if (!await this.ctx.sessions.flush(child.session)) throw new Error('Worker log persistence unavailable')
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'SessionHandleClosedError') throw error
      return
    }
    this.#flushed.set(child, child.session.snapshotEvents().at(-1)?.seq ?? 0)
  }

  /**
   * Native release owns quiescence, persistence and handle disposal across HMR.
   *
   * 0.2.1 and 0.2.0 release a named child through the service; 0.2.2 removed both
   * drains and documents the activation receipt as the replacement. A receipt
   * addresses exactly the execution that this transport started, so it is used
   * first and the drain calls remain only for Hosts that still declare them.
   */
  async release(parent: Agent, childId: string): Promise<void> {
    const child = this.ctx.agents.get(SessionId(childId))
    if (child && child.session.header.parentSession !== parent.id) throw new Error('Cannot release another Lead’s child')
    const receipt = this.#receipts.get(childId)
    if (receipt) {
      // 0.2.2's receipt dispose releases the activation it was issued for, but the manager's
      // own settlement watcher may already have closed that activation when the child went
      // idle — in which case `dispose()` is a resolved no-op and the Agent stays registered.
      // Cancelling and waiting for quiescence is what actually retires the child: the
      // watcher owns that transition and disposes the handle once it observes it.
      if (child && child.status !== 'idle') this.ctx.subagents.interrupt(child.id, { kind: 'ancestor', agent: parent })
      await child?.whenIdle()
      await receipt()
      for (let tick = 0; tick < 1000 && this.ctx.agents.get(SessionId(childId)) !== undefined; tick++) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    } else {
      const subagents = this.ctx.subagents as SubagentSeam
      const ids = [SessionId(childId)]
      // 0.2.1 calls this `drainChildren`. 0.2.0 calls it `drainContinuableChildren`.
      if (typeof subagents.drainChildren === 'function') await subagents.drainChildren(parent, ids)
      else if (typeof subagents.drainContinuableChildren === 'function') await subagents.drainContinuableChildren(parent, ids)
      // This Host has no release-by-id left and this transport holds no receipt
      // for the child, which means another transport instance started it (an HMR
      // or process restart). `drainDescendants([parent])` is NOT a substitute: it
      // permanently records the Lead as a closing subagent-tree root, and every
      // later delegation from that Lead is refused as draining for the rest of
      // the process. Its whole-tree scope would also stop unrelated siblings.
      // There is therefore no safe path here; name the limitation instead of
      // silently poisoning the Lead or reporting a release that never happened.
      else throw new Error(`Cannot release native Worker ${childId}: this DeepSeek Assistant Host removed subagents.drainChildren and this transport holds no activation receipt for it (it was started before an HMR reload or process restart). DeepSeek Assistant ${supportedDshVersions} has no release-by-id replacement, and subagents.drainDescendants would permanently close this Lead's whole subagent tree. Restart the Host process to drop the resident activation, then reconcile the persisted child.`)
    }
    if (this.ctx.agents.get(SessionId(childId))) throw new Error('Native Worker release did not prove absence')
  }

  #requireChild(parent: Agent, childId: string): Agent {
    const child = this.ctx.agents.get(SessionId(childId))
    if (!child || child.session.header.parentSession !== parent.id) {
      throw new Error('Worker is absent or is not this Lead’s child; reconcile its persisted session')
    }
    return child
  }
}
