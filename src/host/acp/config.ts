/**
 * Configuration schema for the ACP agent routes.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */

import z from '@deepseek-ai/schemastery'
import { isVolatile } from '@deepseek-ai/cosmokit'
import type { AcpAgentProfile, AcpConfig, AcpModelProfile } from './types.js'

export const DEFAULT_MODEL_ID = 'default'

export const DEFAULT_CONTEXT_WINDOW = 200_000

const DEFAULT_STARTUP_TIMEOUT_MS = 60_000

const DEFAULT_IDLE_TIMEOUT_MS = 600_000

const AcpModelProfileSchema: z<AcpModelProfile> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.natural(),
})

/** One configured ACP agent route. */
export const AcpAgentProfileSchema: z<AcpAgentProfile> = z.object({
  displayName: z.string(),
  command: z.string().required(),
  args: z.array(z.string()).default([]),
  env: z.dict(z.string()).default({}),
  cwd: z.string(),
  authMethod: z.string(),
  models: z.array(AcpModelProfileSchema).default([]),
  discoverModels: z.boolean().default(true),
  permission: z.union(['ask', 'allow', 'read-only', 'reject'] as const).default('ask'),
  imageInput: z.union(['auto', 'force', 'off'] as const).default('auto'),
  systemPrompt: z.union(['drop', 'forward'] as const).default('drop'),
  showToolCalls: z.boolean().default(true),
  contextWindow: z.natural().default(DEFAULT_CONTEXT_WINDOW),
  startupTimeoutMs: z.natural().default(DEFAULT_STARTUP_TIMEOUT_MS),
  idleTimeoutMs: z.natural().default(DEFAULT_IDLE_TIMEOUT_MS),
})

/** The `acp` block: `acp.agents` maps a provider route id to its profile. */
export const AcpConfigSchema: z<AcpConfig> = z.object({
  agents: z.dict(AcpAgentProfileSchema).default({}).volatile() as unknown as z<Record<string, AcpAgentProfile>>,
})

/**
 * Read the configured profiles; an absent block is an empty map, never an error.
 *
 * `agents` is declared volatile so the Host publishes a live-editable settings form, and
 * a parsed Config therefore carries a `Volatile` reference there rather than the map. The
 * reference is a `{ get() }` object whose only own key is `get`, so `Object.entries` over
 * it yields the single route `"get"` — that route then reached the model catalog as a
 * provider with an undefined profile, failing as `profile.models.length`. Unwrap the
 * reference (and any plain value, for callers that hand in raw settings) before reading.
 */
export function agentsOf(config: { acp?: { agents?: unknown } } | undefined): ReadonlyMap<string, AcpAgentProfile> {
  const agents = config?.acp?.agents
  const plain: unknown = isVolatile(agents) ? agents.get() : agents
  return new Map(Object.entries(plain ?? {}) as [string, AcpAgentProfile][])
}

export function spawnFacts(profile: AcpAgentProfile): string {
  return JSON.stringify([profile.command, profile.args, profile.env, profile.cwd ?? null, profile.authMethod ?? null])
}
