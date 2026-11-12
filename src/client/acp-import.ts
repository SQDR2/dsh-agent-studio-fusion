import { useSyncExternalStore } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>

/** Fields an import owns; anything else on an existing route (permission, models, …) is kept. */
export const IMPORTED_KEYS = ['displayName', 'command', 'args', 'env'] as const

export const LIST_KEYS = ['agent_servers', 'agentServers', 'agents'] as const

export const ROUTE_PATTERN = /^[a-z0-9][\w.-]*$/i

export interface AgentImportEntry {
  /** Name as written in the source configuration. */
  name: string
  route: string
  /** Whether a configured route of the same id is overwritten (its other fields are kept). */
  replaces: boolean
  profile: JsonObject
}

export interface AgentImportIssue {
  name: string
  reason: 'importMissingCommand' | 'importBadArgs' | 'importBadEnv'
}

export type AgentImport =
  | { ok: true; entries: AgentImportEntry[]; skipped: AgentImportIssue[] }
  | { ok: false; error: string }

export type SettingsPathOpView =
  | { op: 'set'; path: string[]; value: JsonValue }
  | { op: 'unset'; path: string[] }

function objectOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** Turn a client-side display name into a route id; empty for names with no ASCII letters or digits. */
export function routeOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
}

/** The server map and whether its keys are already route ids (this plugin's own `agents`). */
function serversOf(document: Record<string, unknown>): { servers: Record<string, unknown>; routed: boolean } {
  for (const key of LIST_KEYS) {
    const list = objectOf(document[key])
    if (list !== undefined) {
      return { servers: list, routed: key === 'agents' }
    }
  }
  return { servers: document, routed: false }
}

function entryOf(name: string, value: unknown):
  | { ok: true; command: string; args: string[]; env: Record<string, string>; displayName?: string }
  | { ok: false; reason: AgentImportIssue['reason'] } {
  const server = objectOf(value)
  const command = server?.command
  if (server === undefined || typeof command !== 'string' || command.trim().length === 0) {
    return { ok: false, reason: 'importMissingCommand' }
  }
  const args = server.args ?? []
  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string')) {
    return { ok: false, reason: 'importBadArgs' }
  }
  const env = server.env ?? {}
  const envObject = objectOf(env)
  if (envObject === undefined || !Object.values(envObject).every(item => typeof item === 'string')) {
    return { ok: false, reason: 'importBadEnv' }
  }
  const displayName = typeof server.displayName === 'string' ? server.displayName : name
  return {
    ok: true,
    command: command.trim(),
    args: args as string[],
    env: envObject as Record<string, string>,
    displayName,
  }
}

export interface ExistingAgentInfo {
  raw?: Record<string, unknown>
  resolved?: Record<string, unknown>
}

export function existingRoutesOf(
  existing?:
    | readonly { route: string; user?: unknown; profile?: unknown }[]
    | Record<string, unknown>
    | ReadonlyMap<string, unknown>
    | { value?: unknown; user?: unknown }
): Map<string, ExistingAgentInfo> {
  const map = new Map<string, ExistingAgentInfo>()
  if (!existing) return map

  if (Array.isArray(existing)) {
    for (const item of existing) {
      if (item && typeof item === 'object' && 'route' in item && typeof item.route === 'string') {
        const raw = objectOf((item as any).user)
        const resolved = objectOf((item as any).profile) ?? (raw ? undefined : objectOf(item))
        map.set(item.route, { raw, resolved })
      }
    }
    return map
  }

  if (existing instanceof Map) {
    for (const [route, item] of existing.entries()) {
      if (typeof route === 'string') {
        const raw = objectOf((item as any)?.user)
        const resolved = objectOf((item as any)?.profile) ?? (raw ? undefined : objectOf(item))
        map.set(route, { raw, resolved })
      }
    }
    return map
  }

  if (typeof existing === 'object' && ('value' in existing || 'user' in existing)) {
    const valObj = objectOf((existing as any).value)
    const userObj = objectOf((existing as any).user)
    const valAgents = objectOf((valObj as any)?.acp?.agents) ?? objectOf((valObj as any)?.agents) ?? {}
    const userAgents = objectOf((userObj as any)?.acp?.agents) ?? objectOf((userObj as any)?.agents) ?? {}
    const routes = new Set([...Object.keys(valAgents), ...Object.keys(userAgents)])
    for (const route of routes) {
      const raw = objectOf((userAgents as any)[route])
      const resolved = objectOf((valAgents as any)[route])
      map.set(route, { raw, resolved })
    }
    return map
  }

  if (typeof existing === 'object') {
    for (const [route, item] of Object.entries(existing)) {
      const raw = objectOf((item as any)?.user)
      const resolved = objectOf((item as any)?.profile) ?? (raw ? undefined : objectOf(item))
      map.set(route, { raw, resolved })
    }
  }

  return map
}

/**
 * Parse pasted JSON into importable agents. Routes are derived from the entry names and
 * de-duplicated within the import; a route that already exists is marked as a replacement.
 */
export function parseAgentImport(
  text: string,
  existingInput?:
    | readonly { route: string; user?: unknown; profile?: unknown }[]
    | Record<string, unknown>
    | ReadonlyMap<string, unknown>
    | { value?: unknown; user?: unknown }
): AgentImport {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const root = objectOf(document)
  if (root === undefined) {
    return { ok: false, error: 'expected a JSON object' }
  }

  const existing = existingRoutesOf(existingInput)
  const taken = new Set<string>()
  const entries: AgentImportEntry[] = []
  const skipped: AgentImportIssue[] = []
  const { servers, routed } = serversOf(root)

  for (const [name, value] of Object.entries(servers)) {
    const parsed = entryOf(name, value)
    if (!parsed.ok) {
      skipped.push({ name, reason: parsed.reason })
      continue
    }

    const stem = routed && ROUTE_PATTERN.test(name) ? name : routeOf(name) || 'agent'
    let route = stem
    for (let suffix = 2; taken.has(route); suffix++) {
      route = `${stem}-${suffix}`
    }
    taken.add(route)

    const previous = existing.get(route)
    const replaces = previous !== undefined
    const merged = { ...(previous?.resolved ?? {}), ...(previous?.raw ?? {}) }
    const carried = Object.fromEntries(
      Object.entries(merged).filter(
        ([key]) => !(IMPORTED_KEYS as readonly string[]).includes(key)
      )
    )

    const serverObj = objectOf(value)
    const hasExplicitDisplayName = typeof serverObj?.displayName === 'string'
    const profile: JsonObject = {
      ...(replaces ? carried : { permission: 'ask' }),
      ...(parsed.displayName === undefined || (parsed.displayName === route && !hasExplicitDisplayName)
        ? {}
        : { displayName: parsed.displayName }),
      command: parsed.command,
      ...(parsed.args.length > 0 ? { args: parsed.args } : {}),
      ...(Object.keys(parsed.env).length > 0 ? { env: parsed.env } : {}),
    }

    entries.push({ name, route, replaces, profile })
  }

  return { ok: true, entries, skipped }
}

/** One atomic write storing every imported agent under `acp.agents`. */
export function importOpsOf(entries: readonly AgentImportEntry[]): SettingsPathOpView[] {
  return entries.map(entry => ({
    op: 'set',
    path: ['acp', 'agents', entry.route],
    value: entry.profile,
  }))
}

export interface AcpFormSnapshot<T = any> {
  status: 'loading' | 'ready' | 'unavailable'
  value: T | undefined
  base: unknown
  user: unknown
  revision: number | undefined
  writable: boolean
  mode?: 'host' | 'memory'
}

const DEFAULT_UNAVAILABLE_SNAPSHOT: AcpFormSnapshot = Object.freeze({
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
})

let boundForm: ConfigForm<any> | undefined
const formListeners = new Set<() => void>()
const notifyFormListeners = () => {
  for (const listener of formListeners) {
    listener()
  }
}

/** Bind the dsh-fusion ConfigForm instance to an external store readable by React. */
export function bindAcpConfigForm(form: ConfigForm<any>): () => void {
  boundForm = form
  notifyFormListeners()
  const unsubscribe = form.subscribe(notifyFormListeners)
  return () => {
    unsubscribe()
    if (boundForm === form) {
      boundForm = undefined
      notifyFormListeners()
    }
  }
}

export function subscribeAcpConfigForm(listener: () => void): () => void {
  formListeners.add(listener)
  return () => {
    formListeners.delete(listener)
  }
}

export function getAcpConfigFormSnapshot(): AcpFormSnapshot {
  return boundForm ? boundForm.getSnapshot() : DEFAULT_UNAVAILABLE_SNAPSHOT
}

export function getAcpConfigForm(): ConfigForm<any> | undefined {
  return boundForm
}

export function useAcpConfigForm(): AcpFormSnapshot & { form: ConfigForm<any> | undefined } {
  const snapshot = useSyncExternalStore(
    subscribeAcpConfigForm,
    getAcpConfigFormSnapshot,
    () => DEFAULT_UNAVAILABLE_SNAPSHOT
  )
  return {
    status: snapshot.status,
    value: snapshot.value,
    base: snapshot.base,
    user: snapshot.user,
    revision: snapshot.revision,
    writable: snapshot.writable,
    mode: snapshot.mode,
    form: boundForm,
  }
}
