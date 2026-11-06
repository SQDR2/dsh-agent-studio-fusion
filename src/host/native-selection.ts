import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, ModelModality, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import type { PhysicalRoute } from '../contracts.js'
import { FUSION_MODEL, FUSION_PROVIDER, isCurrentFusionSelection, isFusionModel, isFusionSelection } from '../identity.js'
import { modelOfProfileId } from './pairs.js'
import type { ResolvedProfile } from '../profile/resolve.js'
import type { FusionCoordinator } from './coordinator.js'

export { FUSION_MODEL, FUSION_PROVIDER, isFusionSelection }

/** One combo as the native menu needs it: its id, its label and its Lead's modalities. */
export interface FusionModelEntry {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly inputModalities: readonly ModelModality[]
}

/** Read every combo this Host currently advertises; empty means unconfigured. */
export type FusionModels = () => Promise<readonly FusionModelEntry[]>

const textOnly = [...new Set<ModelModality>(['text'])]

/** Catalog-only local adapter; the native request is physically routed before dispatch. */
export class FusionCatalogAdapter extends LlmAdapter {
  constructor(private readonly models?: FusionModels) { super() }
  override providerInfo(provider: string) { return { id: provider, name: 'Fusion' } }
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const declared = await this.models?.().catch(() => []) ?? []
    // The Lead is the only role that reads user content, so an entry admits
    // exactly what its own Lead admits; text-only until it resolves. An
    // installation with no combo yet still offers the historical entry, so the
    // menu can explain what to configure instead of hiding Fusion entirely.
    const entries = declared.length ? declared
      : [{ id: FUSION_MODEL, name: 'Fusion · 自动', inputModalities: textOnly }]
    return entries.map(entry => ({ provider, id: entry.id, name: entry.name,
      description: entry.description ?? 'Lead 与 Worker 协作。在设置 → Fusion 中配置模型。',
      inputModalities: [...new Set<ModelModality>(['text', ...entry.inputModalities])] }))
  }
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    if (provider !== FUSION_PROVIDER || !isFusionModel(model)) throw new Error('Unknown local Fusion selection')
    const declared = (await this.listModels(provider)).find(entry => entry.id === model)
    if (!declared) throw new Error('Unknown local Fusion selection')
    return declared
  }
  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('Fusion 尚未就绪。请前往设置 → Fusion 配置 Lead 和 Worker。')
  }
}

/** Public native lifecycle integration. No model-menu replacement or Host patch. */
export function installNativeFusionSelection(ctx: Context, input: {
  coordinator(): FusionCoordinator | undefined
  /** The frozen profile of one combo, or undefined when it cannot be used yet. */
  profile(model: string): ResolvedProfile | undefined
  /** Why one combo cannot run, for the message a blocked session shows. */
  reason?(model: string): string | undefined
  selection(agent: Agent): PhysicalRoute | undefined
}): () => void {
  const pending = new Map<string, Promise<void>>()
  const failures = new Map<string, string>()
  const desired = new Map<string, PhysicalRoute>()
  const selection = (agent: Agent) => desired.get(agent.id) ?? input.selection(agent)
  const binding = (agent: Agent) => input.coordinator()?.bindings.read(agent.id)?.binding
  const selected = (agent: Agent) => binding(agent)?.selected === true
  /** The combo a selected session is frozen to, or undefined when it runs no Fusion task. */
  const runningCombo = (agent: Agent): string | undefined => {
    const current = binding(agent)
    return current?.selected ? modelOfProfileId(current.profile.id) ?? FUSION_MODEL : undefined
  }
  const blocked = (model: string) => input.reason?.(model) ?? '请先在设置 → Fusion 配置 Lead 和 Worker，再继续此会话。'
  const change = (agent: Agent) => {
    if (agent.session.header.parentSession || pending.has(agent.id)) return
    const coordinator = input.coordinator(), route = selection(agent)
    if (!coordinator) return
    if (isFusionSelection(route)) {
      const model = route?.model ?? FUSION_MODEL
      const profile = input.profile(model), running = runningCombo(agent)
      if (running !== undefined && running !== model) {
        // Another combo was picked inside this conversation. Each combo freezes
        // its own pair, so the drain is the same as leaving Fusion: the next
        // turn starts a new task under the newly chosen combo.
        const transition = (async () => {
          if (agent.status !== 'idle') await coordinator.pause(agent)
          await coordinator.clear(agent)
          if (profile) coordinator.selectBeforeAssembly(agent, profile)
          else failures.set(agent.id, blocked(model))
        })().catch(error => { failures.set(agent.id, String(error)) }).finally(() => { pending.delete(agent.id) })
        pending.set(agent.id, transition)
        return
      }
      if (running === undefined) {
        if (profile) coordinator.selectBeforeAssembly(agent, profile)
        else failures.set(agent.id, blocked(model))
      }
      if (selected(agent)) {
        // A saved Host default need not emit model/selection. Persist that
        // already-chosen intent before physical headers reach the native menu's
        // projection, otherwise it starts displaying the Lead as the selection.
        // A session that named the combo before a rename keeps its task, but the
        // route it stored no longer has an adapter; rewrite the spelling only.
        const intent = agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')
        if (!isCurrentFusionSelection(intent?.data)) agent.session.append('model/selection', {
          provider: FUSION_PROVIDER, model,
        })
        failures.delete(agent.id)
      }
      return
    }
    if (!selected(agent)) return
    const transition = (async () => {
      if (agent.status !== 'idle') await coordinator.pause(agent)
      await coordinator.clear(agent)
      failures.delete(agent.id)
    })().catch(error => { failures.set(agent.id, String(error)) }).finally(() => { pending.delete(agent.id) })
    pending.set(agent.id, transition)
  }
  const disposers = [
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'model/selection') return
      desired.set(session.id, event.data)
      const agent = ctx.agents.get(SessionId(session.id))
      if (agent && (agent.status === 'idle' || !isFusionSelection(event.data))) change(agent)
      else if (agent && !selected(agent)) agent.cancel({ kind: 'hook', reason: 'Fusion selection takes effect after this turn settles' }, { keepInbox: true })
    }),
    ctx.on('agent/status', ({ agent, status }) => {
      if (status !== 'running' || agent.session.header.parentSession) return
      if (pending.has(agent.id) && selected(agent)) {
        agent.cancel({ kind: 'hook', reason: 'Model switch is draining the previous Fusion task' }, { keepInbox: true })
        return
      }
      // The synchronous running reservation precedes prompt/tool assembly.
      try { change(agent) } catch (error) { failures.set(agent.id, String(error)) }
    }),
    ctx.on('agent/request', async (payload, next) => {
      const config = await next(), agent = payload.agent
      if (agent.session.header.parentSession) return config
      const route = selection(agent)
      if ((pending.has(agent.id) && selected(agent)) || failures.has(agent.id)) throw new Error(failures.get(agent.id) ?? 'Fusion 正在完成模型切换，请稍后继续')
      if (isFusionSelection(route)) {
        // A newly installed exact-Agent interceptor can wrap this listener;
        // its physical route is applied after this continuation returns.
        // The catalog adapter itself cannot dispatch any upstream request.
        if (!selected(agent)) throw new Error(blocked(route?.model ?? FUSION_MODEL))
      } else if (selected(agent)) throw new Error('先停止当前 Fusion 任务，再切换模型。')
      return config
    }, { prepend: true }),
  ]
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
