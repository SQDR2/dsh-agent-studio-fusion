/**
 * The DSH LLM adapter that turns each configured ACP agent into a model route.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 *
 * Additions for Fusion: when a new ACP session is opened for a request that the bridge
 * authority accepts (a live Fusion Sidekick turn on this route), the adapter attaches the
 * Host-tool MCP bridge to that `session/new`. Every other request — Lead turns, plain ACP
 * route use, discovery, compaction, text mode, absent sessions — opens with no servers.
 *
 * The bridge lives exactly as long as the dispatch that earned it. The adapter revokes it
 * (and aborts its in-flight calls) when the turn aborts, times out or is abandoned by its
 * consumer, when the ACP session is replaced, when setup fails after the declaration, when
 * the route's profile changes or disappears, when the adapter is disposed, and whenever
 * the bridge itself reports that the reused session's authorization no longer holds. A
 * plain successful turn keeps it, because that same session is reused for the next step of
 * the same work order.
 */

import type { ContentBlock as AcpContentBlock, PromptResponse, Usage } from '@agentclientprotocol/sdk'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ModelModality,
  ReasoningEffortId,
  ResolvedRetryPolicy,
  StreamChunk,
  TokenUsage,
} from '@deepseek-ai/dsh-llm'
import type { AcpHost } from './host.js'
import type { AcpBridgeRequest, AcpToolBridge } from './bridge.js'
import type { AcpAdvertisedModel, AcpSession } from './agent-process.js'
import type { AcpPromptCapabilities } from './prompt-capabilities.js'
import type { PromptImage, PromptImages } from './transcript.js'
import type { PermissionTurn } from './permission.js'
import type { AcpAgentProfile, AcpMcpServerHttp } from './types.js'
import { homedir } from 'node:os'
import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL_ID, spawnFacts } from './config.js'
import { AcpAgentProcess, applyConfigOptions } from './agent-process.js'
import { addUsage, ChunkTranslator, metaUsage, usageDelta } from './chunk-translator.js'
import { ContextWindows, inferContextWindow } from './context-windows.js'
import { decidePermission, noteToolCall } from './permission.js'
import { PromptCapabilitiesCache } from './prompt-capabilities.js'
import { consumedIds, conversationOf, fullPrompt, incrementalPrompt, systemText } from './transcript.js'

const PLUGIN_ID = 'dsh-fusion'

interface Binding {
  session: AcpSession
  cwd: string
  model: string
  consumed: string[]
  usage: Usage | undefined
}

const TEXT_ONLY: readonly ModelModality[] = ['text']

const TEXT_AND_IMAGE: readonly ModelModality[] = ['text', 'image']

/** What a turn learned beside its stream, for {@link AcpAdapter.finish}. */
interface TurnFacts {
  permissions: PermissionTurn
  /** Usage the agent reported per model call; prompt-response usage wins over it. */
  usage: TokenUsage | undefined
  /** Whether this side asked the agent to cancel the turn. */
  cancelRequested: boolean
}

type Outcome =
  | { kind: 'response', response: PromptResponse }
  | { kind: 'error', error: unknown }
  | { kind: 'aborted' }
  | { kind: 'timeout' }

const NO_RETRY = { mode: 'normal', maxRetries: 0 } as const

const CANCEL_GRACE_MS = 5_000

const DENIED_TITLE_CHARS = 160

function failure(code: string, message: string): { code: string, message: string } {
  return { code, message }
}

function failureOf(error: unknown): { code: string, message: string } {
  const known = typeof error === 'object' && error !== null ? Reflect.get(error, 'failure') as { code?: unknown, message?: unknown } | undefined : undefined
  if (typeof known?.code === 'string' && typeof known.message === 'string')
    return failure(known.code, known.message)
  return failure('TRANSPORT', error instanceof Error ? error.message : String(error))
}

/** The narrow bridge surface the adapter needs; production is {@link AcpToolBridge}. */
export interface AcpBridgeMount {
  serversFor(request: AcpBridgeRequest): AcpMcpServerHttp[]
  /**
   * Whether an ACP session may keep being reused: a reused session never runs
   * `session/new`, so its bridge token must still match the current work order. `false`
   * means the session is replaced, and the bridge it carried has been revoked.
   */
  canReuse?(request: AcpBridgeRequest): boolean
  revokeSession(dshSessionId: string): void
  cancelInflight(dshSessionId: string): void
}

/** The provider route one binding key belongs to: the key is `${route}\u0000${sessionId}`. */
function routeOfKey(key: string): string {
  return key.slice(0, key.indexOf('\u0000'))
}

/** The DSH session one binding key belongs to: the key is `${route}\u0000${sessionId}`. */
function sessionOfKey(key: string): string {
  return key.slice(key.indexOf('\u0000') + 1)
}

export class AcpAdapter extends LlmAdapter {
  private readonly agents = new Map<string, { process: AcpAgentProcess, facts: string }>()
  private readonly bindings = new Map<string, Binding>()
  private readonly turns = new Map<string, PermissionTurn>()
  /** DSH sessions this adapter declared a Host-tool bridge for, so teardown can revoke them. */
  private readonly bridged = new Set<string>()
  private readonly retryPolicy: ResolvedRetryPolicy = resolveRetryPolicy(NO_RETRY, `${PLUGIN_ID}: retryPolicy`)

  constructor(
    private readonly host: AcpHost,
    private readonly profiles: () => ReadonlyMap<string, AcpAgentProfile>,
    private readonly contextWindows: ContextWindows = new ContextWindows(),
    private readonly capabilities: PromptCapabilitiesCache = new PromptCapabilitiesCache(),
    private readonly bridge: AcpBridgeMount | undefined = undefined,
  ) {
    super()
  }

  sync(): void {
    const profiles = this.profiles()
    for (const [route, entry] of this.agents) {
      const profile = profiles.get(route)
      if (profile !== undefined && spawnFacts(profile) === entry.facts)
        continue
      // Revoke and close this route's bridged sessions while its process is still alive,
      // then dispose the process that owns them.
      this.dropBindings(route)
      entry.process.dispose()
      this.agents.delete(route)
    }
  }

  dispose(): void {
    // Nothing this adapter opened may outlive it: every grant it declared is revoked, every
    // in-flight bridged call aborted, and every ACP session it bound is closed while its
    // owning process is still alive.
    for (const dshSessionId of [...this.bridged])
      this.#revokeBridge(dshSessionId)
    for (const entry of this.agents.values())
      entry.process.dispose()
    this.agents.clear()
    this.bindings.clear()
    this.turns.clear()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.profiles().get(provider)?.displayName ?? provider }
  }

  override providerRetryPolicy(): ResolvedRetryPolicy {
    return this.retryPolicy
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const profile = this.profiles().get(provider)
    if (profile === undefined)
      return []
    const fallback = (): LlmModelInfo => ({ provider, id: DEFAULT_MODEL_ID, name: `${profile.displayName ?? provider} (default)`, ...this.modalities(provider) })
    if (profile.models.length > 0) {
      return profile.models.map(model => ({
        provider,
        id: model.id,
        name: model.name ?? model.id,
        ...model.description === undefined ? {} : { description: model.description },
        ...this.modalities(provider),
      }))
    }
    if (!profile.discoverModels)
      return [fallback()]
    try {
      const found = await this.advertisedModels(provider)
      if (found.length === 0)
        return [fallback()]
      return [fallback(), ...found.map(model => ({
        provider,
        id: model.id,
        name: model.name,
        ...model.description === undefined ? {} : { description: model.description },
        ...this.modalities(provider),
      }))]
    }
    catch (error) {
      this.host.logger.warn(`${PLUGIN_ID}: model discovery for ACP agent "${provider}" failed`, error)
      return [fallback()]
    }
  }

  /**
   * Ask the agent behind one configured route which models it advertises, regardless of
   * the profile's declared `models` and `discoverModels` switch. Settings surfaces use this
   * to offer the agent's own list for adoption.
   */
  async advertisedModels(provider: string, signal?: AbortSignal): Promise<readonly AcpAdvertisedModel[]> {
    const profile = this.profiles().get(provider)
    if (profile === undefined)
      throw new LlmError(`${PLUGIN_ID}: no ACP agent is configured for provider "${provider}"`, 'PROVIDER_NOT_FOUND')
    return this.agent(provider, profile).discoverModels(profile.cwd ?? homedir(), signal)
  }

  /**
   * Exact-model metadata. Capabilities come from the agent itself: accepted input from the
   * `promptCapabilities` of its ACP handshake (learned here, remembered across restarts),
   * reasoning efforts from the `thought_level` option it offers for this very model, and the
   * context window it last reported through `usage_update`, else the one its model list
   * states, else one a "1m" token in the model's id, name or description implies.
   */
  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const profile = this.profiles().get(provider)
    await this.learnCapabilities(provider, signal)
    if (profile?.discoverModels === true)
      await this.learnModel(provider, profile, model, signal)
    const process = this.agents.get(provider)?.process
    const configured = profile?.models.find(entry => entry.id === model)
    const advertised = process?.advertisedModels?.find(entry => entry.id === model)
    // "default" runs on whichever model the agent itself starts on.
    const agentModel = model === DEFAULT_MODEL_ID ? process?.defaultModel : model
    const advertisedWindow = process?.advertisedModels?.find(entry => entry.id === agentModel)?.contextWindow
    const efforts = process?.effortsFor(model)
    return {
      provider,
      id: model,
      name: configured?.name ?? advertised?.name ?? model,
      ...this.modalities(provider),
      context: {
        contextWindow: configured?.contextWindow
          ?? this.contextWindows.get(provider, model)
          ?? advertisedWindow
          ?? inferContextWindow(model, configured?.name, configured?.description, advertised?.name, advertised?.description)
          ?? profile?.contextWindow
          ?? DEFAULT_CONTEXT_WINDOW,
      },
      ...efforts === undefined
        ? {}
        : {
            reasoning: {
              efforts: efforts.available.map(level => ({
                id: level.id as ReasoningEffortId,
                name: level.name,
                ...level.description === undefined ? {} : { description: level.description },
              })),
              // The level a fresh session starts with. Without it the picker adds its own
              // "Default" entry, which duplicates agents that already offer one.
              ...efforts.available.some(level => level.id === efforts.initial) ? { defaultEffort: efforts.initial as ReasoningEffortId } : {},
            },
          },
    }
  }

  /**
   * Ask the agent about one model before dsh uses it: the models it advertises (with any
   * context windows they state) and the thought levels it offers for that model.
   */
  private async learnModel(provider: string, profile: AcpAgentProfile, model: string, signal?: AbortSignal): Promise<void> {
    try {
      if (this.agents.get(provider)?.process.advertisedModels === undefined)
        await this.advertisedModels(provider, signal)
      await this.agent(provider, profile).learnEfforts(model, profile.cwd ?? homedir(), signal)
    }
    catch (error) {
      this.host.logger.warn(`${PLUGIN_ID}: probing ACP agent "${provider}" for model metadata failed`, error)
    }
  }

  /**
   * What the route accepts as input. dsh reads an omitted `inputModalities` as "unknown" and
   * sends images through untouched, while an explicit list without `image` is a negative it
   * acts on by replacing every attachment with text before the adapter is even called. So an
   * agent whose handshake nobody has heard yet must stay silent rather than claim text only.
   */
  private modalities(provider: string): { inputModalities?: readonly ModelModality[] } {
    const mode = this.profiles().get(provider)?.imageInput ?? 'auto'
    // Without an attachment store there are no image bytes to send, whatever the agent accepts.
    if (mode === 'off' || this.host.readImage === undefined)
      return { inputModalities: TEXT_ONLY }
    if (mode === 'force')
      return { inputModalities: TEXT_AND_IMAGE }
    const known = this.promptCapabilitiesOf(provider)
    if (known === undefined)
      return {}
    return { inputModalities: known.image ? TEXT_AND_IMAGE : TEXT_ONLY }
  }

  /** The running agent's handshake answer, else the one it gave for these spawn facts before. */
  private promptCapabilitiesOf(provider: string): AcpPromptCapabilities | undefined {
    const live = this.agents.get(provider)?.process.promptCapabilities
    if (live !== undefined)
      return live
    const profile = this.profiles().get(provider)
    return profile === undefined ? undefined : this.capabilities.get(provider, spawnFacts(profile))
  }

  /**
   * Make sure the ACP handshake has happened at least once, since that is where an agent
   * states the content types it accepts. The answer is cached per route, so this starts an
   * agent only the first time dsh asks about a route it has never heard from.
   */
  private async learnCapabilities(provider: string, signal?: AbortSignal): Promise<void> {
    const profile = this.profiles().get(provider)
    if (profile === undefined || (profile.imageInput ?? 'auto') !== 'auto' || this.host.readImage === undefined)
      return
    if (this.promptCapabilitiesOf(provider) !== undefined)
      return
    await this.agent(provider, profile).probeCapabilities(signal).catch((error: unknown) => {
      this.host.logger.warn(`${PLUGIN_ID}: asking ACP agent "${provider}" which content it accepts failed`, error)
    })
  }

  /** Read every image the prompt wants, as base64 request versions; unreadable ones stay text. */
  private async readImages(wanted: PromptImages['wanted'], signal: AbortSignal | undefined): Promise<Map<string, PromptImage>> {
    const read = new Map<string, PromptImage>()
    const readImage = this.host.readImage
    if (readImage === undefined)
      return read
    await Promise.all([...wanted].map(async ([id, ref]) => {
      try {
        const image = await readImage(ref, signal)
        read.set(id, { data: Buffer.from(image.data).toString('base64'), mimeType: image.mediaType, width: image.width, height: image.height })
      }
      catch (error) {
        this.host.logger.warn(`${PLUGIN_ID}: could not read image attachment ${id}; sending its text handle instead`, error)
      }
    }))
    return read
  }

  override async* stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    let finished = false
    try {
      for await (const chunk of this.run(options)) {
        finished ||= chunk.type === 'finish'
        yield chunk
      }
    }
    catch (error) {
      if (finished)
        throw error
      // A thrown dispatch error ends this dispatch's capability *before* the caller sees the
      // error finish: a caller may stop consuming right after it, so waiting for this
      // generator to close would leave the grant alive. An auxiliary call owns none, so its
      // failure must leave the live Worker's grant untouched.
      if ((options.purpose as string | undefined) === undefined)
        this.#revokeBridge(options.sessionId as string | undefined)
      yield { type: 'finish', reason: options.signal?.aborted ? { kind: 'aborted', failure: failure('ABORTED', 'request aborted') } : { kind: 'error', failure: failureOf(error) } }
    }
    finally {
      // The consumer stopped iterating before the turn settled, so it never saw a finish
      // chunk: the dispatch is over and its Host-tool capability goes with it. An
      // auxiliary request owns no capability, so it never revokes the live one belonging to
      // the session it borrows the id from.
      if (!finished && (options.purpose as string | undefined) === undefined)
        this.#revokeBridge(options.sessionId as string | undefined)
    }
  }

  private async* run(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const route = options.provider
    const profile = this.profiles().get(route)
    if (profile === undefined)
      throw new LlmError(`${PLUGIN_ID}: no ACP agent is configured for provider "${route}"`, 'PROVIDER_NOT_FOUND')
    const signal = options.signal
    if (signal?.aborted) {
      yield { type: 'finish', reason: { kind: 'aborted', failure: failure('ABORTED', 'request aborted before start') } }
      return
    }
    const agent = this.agent(route, profile)
    const purpose = options.purpose as string | undefined
    const dshSessionId = options.sessionId as string | undefined
    const ephemeral = dshSessionId === undefined || purpose !== undefined
    // Only a non-auxiliary dispatch owns the Host-tool capability bound to this DSH session.
    // An auxiliary call (discovery, compaction, session-title) borrows that session id, so it
    // must never revoke, abort or close the capability a live Worker turn holds.
    const capability = ephemeral ? undefined : dshSessionId
    const key = `${route}\u0000${dshSessionId ?? ''}`
    const cwd = this.cwdOf(dshSessionId, profile)
    const conversation = conversationOf(options)
    const system = profile.systemPrompt === 'forward' ? systemText(options) : undefined

    const effort = options.reasoningEffort as string | undefined
    let images: PromptImages = { read: new Map(), wanted: new Map() }
    let binding = ephemeral ? undefined : this.bindings.get(key)
    const bridgeRequest = { sessionId: dshSessionId, purpose, route, model: options.model }
    let reused = binding !== undefined && binding.session.generation === agent.generation && binding.cwd === cwd && binding.model === options.model
      // A reused ACP session keeps its earlier bridge token, which is only still valid while
      // the same task, work order and route apply. Otherwise the session is replaced so a
      // freshly authorized bridge is declared.
      && (this.bridge?.canReuse?.(bridgeRequest) ?? true)
    const consumedBefore = reused ? binding!.consumed : []
    let prompt = reused ? incrementalPrompt(conversation, consumedBefore, route, images) : undefined
    if (prompt === undefined || binding === undefined) {
      reused = false
      // Replacing the ACP session invalidates its Host-tool bridge before the new one is
      // issued; #revokeBridge closes that stored session on its own process.
      if (binding !== undefined)
        this.#revokeBridge(capability)
      const servers = this.#bridgeServers(bridgeRequest)
      let opened: AcpSession | undefined
      try {
        opened = await agent.newSession(cwd, signal, servers)
        await agent.selectModel(opened, options.model, signal)
      }
      catch (error) {
        // A failed setup ends the capability this very dispatch was authorized for: revoke
        // the token and abort anything already dispatched under it. The half-open ACP session
        // was never stored as a binding, so it is closed here and only here.
        this.#revokeBridge(capability)
        if (opened !== undefined)
          agent.closeSession(opened)
        throw error
      }
      binding = { session: opened, cwd, model: options.model, consumed: [], usage: undefined }
      images = { read: new Map(), wanted: new Map() }
      prompt = fullPrompt(conversation, system, images)
    }
    const wantedEffort = effort ?? binding.session.efforts?.initial
    try {
      if (wantedEffort !== undefined)
        await agent.selectEffort(binding.session, wantedEffort, signal)
      if (images.wanted.size > 0 && agent.supportsImages) {
        images = { read: await this.readImages(images.wanted, signal), wanted: new Map() }
        prompt = reused ? incrementalPrompt(conversation, consumedBefore, route, images) ?? prompt : fullPrompt(conversation, system, images)
      }
    }
    catch (error) {
      // The turn never started, so the authorization *this* dispatch carried must not
      // survive it. A freshly opened session is not in `bindings` yet (and an ephemeral one
      // never is), so #revokeBridge cannot own it — close it here, exactly once. A stored,
      // reused binding is already closed by #revokeBridge through its owning process.
      const stored = !ephemeral && this.bindings.get(key) === binding
      this.#revokeBridge(capability)
      if (!stored)
        agent.closeSession(binding.session)
      throw error
    }
    if (!ephemeral)
      this.bindings.set(key, binding)
    binding.consumed = consumedIds(conversation)

    const session = binding.session
    const translator = new ChunkTranslator(profile.showToolCalls)
    const queue: StreamChunk[] = []
    let outcome: Outcome | undefined
    let wake: (() => void) | undefined
    const notify = (): void => {
      wake?.()
      wake = undefined
    }
    const settle = (next: Outcome): void => {
      outcome ??= next
      notify()
    }

    const facts: TurnFacts = { permissions: { dshSessionId, signal, tools: new Map() }, usage: undefined, cancelRequested: false }

    let idleTimer: NodeJS.Timeout | undefined
    const armIdle = (): void => {
      if (profile.idleTimeoutMs <= 0)
        return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        facts.cancelRequested = true
        agent.cancel(session)
        // A turn that timed out is over, and the capability this dispatch owned ends with
        // it: the next turn must be authorized again rather than reuse this grant. An
        // auxiliary call owns none, so a timed-out compaction leaves the Worker's alone.
        this.#revokeBridge(capability)
        settle({ kind: 'timeout' })
      }, profile.idleTimeoutMs)
    }
    let cancelTimer: NodeJS.Timeout | undefined
    const onAbort = (): void => {
      facts.cancelRequested = true
      agent.cancel(session)
      // A cancelled turn ends the capability it was running under: stop its in-flight
      // bridged calls, revoke the token, and close the ACP binding so the next turn opens a
      // fresh session with a freshly authorized bridge. An auxiliary call borrows the DSH
      // session id only, and must leave the live Worker's capability untouched.
      this.#revokeBridge(capability)
      cancelTimer = setTimeout(() => settle({ kind: 'aborted' }), CANCEL_GRACE_MS)
    }

    this.turns.set(session.sessionId, facts.permissions)
    signal?.addEventListener('abort', onAbort, { once: true })
    armIdle()
    const model = binding.model
    agent.prompt(session, prompt, (update) => {
      armIdle()
      noteToolCall(facts.permissions.tools, update)
      if (update.sessionUpdate === 'usage_update') {
        if (update.size > 0)
          this.contextWindows.set(route, model, update.size)
        const call = metaUsage(update._meta)
        if (call !== undefined)
          facts.usage = addUsage(facts.usage, call)
      }
      else if (update.sessionUpdate === 'config_option_update') {
        applyConfigOptions(session, update.configOptions)
      }
      queue.push(...translator.push(update))
      notify()
    }).then(
      response => settle({ kind: 'response', response }),
      error => settle({ kind: 'error', error }),
    )

    try {
      while (true) {
        while (queue.length > 0)
          yield queue.shift()!
        if (outcome !== undefined)
          break
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
      yield* translator.close()
      yield* this.finish(outcome, translator, binding, ephemeral, signal, facts)
    }
    finally {
      clearTimeout(idleTimer)
      clearTimeout(cancelTimer)
      signal?.removeEventListener('abort', onAbort)
      this.turns.delete(session.sessionId)
      if (outcome === undefined) {
        // The consumer stopped iterating before the turn settled: cancel this dispatch's own
        // prompt (a compaction still running in the agent must not be left behind), and end
        // the capability it owned — never one an auxiliary call only borrowed.
        agent.cancel(session)
        this.#revokeBridge(capability)
      }
      if (ephemeral)
        agent.closeSession(session)
    }
  }

  /**
   * The Host-tool bridge declaration for one `session/new`: exactly what the bridge authority
   * approves, and nothing for an ephemeral (discovery/compaction) call.
   */
  #bridgeServers(request: AcpBridgeRequest): AcpMcpServerHttp[] {
    if (this.bridge === undefined) return []
    try {
      const servers = this.bridge.serversFor(request)
      if (servers.length > 0 && request.sessionId !== undefined)
        this.bridged.add(request.sessionId)
      return servers
    }
    catch (error) {
      this.host.logger.warn(`${PLUGIN_ID}: refusing an ACP bridge declaration after a failed authorization check`, error)
      return []
    }
  }

  /**
   * End one DSH session's Host-tool capability: abort its in-flight calls, revoke its
   * grant, and close the ACP session that carried it, so the next turn opens a fresh ACP
   * session that is authorized from scratch. Another session's grant is never touched.
   *
   * The binding is removed *before* its session is closed: a refused or failed close must
   * not leave a stale binding behind that a later turn would try to reuse. Removing it
   * first also makes the close happen exactly once per session.
   */
  #revokeBridge(dshSessionId: string | undefined): void {
    if (dshSessionId === undefined) return
    this.bridged.delete(dshSessionId)
    this.bridge?.cancelInflight(dshSessionId)
    this.bridge?.revokeSession(dshSessionId)
    for (const key of [...this.bindings.keys()]) {
      if (sessionOfKey(key) !== dshSessionId) continue
      const binding = this.bindings.get(key)
      this.bindings.delete(key)
      if (binding === undefined) continue
      // The owning process closes its own session; a route that was disposed owns no agents
      // entry any more and its sessions are already gone with the process.
      this.agents.get(routeOfKey(key))?.process.closeSession(binding.session)
    }
  }

  private* finish(outcome: Outcome, translator: ChunkTranslator, binding: Binding, ephemeral: boolean, signal: AbortSignal | undefined, facts: TurnFacts): Iterable<StreamChunk> {
    if (outcome.kind === 'error') {
      if (signal?.aborted) {
        yield { type: 'finish', reason: { kind: 'aborted', failure: failure('ABORTED', 'request aborted') } }
        return
      }
      throw outcome.error
    }
    let usage = facts.usage
    if (outcome.kind === 'response' && outcome.response.usage != null) {
      usage = usageDelta(outcome.response.usage, ephemeral ? undefined : binding.usage)
      binding.usage = outcome.response.usage
    }
    if (usage !== undefined)
      yield { type: 'usage', usage }
    if (outcome.kind === 'timeout') {
      yield { type: 'finish', reason: { kind: 'error', failure: failure('TIMEOUT', 'ACP agent was idle for longer than the configured idleTimeoutMs') } }
      return
    }
    if (outcome.kind === 'aborted') {
      yield { type: 'finish', reason: { kind: 'aborted', failure: failure('ABORTED', 'request aborted') } }
      return
    }
    const { response } = outcome
    switch (response.stopReason) {
      case 'end_turn':
        yield translator.emittedBlocks === 0
          ? { type: 'finish', reason: { kind: 'error', failure: failure('EMPTY_RESPONSE', 'ACP agent ended the turn without any content') } }
          : { type: 'finish', reason: { kind: 'stop' } }
        return
      case 'max_tokens':
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
        return
      case 'cancelled':
        yield this.cancelled(translator, facts)
        return
      case 'refusal':
        yield { type: 'finish', reason: { kind: 'error', failure: failure('REFUSAL', 'ACP agent refused the request') } }
        return
      default:
        yield { type: 'finish', reason: { kind: 'error', failure: failure('MAX_TURN_REQUESTS', `ACP agent stopped: ${response.stopReason}`) } }
    }
  }

  /**
   * A turn the agent reports as cancelled. Agents end a turn that way when a tool call is
   * refused, and CodeBuddy also reports the turn after such a refusal as cancelled although
   * it answered in full, so only a cancel this side asked for is an abort.
   */
  private cancelled(translator: ChunkTranslator, facts: TurnFacts): StreamChunk {
    const denied = facts.permissions.denied
    if (denied !== undefined) {
      const title = denied.length > DENIED_TITLE_CHARS ? `${denied.slice(0, DENIED_TITLE_CHARS)}…` : denied
      return { type: 'finish', reason: { kind: 'error', failure: failure('PERMISSION_DENIED', `ACP agent ended the turn because permission was denied for: ${title}`) } }
    }
    if (!facts.cancelRequested && translator.emittedBlocks > 0)
      return { type: 'finish', reason: { kind: 'stop' } }
    return { type: 'finish', reason: { kind: 'aborted', failure: failure('ABORTED', 'ACP agent cancelled the turn') } }
  }

  private agent(route: string, profile: AcpAgentProfile): AcpAgentProcess {
    const existing = this.agents.get(route)
    if (existing !== undefined)
      return existing.process
    const process = new AcpAgentProcess({
      route,
      profile: () => this.profiles().get(route) ?? profile,
      logger: this.host.logger,
      // Remember the handshake answer against the facts that produced it: a route repointed
      // at another command answers for another agent.
      onCapabilities: capabilities => this.capabilities.set(route, this.agents.get(route)?.facts ?? spawnFacts(profile), capabilities),
      onPermission: (sessionId, request) => decidePermission(
        this.host,
        route,
        (this.profiles().get(route) ?? profile).permission,
        this.turns.get(sessionId),
        request,
      ),
    })
    this.agents.set(route, { process, facts: spawnFacts(profile) })
    return process
  }

  private cwdOf(dshSessionId: string | undefined, profile: AcpAgentProfile): string {
    const sessionCwd = dshSessionId === undefined ? undefined : this.host.agentOf(dshSessionId)?.session.header.cwd
    return sessionCwd ?? profile.cwd ?? homedir()
  }

  private dropBindings(route: string): void {
    // A route whose profile changed or disappeared loses its ACP sessions, and with them
    // any Host-tool capability those sessions carried.
    for (const key of [...this.bindings.keys()]) {
      if (key.startsWith(`${route}\u0000`))
        this.#revokeBridge(sessionOfKey(key))
    }
  }
}
