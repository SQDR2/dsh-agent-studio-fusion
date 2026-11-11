/**
 * Answering an ACP agent's permission requests through DSH's own approval policy.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */

import type { PermissionOption, RequestPermissionRequest, RequestPermissionResponse, SessionUpdate, ToolKind } from '@agentclientprotocol/sdk'
import type { AcpHost } from './host.js'
import type { PermissionPolicy } from './types.js'

/** What an agent said about one tool call while announcing it. */
export interface ToolFacts {
  title?: string
  kind?: ToolKind
}

export interface PermissionTurn {
  dshSessionId: string | undefined
  signal: AbortSignal | undefined
  /**
   * Tool calls this turn announced, by id. Agents may ask about a call by id alone and leave
   * its title and kind to the earlier `tool_call`.
   */
  tools: Map<string, ToolFacts>
  /** The first tool call this turn refused, so a turn the agent ends over it can say why. */
  denied?: string
}

const READ_ONLY_KINDS: ReadonlySet<ToolKind> = new Set(['read', 'search', 'think', 'fetch'])

/** Remember the latest title and kind an agent states for each tool call of a turn. */
export function noteToolCall(tools: Map<string, ToolFacts>, update: SessionUpdate): void {
  if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update')
    return
  const known = tools.get(update.toolCallId)
  const title = update.title ?? known?.title
  const kind = update.kind ?? known?.kind
  tools.set(update.toolCallId, { ...title == null ? {} : { title }, ...kind == null ? {} : { kind } })
}

function pick(options: readonly PermissionOption[], kinds: readonly PermissionOption['kind'][]): PermissionOption | undefined {
  for (const kind of kinds) {
    const option = options.find(entry => entry.kind === kind)
    if (option !== undefined)
      return option
  }
  return undefined
}

function allow(request: RequestPermissionRequest): RequestPermissionResponse {
  const option = pick(request.options, ['allow_once', 'allow_always'])
  return option === undefined ? reject(request) : { outcome: { outcome: 'selected', optionId: option.optionId } }
}

function reject(request: RequestPermissionRequest): RequestPermissionResponse {
  const option = pick(request.options, ['reject_once', 'reject_always'])
  return option === undefined ? { outcome: { outcome: 'cancelled' } } : { outcome: { outcome: 'selected', optionId: option.optionId } }
}

function readOnly(request: RequestPermissionRequest, kind: ToolKind): RequestPermissionResponse {
  return READ_ONLY_KINDS.has(kind) ? allow(request) : reject(request)
}

function granted(request: RequestPermissionRequest, response: RequestPermissionResponse): boolean {
  const outcome = response.outcome
  if (outcome.outcome !== 'selected')
    return false
  const kind = request.options.find(option => option.optionId === outcome.optionId)?.kind
  return kind === 'allow_once' || kind === 'allow_always'
}

async function decide(
  host: AcpHost,
  route: string,
  policy: PermissionPolicy,
  turn: PermissionTurn | undefined,
  request: RequestPermissionRequest,
  kind: ToolKind,
  title: string,
): Promise<RequestPermissionResponse> {
  switch (policy) {
    case 'allow':
      return allow(request)
    case 'reject':
      return reject(request)
    case 'read-only':
      return readOnly(request, kind)
    case 'ask':
      break
  }
  const agent = turn?.dshSessionId === undefined ? undefined : host.agentOf(turn.dshSessionId)
  // Under dsh's full access nothing confines or asks about dsh's own tools either.
  if (agent !== undefined && host.fullAccess?.(agent) === true)
    return allow(request)
  if (agent === undefined || host.approve === undefined) {
    host.logger.warn(`dsh-fusion: no approval answerer for ACP agent "${route}"; falling back to read-only permission`)
    return readOnly(request, kind)
  }
  try {
    const outcome = await host.approve({
      agent,
      toolName: `${route} · ${kind}`,
      reason: title,
      ...turn?.signal === undefined ? {} : { signal: turn.signal },
    })
    return outcome === 'allowed-once' ? allow(request) : reject(request)
  }
  catch (error) {
    host.logger.warn(`dsh-fusion: approval for ACP agent "${route}" failed; rejecting`, error)
    return reject(request)
  }
}

export async function decidePermission(
  host: AcpHost,
  route: string,
  policy: PermissionPolicy,
  turn: PermissionTurn | undefined,
  request: RequestPermissionRequest,
): Promise<RequestPermissionResponse> {
  const known = turn?.tools.get(request.toolCall.toolCallId)
  const kind = request.toolCall.kind ?? known?.kind ?? 'other'
  const title = request.toolCall.title ?? known?.title ?? kind
  const response = await decide(host, route, policy, turn, request, kind, title)
  if (turn !== undefined && turn.denied === undefined && !granted(request, response))
    turn.denied = title
  return response
}
