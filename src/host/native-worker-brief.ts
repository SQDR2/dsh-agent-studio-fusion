import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { TaskId } from '../contracts.js'
import { digestOf } from '../digest.js'
import type { SqliteFusionStore } from '../task/sqlite-store.js'
import { recentHandoffSuffix } from '../context/handoff.js'
import { isFusionSourceKind } from '../message-source.js'

/** Durable Lead-authored refinements survive native compaction and request races. */
export function workerBriefs(store: SqliteFusionStore, taskId: TaskId) {
  const revision = (store.readDocument(`runtime:${taskId}`)?.value as { briefRevision?: number } | undefined)?.briefRevision ?? 0
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Worker brief revision requires reconciliation')
  const rows = store.listDocumentIds(`worker-delivery:${taskId}:`).flatMap(id => {
    const row = store.readDocument(id)!.value as { schemaVersion: number; taskId: string; workOrderId?: string; briefRevision: number; payloadRef: string; causeId: string; state: string }
    if (row.workOrderId && row.workOrderId !== store.load(taskId)?.currentWorkOrder?.id) return []
    if (row.state === 'not-applied-after-interruption') return []
    if (row.briefRevision > revision) return [] // prepared before the runtime committed it
    if (row.schemaVersion !== 1 || row.taskId !== taskId || !Number.isSafeInteger(row.briefRevision)
      || row.briefRevision < 1 || !row.payloadRef || !row.causeId) throw new Error('Worker brief journal requires reconciliation')
    return [{ revision: row.briefRevision, deliveryId: id, source: 'lead-tool-feedback' as const, nativeCallId: row.causeId, payloadRef: row.payloadRef,
      feedback: Buffer.from(store.readArtifact(taskId, row.payloadRef)).toString('utf8') }]
  }).sort((left, right) => left.revision - right.revision)
  if (rows.length !== revision || rows.some((row, index) => row.revision !== index + 1)) throw new Error('Worker brief history is missing or conflicting')
  return rows
}

/**
 * Pin a bounded projection, including the first handoff, on both native roles.
 * The complete owned outbox, journal and artifact bytes remain durable. Original
 * user input and the frozen work order are retained separately by NativeTaskContext.
 */
export function workerHandoffProjection(store: SqliteFusionStore, taskId: TaskId) {
  const state = store.load(taskId)
  if (!state) throw new Error('Worker handoff task is missing')
  const records: { revision: number; source: 'lead-tool-handoff' | 'lead-tool-feedback';
    sourceId: string; payloadRef: string; content: string }[] = []
  const order = state.currentWorkOrder
  if (order) {
    const rows = store.outbox(taskId).filter(row => row.kind === 'native-worker' && row.operationId === order.operationId)
    const row = rows[0], childId = state.acceptedChild ?? state.reservedChild
    if (rows.length !== 1 || !row || row.taskId !== taskId || !childId || row.reservedChild !== childId || !row.payloadRef) {
      throw new Error('Initial Worker handoff requires reconciliation')
    }
    records.push({ revision: 0, source: 'lead-tool-handoff', sourceId: row.operationId,
      payloadRef: row.payloadRef, content: Buffer.from(store.readArtifact(taskId, row.payloadRef)).toString('utf8') })
  }
  const briefs = workerBriefs(store, taskId)
  for (const brief of briefs) records.push({ revision: brief.revision, source: brief.source,
    sourceId: brief.deliveryId, payloadRef: brief.payloadRef, content: brief.feedback })
  return { schemaVersion: 1 as const, ...recentHandoffSuffix(records),
    latestBriefRevision: briefs.at(-1)?.revision ?? 0, historyDigest: digestOf(records) }
}

/** Brief bodies already arrive as native messages; the snapshot pins only their identity and digests. */
export function compactHandoffs(projection: ReturnType<typeof workerHandoffProjection>) {
  const { records, ...rest } = projection
  return { ...rest, records: records.map(({ content, ...record }) => ({ ...record, contentDigest: digestOf(content) })) }
}

export function assertWorkerBriefRequest(store: SqliteFusionStore, taskId: TaskId, request: GenerateOptions): void {
  if (!isAgentLoopRequest(request) || request.purpose !== undefined) return
  const expected = workerHandoffProjection(store, taskId)
  if (!expected.totalRecords) return
  const present = request.messages.some(message => isFusionSourceKind(message.source?.kind) && message.source.form === 'snapshot'
    && message.source.sections.some(section => {
      if (section.name !== 'fusion:task') return false
      try {
        const seen = digestOf(JSON.parse(section.text.slice(section.text.indexOf('\n') + 1)).facts.workerHandoffs)
        return seen === digestOf(expected) || seen === digestOf(compactHandoffs(expected))
      } catch { return false }
    }))
  if (!present) throw new Error('Worker request predates the latest Lead brief; do not dispatch a stale generation')
}

/** Bind model-generated tools to the brief that their exact native request saw. */
export function captureWorkerBrief(store: SqliteFusionStore, taskId: TaskId, agent: Agent, turn: number, step: number, revision: number): void {
  const id = `worker-request:${agent.id}:${turn}:${step}`
  const value = { schemaVersion: 1, taskId, sessionId: agent.id, turn, step, briefRevision: revision,
    workOrderId: store.load(taskId)?.currentWorkOrder?.id }
  const prior = store.readDocument(id)
  if (prior) {
    if (digestOf(prior.value) !== digestOf(value)) throw new Error('Worker request was already bound to another brief')
    return
  }
  store.writeDocument(id, 0, value)
}

/**
 * Bind one non-read Worker tool to the brief its own request saw.
 *
 * A native call is identified by `rootCallId`, which is the id of the block the
 * assistant message emitted. A bridge route (Antigravity's `agy`) instead runs
 * the call inside its OWN loop and reports the step through its transport, so
 * the bridged dispatch carries a bridge-local call id that never appears in this
 * session (`agy-mcp-N`). Refusing it as "no native request" refused the one tool
 * a bridge Worker exists to call — `fusion_submit_result` — and stranded the
 * task (session-1d65b1d0). Such a call is still owned by a native request: it
 * is dispatched synchronously while the transport call runs, so the enclosing
 * assistant message is the one that emitted the transport. `transport` carries
 * that name only for a role whose route really is a bridge.
 */
export function workerToolBriefProblem(store: SqliteFusionStore, taskId: TaskId, exec: ToolExecution, revision: number,
  transport?: string): string | undefined {
  const events = exec.agent?.session.snapshotEvents()
  const native = events?.findLast(event => event.type === 'assistant/message'
    && event.data.message.content.some(block => block.type === 'tool-call' && block.id === exec.rootCallId))
  const message = native ?? (transport === undefined ? undefined
    : events?.findLast(event => event.type === 'assistant/message'
      && event.data.message.content.some(block => block.type === 'tool-call' && block.name === transport)))
  if (!message || message.type !== 'assistant/message' || message.data.interrupted) return 'Worker tool requires a complete native model request'
  const row = store.readDocument(`worker-request:${exec.agent!.id}:${message.data.turn}:${message.data.step}`)?.value as {
    schemaVersion?: number; taskId?: string; sessionId?: string; turn?: number; step?: number; briefRevision?: number; workOrderId?: string
  } | undefined
  if (row?.schemaVersion !== 1 || row.taskId !== taskId || row.sessionId !== exec.agent!.id
    || row.turn !== message.data.turn || row.step !== message.data.step) return 'Worker tool has no captured brief identity'
  if (row.briefRevision !== revision) return 'A newer Lead brief superseded this request; process it before further tools or a report'
  const order = store.load(taskId)?.currentWorkOrder
  if (row.workOrderId !== order?.id && (row.workOrderId || order?.mode)) return 'A newer work order superseded this request; process its plan before further tools'
  return undefined
}
