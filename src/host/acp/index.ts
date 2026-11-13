/**
 * Installing the ACP provider routes inside the dsh-fusion Host plugin.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 *
 * Registration happens under the `dsh-fusion` identity: the adapter owns the provider
 * routes named in `acp.agents`, model discovery is offered under the plugin id, and the
 * Host-tool MCP bridge is mounted on this Host's web server. Nothing here creates a second
 * plugin.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AcpWorkerFacts } from './bridge.js'
import type { AcpHost, AcpHostAgent } from './host.js'
import type { AcpAgentProfile } from './types.js'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { SessionId } from '@deepseek-ai/dsh-session'
import { AcpToolBridge, ACP_MCP_PATH } from './bridge.js'
import { installAcpBridgeRoute } from './bridge-route.js'
import { executeSingleTool } from '../tool-seam.js'
import type { ScopedToolService } from '../tool-seam.js'
import { AcpAdapter } from './adapter.js'
import { ContextWindows } from './context-windows.js'
import { PromptCapabilitiesCache } from './prompt-capabilities.js'
import { requestImageTarget } from './request-image.js'

const PLUGIN_ID = 'dsh-fusion'

/** Same request-image budget the built-in pi-ai route uses by default. */
const IMAGE_BUDGET = { maxPixels: 4_194_304, maxBytes: 1_048_576 }

interface AgentsService {
  get: (sessionId: SessionId) => Agent | undefined
}

interface ApprovalService {
  request: (request: { agent: AcpHostAgent; toolName: string; reason?: string; signal?: AbortSignal }) =>
    Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'>
  effectivePolicy?: (session: AcpHostAgent['session']) => string
}

interface SandboxPolicyService {
  resolve: (request: { session: AcpHostAgent['session'] }) => { mode: string }
}

interface AttachmentsService {
  readImageRequest: (ref: unknown, target: { width: number; height: number; maxBytes: number }, signal?: AbortSignal) => Promise<{
    data: Uint8Array
    mediaType: string
    width: number
    height: number
  }>
}

/**
 * The one web-server method the bridge needs: the Host's own public origin.
 *
 * `WebServer.getOrigin()` is the supported way to learn where this Host is actually
 * reachable (it follows the configured protocol, bind address and listening port). The
 * devkit typings this package develops against predate it, so it is read through this
 * narrow structural seam rather than from a guessed loopback URL. A Host that answers no
 * origin gets no bridge at all — never a fallback address.
 */
interface WebServerOrigin {
  getOrigin?: () => string
}

/** Resolve the Host origin at declaration time; throws when the Host cannot name one. */
function hostOrigin(ctx: Context): string {
  const server = ctx.webServer as unknown as WebServerOrigin | undefined
  const origin = server?.getOrigin?.()
  if (typeof origin !== 'string' || origin.trim().length === 0)
    throw new Error(`${PLUGIN_ID}: the Host web server reports no origin; an ACP Sidekick bridge cannot be addressed`)
  return origin
}

/** Where this plugin's learned ACP facts persist: `$DSH_HOME`, as dsh resolves it. */
function cacheFile(name: string): string {
  const configured = process.env.DSH_HOME?.trim()
  const home = configured === undefined || configured.length === 0
    ? join(homedir(), '.dsh')
    : configured === '~' || configured.startsWith('~/') ? join(homedir(), configured.slice(1)) : configured
  return join(resolve(home), 'cache', PLUGIN_ID, name)
}

/** The Fusion side of the bridge, as the live coordinator exposes it. */
export interface AcpBridgeSource {
  /** The exact facts of one live Fusion Worker, or undefined for anything else. */
  workerFacts(agent: Agent): AcpWorkerFacts | undefined
}

export interface InstallAcpOptions {
  /** Configured Sidekick ceiling. */
  workerTools: readonly string[]
  /** The profiles to serve now; an empty map registers no routes. */
  profiles: () => ReadonlyMap<string, AcpAgentProfile>
  /** The coordinator, once this Host has created it. */
  coordinator: () => AcpBridgeSource | undefined
}

/**
 * Register the ACP routes, discovery and — only when a coordinator exists — the Sidekick
 * MCP bridge. Returns the disposer; the caller owns it through `ctx.effect`.
 */
export function installAcp(ctx: Context, options: InstallAcpOptions): () => void {
  const approvals = (): ApprovalService | undefined => ctx.get('approval') as ApprovalService | undefined
  const host: AcpHost = {
    logger: ctx.logger,
    agentOf: sessionId => (ctx.get('agents') as AgentsService | undefined)?.get(SessionId(sessionId)) as AcpHostAgent | undefined,
    get approve() {
      const approval = approvals()
      return approval === undefined ? undefined : (request: Parameters<NonNullable<AcpHost['approve']>>[0]) => approval.request(request)
    },
    // The "full access" preset turns the sandbox off and approvals to "never", where the
    // approval service rejects every ask; an agent refused that way ends its turn.
    fullAccess: (agent) => {
      const sandbox = ctx.get('sandboxPolicy') as SandboxPolicyService | undefined
      const approval = approvals()
      try {
        return sandbox?.resolve({ session: agent.session }).mode === 'danger-full-access'
          && approval?.effectivePolicy?.(agent.session) === 'never'
      }
      catch {
        return false
      }
    },
    get readImage() {
      const attachments = ctx.get('attachments') as AttachmentsService | undefined
      return typeof attachments?.readImageRequest !== 'function'
        ? undefined
        : (ref: unknown, signal?: AbortSignal) => attachments.readImageRequest(ref, requestImageTarget(ref, IMAGE_BUDGET), signal)
    },
  }
  const agents = (): AgentsService | undefined => ctx.get('agents') as AgentsService | undefined
  const bridge = new AcpToolBridge({
    agentOf: sessionId => agents()?.get(SessionId(sessionId)) as Agent | undefined,
    workerFacts: agent => options.coordinator()?.workerFacts(agent),
    schemasOf: agent => ctx.tools.schemas(agent),
    // The bridge is written against one call; the seam picks the transport that this
    // Host actually exposes (0.2.1 single input, 0.2.2 one-call raw batch).
    execute: input => executeSingleTool(ctx.tools as unknown as ScopedToolService, input),
  }, {
    workerTools: options.workerTools,
    origin: () => hostOrigin(ctx),
  })
  const disposeRoute = installAcpBridgeRoute(ctx, ACP_MCP_PATH, (req, res) => bridge.handle(req, res))
  const adapter = new AcpAdapter(
    host,
    options.profiles,
    new ContextWindows(cacheFile('context-windows.json'), ctx.logger),
    new PromptCapabilitiesCache(cacheFile('prompt-capabilities.json'), ctx.logger),
    bridge,
  )
  let registration: { (): void, replace: (providers: string[]) => void } | undefined
  const reconcile = (): void => {
    adapter.sync()
    const routes = [...options.profiles().keys()]
    if (registration === undefined) {
      if (routes.length > 0)
        registration = ctx.llm.registerAdapter(routes, adapter)
      return
    }
    registration.replace(routes)
  }
  try {
    reconcile()
  }
  catch (error) {
    ctx.logger.error(`${PLUGIN_ID}: keeping the previous ACP routes after a refused update`, error)
  }
  const discovery = ctx.llm.registerModelDiscovery(PLUGIN_ID, async (request, signal) => {
    const route = request.provider ?? ''
    if (!options.profiles().has(route))
      throw new Error(`${PLUGIN_ID}: save ACP agent "${route}" before discovering its models`)
    const found = await adapter.advertisedModels(route, signal)
    return found.map(model => ({ id: model.id, name: model.name }))
  })
  return () => {
    discovery()
    registration?.()
    disposeRoute()
    bridge.dispose()
    adapter.dispose()
  }
}
