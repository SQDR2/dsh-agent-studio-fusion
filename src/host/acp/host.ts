/**
 * The narrow host surface the ACP adapter needs from DSH.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */

export interface AcpHostLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type AcpApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

export interface AcpHostAgent {
  readonly session: { readonly header: { readonly cwd?: string } }
}

export interface AcpApprovalRequest {
  agent: AcpHostAgent
  toolName: string
  reason?: string
  signal?: AbortSignal
}

/** One image attachment re-encoded for a model request. */
export interface AcpHostImage {
  data: Uint8Array
  mediaType: string
  width: number
  height: number
}

export interface AcpHost {
  logger: AcpHostLogger
  agentOf: (sessionId: string) => AcpHostAgent | undefined
  approve: ((request: AcpApprovalRequest) => Promise<AcpApprovalOutcome>) | undefined
  /** Whether the session runs under dsh's full access: no sandbox and no approval prompts. */
  fullAccess?: (agent: AcpHostAgent) => boolean
  /** Request-sized bytes of one image attachment; absent when no attachment store is mounted. */
  readImage: ((ref: unknown, signal?: AbortSignal) => Promise<AcpHostImage>) | undefined
}
