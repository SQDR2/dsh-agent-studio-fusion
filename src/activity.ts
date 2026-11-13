import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { isRouteTransportName } from './host/route-transport.js'

/** Plugin-owned presentation record; never appended to a native Session. */
export interface FusionActivity {
  schemaVersion: 1
  taskId: string
  childSessionId: string
  parentCallId: string
  turn: number
  step: number
  anchorSeq: number
  source: SessionEvent<'tool/call'> | SessionEvent<'tool/result'>
}

/** Namespaced display identity; the unchanged native identity remains in source. */
export function activityCallId(activity: FusionActivity): string {
  const event = activity.source
  const id = event.type === 'tool/call' ? event.data.callId : event.data.message.source.callId
  return `fusion:${activity.childSessionId}:${id}`
}

export interface FusionActivityPage { events: FusionActivity[]; cursor: number; more: boolean; done: boolean }

/** Tools whose call/result pair a Worker's own loop appends to its session. */
const NATIVE_VISIBLE_TOOLS: ReadonlySet<string> = new Set([
  'bash', 'pwsh', 'read', 'write', 'edit', 'glob', 'grep', 'job_output', 'job_kill', 'str_replace_editor',
])

/** The Code Mode wrapper dsh-agy-worker uses when the route has no transport tool. */
const MIRROR_CODE_WRAPPER = 'run_code'

/** A recorded agy step replayed through a bridge route's transport. */
export interface MirrorStep { run: string; step: number; tool: string }

/**
 * The exact wrapper dsh-agy-worker generates for a recorded step
 * (`buildMirrorRunCode`): one comment naming the step and its real tool, then one
 * call of the transport. Parsed as data — the code is never evaluated, and any
 * other `run_code` body stays out of the presentation path.
 */
const MIRROR_COMMENT = /^\/\/ dsh-agy-worker mirror: replay recorded agy tool step (\d+) \(([^()]*)\)$/
const MIRROR_CALL = /^return await tools\['([^']+)'\]\((\{.*\})\)$/

/** Recover the recorded step cursor and real tool from a generated mirror wrapper. */
export function mirrorStepInvocation(code: string): MirrorStep | undefined {
  const lines = code.split('\n').map(line => line.trim()).filter(line => line !== '')
  if (lines.length !== 2) return undefined
  const comment = MIRROR_COMMENT.exec(lines[0]!)
  const call = MIRROR_CALL.exec(lines[1]!)
  if (!comment || !call || !isRouteTransportName(call[1]!)) return undefined
  let args: unknown
  try { args = JSON.parse(call[2]!) } catch { return undefined }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
  const cursor = args as { run?: unknown; step?: unknown }
  if (typeof cursor.run !== 'string' || cursor.run === '') return undefined
  if (!Number.isSafeInteger(cursor.step) || (cursor.step as number) < 0) return undefined
  if (Number(comment[1]) !== cursor.step) return undefined
  const tool = comment[2]!.trim()
  return { run: cursor.run, step: cursor.step as number, tool: tool === '' ? 'agy tool' : tool }
}

/**
 * Whether one child tool event is real Worker activity this plugin presents in
 * the parent conversation. Answering this needs the recorded arguments only to
 * recognize the bounded Code Mode wrapper; nothing is executed or replayed.
 */
export function presentsActivity(name: string, rawArguments: string): boolean {
  if (NATIVE_VISIBLE_TOOLS.has(name)) return true
  if (isRouteTransportName(name)) return true
  if (name !== MIRROR_CODE_WRAPPER) return false
  let args: unknown
  try { args = JSON.parse(rawArguments) } catch { return false }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return false
  const code = (args as { code?: unknown }).code
  return typeof code === 'string' && mirrorStepInvocation(code) !== undefined
}
