import { bi } from './bilingual.js'
import { FusionError, TASK_BUSY, TASK_NOT_FOUND } from './errors.js'
import { DeletionBlocked } from './task/deletion.js'
import { backfillHistory, readHistory } from './host/history.js'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ModelModality } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FusionCatalogAdapter, FUSION_PROVIDER, FUSION_MODEL, installNativeFusionSelection } from './host/native-selection.js'
import type { FusionModelEntry } from './host/native-selection.js'
import type { ResolvedProfile } from './profile/resolve.js'
import { choiceFromProfile, modelProfileFromChoice, validatePairChoice, type PairChoice } from './host/settings.js'
import { MAX_PAIRS, choiceFromStoredProfile, modelOfProfileId, profileIdOf, readPairs, validatePairs, writePairs } from './host/pairs.js'
import { CachePolicy, cacheView } from './host/cache-policy.js'
import { CACHE_DEFAULTS_CHECKED } from './host/cache-defaults.js'
import { PRICE_OVERRIDES_DOCUMENT, readPriceSettings, writePriceSettings } from './host/price-settings.js'
import { PRICE_CARDS_CHECKED, cardForModel, pricedModels } from './usage/price-cards.js'
import { loadJsonObject, resolveProfile } from './profile/resolve.js'
import { profileRoutes } from './profile/compactor.js'
import { loadModelPromptBundle, loadPromptBundle } from './prompts.js'
import { SqliteFusionStore } from './task/sqlite-store.js'
import { BindingRepository, type SessionBinding } from './host/bindings.js'
import { FusionCoordinator } from './host/coordinator.js'
import { authorizeConfiguredPair, NativeRequestBudget } from './host/native-budget.js'
import { json, readJson, trustedRequest } from './host/http.js'
import { readFusionStatus, readFusionStatusAsync } from './host/status.js'
import { readHistoricalFusionActivity } from './host/native-activity.js'
import { nativeShellTool } from './host/shell.js'
import { adoptLegacyStateDirectory } from './store-migration.js'
import { FUSION_API_PATH, LEGACY_FUSION_API_PATH, LEGACY_PLUGIN_NAME, isFusionProvider } from './identity.js'
import { AcpConfigSchema, agentsOf } from './host/acp/config.js'
import type { AcpConfig } from './host/acp/types.js'
import { installAcp } from './host/acp/index.js'
import { installAgy } from './host/agy/index.js'

export * from './index.js'

export const name = 'dsh-agent-studio-fusion'
export const inject = ['agents', 'sessions', 'llm', 'tools', 'subagents', 'systemPrompt', 'webServer', 'sessionController', 'sessionQuery', 'commands', 'agentDefaultModel', 'tokenMeter']
// The ACP route set is part of this plugin's own config: `acp.agents` maps a provider
// route to the agent command that serves it. An absent block means no ACP routes.
export interface Config {
  profilePath?: string
  authorizationPath?: string
  databasePath?: string
  workerTools?: string[]
  acp?: AcpConfig
  /**
   * The built-in Antigravity (agy CLI) side: the `antigravity` provider route, the
   * `/agy` command family, `agy_ask` / `agy_tool`, the `/plugins/agy-worker/*` HTTP
   * surface the console polls, the account pool and every related timer.
   *
   * The block is the layered config the standalone `dsh-agy-worker` read from its
   * own cordis entry (`enabled`, `agyBin`, `permissionMode`, …), so an existing
   * installation moves its entry config here verbatim. `DSH_AGY_*` env vars and
   * the runtime overrides file still win over it. Absent, or `enabled: false`,
   * installs nothing.
   */
  agy?: Record<string, unknown>
}
const defaultWorkerTools = [nativeShellTool, 'read', 'write', 'edit', 'glob', 'grep', 'job_output', 'job_kill']
// Schemastery otherwise normalizes an omitted array to [], bypassing ?? below.
// An explicitly empty list must remain empty, so the default belongs in the schema.
export const Config: z<Config> = z.object({ profilePath: z.string(), authorizationPath: z.string(), databasePath: z.string(),
  workerTools: z.array(z.string()).default(defaultWorkerTools), acp: AcpConfigSchema,
  // AGY resolves its own layers (env > overrides > this block > defaults), so the
  // block is passed through untouched: a strict schema here would reject keys the
  // upstream resolver still honours.
  agy: z.dict(z.any()) })

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const database = config.databasePath || join(dshHome, 'plugins', name, 'state.sqlite')
  if (!isAbsolute(database)) throw new Error('Fusion databasePath must be absolute')
  // The plugin was called `dsh-model-fusion` and then `dsh-fusion` before it
  // was renamed to `dsh-agent-studio-fusion`. Its whole durable ledger lives in those
  // directories, so an upgrade carries it forward.
  if (!config.databasePath) {
    adoptLegacyStateDirectory(join(dshHome, 'plugins', 'dsh-model-fusion'), join(dshHome, 'plugins', name))
    adoptLegacyStateDirectory(join(dshHome, 'plugins', 'dsh-fusion'), join(dshHome, 'plugins', name))
    adoptLegacyStateDirectory(join(dshHome, 'plugins', 'dsh-agent-studio'), join(dshHome, 'plugins', name))
  }
  const store = new SqliteFusionStore(database), bindings = new BindingRepository(store)
  const cachePolicy = new CachePolicy(store)
  backfillHistory(store)
  const budget = new NativeRequestBudget(store, config.authorizationPath)
  const physicalCatalog = async () => {
    const catalog = await ctx.sessionController.modelCatalog()
    return { ...catalog, groups: catalog.groups.filter(group => !isFusionProvider(group.id)) }
  }
  /**
   * The combos to resolve: the saved list, or the one profile file a benchmark
   * deployment names. A profile file keeps its legacy contract, so only saved
   * combos are rebuilt from a choice.
   */
  const comboPlan = (): { revision: number; items: readonly { id: string; name: string; pair: PairChoice; raw?: Record<string, unknown> }[] } => {
    const snapshot = readPairs(store)
    if (snapshot.pairs.length) return { revision: snapshot.revision, items: snapshot.pairs }
    if (config.profilePath && isAbsolute(config.profilePath)) {
      const raw = loadJsonObject(config.profilePath)
      const pair = choiceFromStoredProfile(raw)
      if (pair) return { revision: snapshot.revision, items: [{ id: FUSION_MODEL, name: '自动', pair, raw }] }
    }
    return { revision: snapshot.revision, items: [] }
  }
  interface Combos {
    revision: number
    items: readonly { id: string; name: string; pair: PairChoice }[]
    /** Frozen profile of every usable combo, keyed by the model id it advertises. */
    profiles: Map<string, ResolvedProfile>
    /** Why one saved combo cannot run yet; the other combos stay usable. */
    failures: Map<string, string>
  }
  let combos: Combos | undefined
  const resolveCombos = async (): Promise<Combos> => {
    const plan = comboPlan()
    const catalog = await physicalCatalog()
    const authorizedRoutes = catalog.groups.flatMap(group => group.models.map(model => ({ provider: group.id, model: model.id })))
    const profiles = new Map<string, ResolvedProfile>(), failures = new Map<string, string>()
    for (const item of plan.items) {
      try {
        const pair = validatePairChoice(item.pair, catalog)
        const next = item.raw ?? modelProfileFromChoice(pair, profileIdOf(item.id))
        profiles.set(item.id, resolveProfile(next, next.interactionMode === 'model-like' ? loadModelPromptBundle() : loadPromptBundle(), { authorizedRoutes }))
      } catch (error) {
        // One retired model must not take every other combo down with it.
        failures.set(item.id, error instanceof Error ? error.message : String(error))
      }
    }
    combos = { revision: plan.revision, items: plan.items.map(({ id, name, pair }) => ({ id, name, pair })), profiles, failures }
    return combos
  }
  const knownCombos = async (): Promise<Combos> => combos ?? await resolveCombos()
  // A combo list saved from another process (or before the model catalog was
  // ready at startup) is picked up on first use instead of failing the session.
  let reloading = false
  const profileOf = (model: string): ResolvedProfile | undefined => {
    const found = combos?.profiles.get(model)
    if (!found && !reloading) {
      reloading = true
      void resolveCombos().catch(() => undefined).finally(() => { reloading = false })
    }
    return found
  }
  /** The profile a plain (unselected) request falls back to: the first usable combo. */
  const primaryProfile = async (): Promise<ResolvedProfile> => {
    const state = await knownCombos()
    const profile = state.profiles.values().next().value
    if (profile) return profile
    const [first] = state.failures.values()
    throw new Error(first ?? bi('请先在左侧边栏的 Fusion 面板选择 Lead 和 Worker', 'Open the Fusion panel in the left sidebar and choose a Lead and a Sidekick first'))
  }
  const needsBudget = (profile: ResolvedProfile['profile']) => Boolean(config.authorizationPath) || profile.interactionMode !== 'model-like'
  let runtime: FusionCoordinator | undefined
  const effectiveRoutes = (binding: SessionBinding) => profileRoutes({ ...binding.profile,
    lead: runtime?.modelControl.route(binding, 'lead') ?? binding.profile.lead,
    worker: runtime?.modelControl.route(binding, 'worker') ?? binding.profile.worker })
  let creating: Promise<FusionCoordinator> | undefined
  const getRuntime = (frozen?: ResolvedProfile): Promise<FusionCoordinator> => {
    if (runtime) return Promise.resolve(runtime)
    if (creating) return creating
    creating = (async () => {
      const profile = frozen ?? await primaryProfile()
      runtime = new FusionCoordinator(ctx, store, { profile, workerTools: config.workerTools ?? defaultWorkerTools,
        // A Worker dispatched on a configured ACP route runs as an agent process
        // served by the bridge below; every other route is a model provider.
        acpRoutes: () => new Set(agentsOf(config).keys()),
        grantsNoToolsInText: true,
        resumeAuthorization: binding => needsBudget(binding.profile) ? budget.check(effectiveRoutes(binding)).authorizationId : 'native-account',
        authorizeRequest: (_agent, binding) => {
          if (!needsBudget(binding.profile)) return
          try { budget.check(effectiveRoutes(binding)) }
          catch (error) {
            const state = store.load(binding.taskId)
            if (state?.control.mode === 'running' && !state.control.budgetBlocked) runtime?.append(binding.taskId, 'budget/blocked', { reason: String(error) })
            throw error
          }
        },
        reserveRequest: (request, binding) => {
          if (!needsBudget(binding.profile)) return
          try { budget.reserve({ provider: request.provider, model: request.model }, request.maxTokens ?? 0) }
          catch (error) {
            const state = store.load(binding.taskId)
            if (state?.control.mode === 'running' && !state.control.budgetBlocked) runtime?.append(binding.taskId, 'budget/blocked', { reason: String(error) })
            throw error
          }
        } })
      return runtime
    })().finally(() => { creating = undefined })
    return creating
  }
  // ACP agent routes and the Sidekick-only MCP bridge. The bridge reads the live
  // coordinator through this accessor, so it can only exist once a Worker is actually
  // dispatched on an ACP route; every other ACP session opens with no Host tools.
  ctx.effect(() => installAcp(ctx, {
    workerTools: config.workerTools ?? defaultWorkerTools,
    profiles: () => agentsOf(config),
    coordinator: () => runtime && { workerFacts: (agent: Agent) => runtime!.acpWorkerFacts(agent) },
  }))
  // The built-in Antigravity side: one install helper over `config.agy` owning the
  // provider route, the `/agy` command, `agy_ask`/`agy_tool`, the
  // `/plugins/agy-worker/*` surface and its timers. It lives under this plugin's
  // single identity — no second entry, no second state directory — and the
  // returned disposer unwinds everything it registered.
  ctx.effect(() => installAgy(ctx, config.agy ?? {}))
  // Each combo's entry admits what its own Lead admits: the Lead is the only
  // role that reads user content, while the Worker receives text work orders.
  // This resolves through the other providers' own model info, never through
  // this adapter, so listing Fusion cannot recurse into itself.
  const fusionModels = async (): Promise<readonly FusionModelEntry[]> => {
    let items: readonly { id: string; name: string; pair: PairChoice }[]
    try { items = readPairs(store).pairs } catch { return [] }
    if (!items.length && config.profilePath && isAbsolute(config.profilePath)) {
      const pair = choiceFromStoredProfile(loadJsonObject(config.profilePath))
      items = pair ? [{ id: FUSION_MODEL, name: '自动', pair }] : []
    }
    return Promise.all(items.map(async item => {
      let modalities: readonly ModelModality[] = []
      try {
        // An unresolvable Lead route (unregistered provider, retired model, broken
        // profile file) cannot verify image support; the entry stays text-only.
        modalities = (await ctx.llm.resolveModelInfo(item.pair.lead.provider, item.pair.lead.model)).inputModalities ?? []
      } catch { modalities = [] }
      return { id: item.id, name: `Fusion · ${item.name}`, inputModalities: modalities }
    }))
  }
  ctx.effect(() => ctx.llm.registerAdapter([FUSION_PROVIDER], new FusionCatalogAdapter(fusionModels)))
  ctx.effect(() => installNativeFusionSelection(ctx, {
    coordinator: () => runtime,
    profile: profileOf,
    // A combo that cannot run yet says why, instead of the generic "configure first".
    reason: model => combos?.failures.get(model)
      ?? (combos?.items.length ? bi('该组合已被删除或无法使用，请在模型菜单中选择其他组合。', 'That combo was removed or cannot run; pick another one in the model menu.') : undefined),
    selection: agent => {
      const selection = agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')
      if (selection?.type === 'model/selection') return selection.data
      const bound = bindings.read(agent.id)?.binding
      if (bound?.selected) return { provider: FUSION_PROVIDER, model: modelOfProfileId(bound.profile.id) ?? FUSION_MODEL }
      const header = agent.session.requestHeader()
      return header ? { provider: header.config.provider, model: header.config.model } : ctx.agentDefaultModel.currentSelection()
    },
  }))
  // Frozen bindings must be restored before another user request is allowed.
  const restoreFailure = new Map<string, string>()
  ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
    const binding = bindings.read(payload.agent.id)?.binding
    if (!binding?.selected) return next()
    try { await getRuntime({ profile: binding.profile, prompts: binding.prompts }); if (restoreFailure.has(payload.agent.id)) restoreFailure.delete(payload.agent.id) }
    catch (error) { restoreFailure.set(payload.agent.id, String(error)); return { kind: 'reject' } }
    return next()
  }, { prepend: true }))
  const apiHandler: Parameters<Context['webServer']['register']>[0]['handler'] = async (req, res) => {
    if (!trustedRequest(req)) return json(res, 403, { error: 'forbidden' })
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (req.method === 'GET') {
        if (url.searchParams.get('view') === 'history') return json(res, 200, readHistory(store, url.searchParams.get('cursor') ?? ''))
        if (url.searchParams.get('view') === 'activity') return json(res, 200, await readHistoricalFusionActivity(ctx, store,
          url.searchParams.get('sessionId') ?? '', url.searchParams.get('callId') ?? '', Number(url.searchParams.get('after') ?? -1)))
        if (url.searchParams.get('view') === 'status') {
          const abort = new AbortController(), disconnected = () => abort.abort()
          res.once('close', disconnected)
          try {
            const status = await readFusionStatusAsync(store, url.searchParams.get('sessionId') ?? '', abort.signal)
            if (!res.destroyed) return json(res, 200, status)
            return
          } catch (error) { if (!abort.signal.aborted) throw error; return }
          finally { res.off('close', disconnected) }
        }
        if (url.searchParams.get('view') === 'catalog') return json(res, 200, await ctx.sessionController.modelCatalog())
        if (url.searchParams.get('view') === 'cache') {
          let pairs: { lead: { provider: string; model: string }; worker: { provider: string; model: string }; cacheKeepalive?: PairChoice['cacheKeepalive'] }[] = []
          try { pairs = [...(await knownCombos()).profiles.values()].map(profile => ({ lead: profile.profile.lead,
            worker: profile.profile.worker, cacheKeepalive: profile.profile.cacheKeepalive })) } catch { pairs = [] }
          return json(res, 200, { checked: CACHE_DEFAULTS_CHECKED, models: cacheView(cachePolicy, pairs) })
        }
        if (url.searchParams.get('view') === 'prices') {
          // The seeded rates plus every saved override, so the panel can show both
          // what a model is priced at and whether that came from the user.
          const overrides = readPriceSettings(store)
          const document = store.readDocument(PRICE_OVERRIDES_DOCUMENT)
          return json(res, 200, { checked: PRICE_CARDS_CHECKED, revision: document?.revision ?? 0,
            models: pricedModels(overrides).map(model => {
              const card = cardForModel(model, overrides)
              return { model, input: card?.input ?? null, cacheRead: card?.cacheRead ?? null, output: card?.output ?? null,
                overridden: Object.hasOwn(overrides, model), unpriced: card === undefined }
            }) })
        }
        if (url.searchParams.get('view') === 'settings') {
          // Resolved fresh: the revision a save sends must match the one shown.
          const state = await resolveCombos()
          const pairs = state.items.map(item => {
            const profile = state.profiles.get(item.id)
            if (!profile) return { id: item.id, name: item.name, pair: item.pair, authorized: false, reason: state.failures.get(item.id) }
            let authorized = false, reason: string | undefined
            try { if (needsBudget(profile.profile)) budget.check(profileRoutes(profile.profile)); authorized = true }
            catch (error) { reason = error instanceof Error ? error.message : String(error) }
            return { id: item.id, name: item.name, pair: choiceFromProfile(profile.profile), authorized, ...(reason ? { reason } : {}) }
          })
          const blocked = pairs.find(pair => !pair.authorized)
          return json(res, 200, { revision: state.revision, catalog: await physicalCatalog(), pairs, maxPairs: MAX_PAIRS,
            // The first combo is what the single-pair page and older tabs read.
            pair: pairs[0]?.pair ?? null, authorized: pairs.length > 0 && !blocked,
            ...(blocked?.reason ? { reason: blocked.reason } : {}),
            managedAuthorization: Boolean(config.authorizationPath),
            policy: state.profiles.values().next().value?.profile.interactionMode ?? 'model-like' })
        }
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const binding = sessionId && bindings.read(sessionId)?.binding
        let available = false, reason: string | undefined
        try {
          const profile = binding && binding.selected ? { profile: binding.profile, prompts: binding.prompts } : await primaryProfile()
          const controller = await getRuntime(profile)
          controller.transport.assertAvailable()
          if (needsBudget(profile.profile)) budget.check(profileRoutes(profile.profile))
          available = true
        } catch (error) { reason = error instanceof Error ? error.message : String(error) }
        const state = binding && store.load(binding.taskId)
        return json(res, 200, { selected: Boolean(binding && binding.selected), available, ...(reason ? { reason } : {}),
          ...(state ? { task: { id: state.taskId, phase: state.phase, verification: state.verification, workerId: state.acceptedChild } } : {}) })
      }
      if (req.method === 'DELETE') {
        const taskId = url.searchParams.get('taskId')
        if (!taskId) return json(res, 400, { error: bi('缺少任务标识', 'Missing task id') })
        try {
          // The coordinator is the only authority that can see in-process Agents,
          // tool calls and leases. It exists whenever this Host has served the plugin;
          // without one, nothing in this process owns the task.
          store.deleteTask(taskId, { liveReason: id => runtime?.liveWork(id) })
          return json(res, 200, { ok: true, taskId })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          // Decide on the stored code, not on message text: a translated message would silently become a 500.
          if (error instanceof FusionError && error.code === TASK_NOT_FOUND) return json(res, 404, { error: message })
          if (error instanceof FusionError && error.code === TASK_BUSY) {
            const blocker = error instanceof DeletionBlocked ? error.blocker : undefined
            const detail = error instanceof DeletionBlocked ? error.detail : undefined
            return json(res, 409, { error: message, ...(blocker ? { blocker } : {}), ...(detail ? { detail } : {}) })
          }
          return json(res, 500, { error: message })
        }
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
      const body = await readJson(req)
      if (['continue', 'switch-role', 'schedule', 'cancel-schedule'].includes(String(body.action))) {
        if (typeof body.sessionId !== 'string' || typeof body.taskId !== 'string' || !Number.isSafeInteger(body.revision)) throw new Error(bi('恢复参数无效', 'Invalid recovery parameters'))
        const saved = bindings.read(body.sessionId)
        if (!saved?.binding.selected || saved.binding.taskId !== body.taskId || saved.binding.profile.interactionMode !== 'model-like') throw new Error(bi('当前任务不支持此恢复操作', 'This task does not support that recovery action'))
        const binding = saved.binding
        const controller = await getRuntime({ profile: binding.profile, prompts: binding.prompts })
        if (needsBudget(binding.profile)) budget.check(effectiveRoutes(binding))
        if (body.action === 'cancel-schedule') {
          const row = store.readDocument(`model-control:${body.sessionId}`)
          if (row?.revision !== body.revision) throw new Error(bi('状态已变化，请刷新', 'The state changed; refresh'))
          controller.modelControl.cancel(binding)
        } else if (body.action === 'schedule') {
          if (typeof body.dueAt !== 'string') throw new Error(bi('请选择继续时间', 'Choose when to continue'))
          await controller.modelControl.schedule(body.sessionId, body.taskId, Number(body.revision), body.dueAt)
        } else {
          let change: { role: 'lead' | 'worker'; route: typeof binding.profile.lead } | undefined
          if (body.action === 'switch-role') {
            if (body.role !== 'lead' && body.role !== 'worker') throw new Error(bi('请选择要更换的角色', 'Choose the role to switch'))
            const pair = validatePairChoice({ lead: body.route, worker: body.route }, await physicalCatalog())
            change = { role: body.role, route: pair.lead }
            if (needsBudget(binding.profile)) budget.check(profileRoutes({ ...binding.profile,
              lead: controller.modelControl.route(binding, 'lead'), worker: controller.modelControl.route(binding, 'worker'), [change.role]: change.route }))
          }
          await controller.modelControl.continue(body.sessionId, body.taskId, Number(body.revision), change)
        }
        return json(res, 200, { ok: true })
      }
      if (body.action === 'cache-setting') {
        if (typeof body.provider !== 'string' || typeof body.model !== 'string' || !body.provider || !body.model) throw new Error(bi('请选择模型', 'Choose a model'))
        const setting = body.reset === true ? null : {
          ...(body.mode === undefined || body.mode === null ? {} : { mode: body.mode as 'auto' | 'on' | 'off' }),
          ...(body.intervalSeconds === undefined || body.intervalSeconds === null ? {} : { intervalSeconds: Number(body.intervalSeconds) }) }
        cachePolicy.save(body.provider, body.model, setting)
        return json(res, 200, { ok: true })
      }
      if (body.action === 'price-setting') {
        if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error(bi('价目表版本无效，请刷新后重试', 'Invalid price revision; refresh and retry'))
        if (typeof body.model !== 'string' || !body.model.trim()) throw new Error(bi('请选择模型', 'Choose a model'))
        const current = readPriceSettings(store)
        const key = body.model.trim().toLowerCase()
        // `reset` returns the model to the seeded rate; `null` records that this
        // model should not be priced at all, which is different from leaving it out.
        const next: Record<string, unknown> = { ...current }
        if (body.reset === true) delete next[key]
        else if (body.unpriced === true) next[key] = null
        else next[key] = { input: body.input, cacheRead: body.cacheRead, output: body.output }
        const revision = writePriceSettings(store, Number(body.revision), next)
        return json(res, 200, { ok: true, revision })
      }
      if (body.action === 'configure') {
        if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error(bi('配置版本无效，请刷新后重试', 'Invalid settings revision; refresh and retry'))
        const catalog = await physicalCatalog(), current = readPairs(store)
        // A tab from before combos existed sends one pair; keep the other combos
        // and let it edit only the first one it can see.
        const proposed = Array.isArray(body.pairs) ? body.pairs
          : [{ ...(current.pairs[0] ?? { id: FUSION_MODEL, name: '自动' }), pair: body.pair }, ...current.pairs.slice(1)]
        const pairs = validatePairs(proposed, catalog, current.pairs)
        const revision = writePairs(store, Number(body.revision), pairs)
        const state = await resolveCombos()
        const profile = state.profiles.values().next().value
        if (profile) await getRuntime(profile)
        return json(res, 200, { ok: true, revision })
      }
      if (body.action === 'authorize') {
        if (config.authorizationPath) throw new Error(bi('运行额度由外部授权文件管理，不能在此覆盖', 'Run limits are managed by an external authorization file and cannot be overridden here'))
        if (readPairs(store).revision !== body.revision) throw new Error(bi('组合列表已变化，请刷新后再启用额度', 'The combo list changed; refresh before enabling limits'))
        // One authorization must cover every combo the menu can offer.
        const state = await resolveCombos()
        if (readPairs(store).revision !== body.revision) throw new Error(bi('组合列表已变化，请刷新后再启用额度', 'The combo list changed; refresh before enabling limits'))
        const auth = authorizeConfiguredPair(store, [...state.profiles.values()].flatMap(profile => profileRoutes(profile.profile)), body.limits)
        return json(res, 200, { ok: true, expiresAt: auth.expiresAt })
      }
      throw new Error(bi('请使用原模型菜单选择 Fusion 或切换普通模型', 'Use the model menu to select Fusion or another model'))
    } catch (error) { return json(res, 409, { error: error instanceof Error ? error.message : String(error) }) }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: FUSION_API_PATH, handler: apiHandler }))
  // A tab still running the pre-rename bundle asks the old path until it is
  // reloaded. Keep answering it from the same handler; nothing new uses it.
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: LEGACY_FUSION_API_PATH, handler: apiHandler }))
  ctx.effect(() => ctx.commands.register({ name: 'fusion', description: bi('Fusion 状态、暂停、恢复与退出（不调用模型）', 'Fusion status, pause, resume and exit (no model call)'),
    input: { hint: bi('status | pause | resume | recover [--effects-stopped] <检查记录> | off', 'status | pause | resume | recover [--effects-stopped] <inspection note> | off') },
    handler: async invocation => {
      const [action = 'status', ...note] = invocation.rawInput.trim().split(/\s+/)
      try {
        const binding = bindings.read(invocation.agent.id)?.binding
        if (!binding?.selected) return { kind: 'success', text: bi('当前会话未启用 Fusion。请在模型选择器中选择一个 Fusion 组合。', 'Fusion is not selected in this conversation. Choose a Fusion combo in the model menu.') }
        if (action === 'status' || action === '') {
          const controller = await getRuntime({ profile: binding.profile, prompts: binding.prompts })
          const state = store.load(binding.taskId)!
          const unfinishedEffects = controller.effects.pending(binding.taskId).map(({ record }) => ({ role: record.role, tool: record.toolName }))
          const usage = store.listDocumentIds(`usage:${state.taskId}:`).map(id => store.readDocument(id)!.value as { purpose?: string })
          return { kind: 'success', text: JSON.stringify({ taskId: state.taskId, phase: state.phase, verification: state.verification,
            control: state.control, workerId: state.acceptedChild, modelCalls: usage.length,
            cacheKeepaliveCalls: usage.filter(row => row.purpose === 'cache-keepalive').length,
            compactionCalls: usage.filter(row => row.purpose === 'compaction').length,
            unfinishedEffects, ...(unfinishedEffects.length ? { recoveryHint: bi('请核对中断的工具操作，确认对应命令及子进程已停止；Host 退出不代表这些操作已结束。', 'Check the interrupted tool operations and confirm their commands and child processes stopped; a Host exit does not end them.') } : {}),
            ...(() => {
              // The same money the panel shows, so `/fusion status` and the panel
              // never disagree. Read-only: this never starts an agent or a model call.
              const status = readFusionStatus(store, invocation.agent.id)
              return status.task?.cost ? { cost: status.task.cost } : {}
            })() }, null, 2) }
        }
        const controller = await getRuntime({ profile: binding.profile, prompts: binding.prompts })
        if (action === 'pause') { controller.modelControl.cancel(binding); await controller.pause(invocation.agent) }
        else if (action === 'resume') {
          const authorizationId = needsBudget(binding.profile) ? budget.check(effectiveRoutes(binding)).authorizationId : 'native-account'
          if (binding.profile.interactionMode === 'model-like') await controller.modelControl.continue(binding.sessionId, binding.taskId,
            store.readDocument(`model-control:${binding.sessionId}`)?.revision ?? 0)
          else await controller.resume(invocation.agent, authorizationId)
        } else if (action === 'recover') await controller.reconcile(invocation.agent, { commandId: invocation.commandId,
          effectsStopped: note[0] === '--effects-stopped', note: (note[0] === '--effects-stopped' ? note.slice(1) : note).join(' ') })
        else if (action === 'off') {
          await controller.clear(invocation.agent)
          await ctx.sessionController.selectModel({ sessionId: SessionId(invocation.agent.id), ...binding.profile.lead })
        }
        else throw new Error(bi('使用 /fusion status、pause、resume、recover <检查记录> 或 off', 'Use /fusion status, pause, resume, recover <inspection note> or off'))
        return { kind: 'success', text: action === 'resume' ? binding.profile.interactionMode === 'model-like' ? bi('已通过原生收件箱提交一次继续操作。', 'One continuation was submitted through the native inbox.') : bi('Fusion 已恢复。发送下一条消息继续当前任务。', 'Fusion resumed. Send a message to continue the task.') : bi(`Fusion ${action} 已完成。`, `Fusion ${action} done.`) }
      } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : String(error) } }
    } }))
  ctx.effect(() => async () => { if (creating) await creating.catch(() => undefined); if (runtime) await runtime.close(); store.close() })
  // Warm only configuration/scopes; initialization performs no inference.
  try { await getRuntime(await primaryProfile()) }
  catch {
    const selected = bindings.selected()[0]
    if (selected) await getRuntime({ profile: selected.profile, prompts: selected.prompts })
  }
  ctx.logger.info('[my-plugins/dsh-fusion] loaded')
}
