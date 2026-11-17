import type { SqliteFusionStore } from '../task/sqlite-store.js'
import type { TaskState } from '../task/state.js'
import type { NativeUsageRecord } from './native-usage.js'
import { projectLedger, restoreLedger, type Count } from '../usage/ledger.js'
import { computeSavings, costOfRecord, sumCosts, type CostSum } from '../usage/cost.js'
import { readPriceSettings } from './price-settings.js'
import { collectForemanFindings } from '../plan-review.js'

export interface TaskPlanReviewSummary {
  status: 'ready' | 'concerns' | 'unavailable'
  round: number
  /** Present for an unavailable review so the history row can say why it did not happen. */
  unavailableReason?: string
  /**
   * Foreman tokens, cost and time for this task, kept out of the Lead/Sidekick columns.
   *
   * `costUsd` is a subtotal over the calls that could be priced, and the counts next to it say
   * how much of the bill it covers: `priced + unpriced + incomplete + unknown` describes every
   * call. Showing a subtotal as if it were the total understates the reviewer's cost, which is
   * exactly the number a decision to keep or drop the reviewer depends on.
   */
  foreman?: { calls: number; input: number; inputReported: number; output: number; outputReported: number
    durationMs: number; costUsd: string | null
    priced: number; unpriced: number; incomplete: number; unknown: number }
  /** Findings the reviewer raised, each with the Lead's recorded answer when there is one. */
  findings?: readonly { id: string; category: string; severity: string; message: string
    disposition?: { action: 'accepted' | 'overridden'; note: string } }[]
  dispositionsCount?: {
    accepted: number
    overridden: number
  }
}

export interface TaskSummary {
  id: string; sessionId: string; seq: number; createdAt: string; updatedAt: string
  title: string; phase: string; verification: string; mode: string
  planReview?: TaskPlanReviewSummary
}
export function taskSummary(state: TaskState, createdAt: string, updatedAt: string): TaskSummary {
  let planReview: TaskPlanReviewSummary | undefined
  if (state.latestPlanReview) {
    const r = state.latestPlanReview
    const status = r.outcome === 'unavailable' ? 'unavailable' : r.assessment?.verdict ?? 'unavailable'
    let dispositionsCount: { accepted: number; overridden: number } | undefined
    if (r.dispositions && r.dispositions.length > 0) {
      dispositionsCount = {
        accepted: r.dispositions.filter(d => d.action === 'accepted').length,
        overridden: r.dispositions.filter(d => d.action === 'overridden').length,
      }
    } else if (state.planReviewResolutions && state.planReviewResolutions.length > 0) {
      const res = state.planReviewResolutions.find(x => x.candidateDigest === r.candidateDigest && x.round === r.round)
      if (res) {
        dispositionsCount = {
          accepted: res.dispositions.filter(d => d.action === 'accepted').length,
          overridden: res.dispositions.filter(d => d.action === 'overridden').length,
        }
      }
    }
    // Findings with the answer the Lead recorded for each: the history row can then show a
    // reviewer concern next to what was actually done about it, which is the only way a user
    // can judge whether an override was reasonable in hindsight.
    const resolution = state.planReviewResolutions?.find(item => item.candidateDigest === r.candidateDigest && item.round === r.round)
    const dispositions = resolution?.dispositions ?? r.dispositions
    const answered = new Map(dispositions?.map(d => [d.findingId, d]) ?? [])
    const findings = r.assessment && r.assessment.verdict === 'concerns'
      ? collectForemanFindings(r.assessment).map(finding => {
        const disposition = answered.get(finding.id)
        return { id: finding.id, category: finding.category, severity: finding.severity, message: finding.message,
          ...(disposition ? { disposition: disposition.action === 'accepted'
            ? { action: 'accepted' as const, note: disposition.changeSummary }
            : { action: 'overridden' as const, note: disposition.reason } } : {}) }
      })
      : []
    planReview = {
      status,
      round: r.round,
      ...(r.unavailableReason ? { unavailableReason: r.unavailableReason } : {}),
      ...(findings.length ? { findings } : {}),
      ...(dispositionsCount ? { dispositionsCount } : {}),
    }
  }
  return { id: state.taskId, sessionId: state.parent, seq: state.seq, createdAt, updatedAt,
    title: state.currentWorkOrder?.goal?.slice(0, 160) || '对话任务', phase: state.phase, verification: state.verification, mode: state.control.mode,
    ...(planReview ? { planReview } : {}) }
}
export interface UsageSummary {
  id: string; taskId: string; role: string; provider: string; model: string; purpose: string; startedAt: string
  outcome: string; authority: 'none' | 'provisional' | 'final'; input: Count; output: Count
  reasoning: Count; totalOutput: Count; cacheRead: Count
}
export function usageSummary(row: NativeUsageRecord): UsageSummary {
  const projection = projectLedger(restoreLedger(row.ledger))
  const bill = projection.bill
  const input = bill?.uncachedInput ?? { state: 'unknown' }
  const output = bill?.output ?? { state: 'unknown' }
  const cacheRead = bill?.cacheRead ?? { state: 'unknown' }
  const reasoning = bill?.reasoning?.tokens ?? { state: 'unknown' }

  let totalOutput: Count = { state: 'unknown' }
  if (output.state === 'known') {
    if (bill?.reasoning?.kind === 'included') {
      totalOutput = { state: 'known', tokens: output.tokens }
    } else if (reasoning.state === 'known') {
      totalOutput = { state: 'known', tokens: output.tokens + reasoning.tokens }
    } else {
      totalOutput = { state: 'unknown' }
    }
  }

  const role = row.purpose === 'foreman' ? 'foreman' : row.role

  return { id: row.nativeInvocationId, taskId: row.taskId, role, provider: row.ledger.key.provider, model: row.ledger.key.model,
    purpose: row.purpose ?? 'conversation', startedAt: row.startedAt, outcome: row.outcome, authority: projection.authority,
    input, output, reasoning, totalOutput, cacheRead }
}

/** Once at plugin startup; GET never writes, starts agents, or scans full task/usage snapshots. */
export function backfillHistory(store: SqliteFusionStore) {
  for (const id of store.listTaskIds()) {
    if (store.readDocument(`task-index:${id}`)) continue
    const state = store.load(id)!, events = store.events(id)
    store.writeDocument(`task-index:${id}`, 0, taskSummary(state, events[0]!.createdAt, events.at(-1)!.createdAt))
  }
  for (const id of store.listDocumentIds('usage:')) {
    const projectionId = `usage-index:${id.slice(6)}`
    const existing = store.readDocument(projectionId)
    if (existing && (existing.value as UsageSummary).totalOutput !== undefined) continue
    const usageDoc = store.readDocument(id)
    if (usageDoc) {
      store.writeDocument(projectionId, existing?.revision ?? 0, usageSummary(usageDoc.value as NativeUsageRecord))
    }
  }
}
export interface HistoryTotals { calls: number; final: number; provisional: number; unreported: number; foremanCalls?: number;
  input: { known: number; reported: number }; output: { known: number; reported: number }
  reasoning: { known: number; reported: number }; totalOutput: { known: number; reported: number }; cacheRead: { known: number; reported: number } }
const empty = (): HistoryTotals => ({ calls: 0, final: 0, provisional: 0, unreported: 0, foremanCalls: 0,
  input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 },
  reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } })
function add(total: HistoryTotals, row: UsageSummary) {
  total.calls++; total[row.authority === 'none' ? 'unreported' : row.authority]++
  if (row.purpose === 'foreman' || row.role === 'foreman') total.foremanCalls = (total.foremanCalls ?? 0) + 1
  for (const key of ['input', 'output', 'reasoning', 'totalOutput', 'cacheRead'] as const) {
    const count = row[key]
    if (count && count.state === 'known') { total[key].known += count.tokens; total[key].reported++ }
  }
  if (!row.totalOutput && row.output && row.output.state === 'known') {
    if (row.reasoning && row.reasoning.state === 'known') {
      total.totalOutput.known += row.output.tokens + row.reasoning.tokens
      total.totalOutput.reported++
    }
  }
}
/**
 * Attach this task's Foreman tokens, cost and elapsed time to its review summary.
 *
 * Foreman usage is separated from Lead and Sidekick usage everywhere else, so the history row
 * has to carry its own numbers rather than let a reviewer call inflate the pair's columns.
 * An amount that cannot be priced stays null: a missing price is not zero dollars.
 */
function withForemanUsage(store: SqliteFusionStore, task: TaskSummary): TaskPlanReviewSummary | undefined {
  if (!task.planReview) return task.planReview
  const rows = store.listDocumentIds(`usage:${task.id}:`).map(id => store.readDocument(id)?.value as NativeUsageRecord | undefined)
    .filter((row): row is NativeUsageRecord => Boolean(row?.ledger) && row!.purpose === 'foreman')
  if (!rows.length) return task.planReview
  const overrides = readPriceSettings(store)
  let input = 0, inputReported = 0, output = 0, outputReported = 0, durationMs = 0
  const costs = []
  for (const row of rows) {
    const projection = projectLedger(restoreLedger(row.ledger))
    if (projection.bill?.uncachedInput?.state === 'known') { input += projection.bill.uncachedInput.tokens; inputReported++ }
    if (projection.bill?.output?.state === 'known') { output += projection.bill.output.tokens; outputReported++ }
    const started = Date.parse(row.startedAt), ended = row.endedAt ? Date.parse(row.endedAt) : NaN
    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) durationMs += ended - started
    costs.push(costOfRecord(row, overrides))
  }
  const cost = sumCosts(costs)
  return { ...task.planReview, foreman: { calls: rows.length, input, inputReported, output, outputReported, durationMs,
    // Any priced call contributes a subtotal; with none priced the amount stays unknown rather
    // than becoming a confident zero. `priced` versus `calls` is what the UI reports as coverage.
    costUsd: cost.complete > 0 ? cost.totalUsd : null,
    priced: cost.complete, unpriced: cost.unpriced, incomplete: cost.incomplete, unknown: cost.unknown } }
}

/** How often the Host unlocked Lead takeover (enforced-v3), by reason. */
export interface TakeoverTotals { total: number; tasks: number; reasons: Record<string, number> }
/** Money for one task row or for the whole page. */
export interface CostTotals {
  /** API-equivalent estimate over the requests that could be priced. */
  apiEquivalentUsd: string
  /** Always null: no per-request billed amount is available. */
  actualBilledUsd: null
  leadEquivalentUsd: string | null
  savedUsd: string | null
  savedPercent: string | null
  basis: number
  priced: number
  unpriced: number
  incomplete: number
  unknown: number
}
export interface HistoryView {
  observedAt: string; totalTasks: number; tasks: (TaskSummary & { usage: HistoryTotals; takeovers: number; cost?: CostTotals })[]; nextCursor: string | null
  takeovers: TakeoverTotals
  totals: HistoryTotals; groups: ({ role: string; provider: string; model: string; purpose: string } & HistoryTotals)[]
  /** Absent from a Host that predates cost reporting; the panel then shows no money. */
  cost?: CostTotals
  actualBilledUsd: null; savingsPercent: string | null; upstreamHttpCalls: null
}
export function readHistory(store: SqliteFusionStore, cursor = '', limit = 20): HistoryView {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('History page size must be 1–50')
  const tasks = store.listDocumentIds('task-index:').map(id => store.readDocument(id)!.value as TaskSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  const all = store.listDocumentIds('usage-index:').map(id => store.readDocument(id)!.value as UsageSummary)
  const groups = new Map<string, HistoryView['groups'][number]>(), byTask = new Map<string, HistoryTotals>(), totals = empty()
  for (const row of all) {
    add(totals, row)
    const own = byTask.get(row.taskId) ?? empty(); add(own, row); byTask.set(row.taskId, own)
    const key = JSON.stringify([row.role, row.provider, row.model, row.purpose])
    const group = groups.get(key) ?? { role: row.role, provider: row.provider, model: row.model, purpose: row.purpose, ...empty() }
    add(group, row); groups.set(key, group)
  }
  const takeovers: TakeoverTotals = { total: 0, tasks: 0, reasons: {} }, takeoversByTask = new Map<string, number>()
  for (const id of store.listDocumentIds('lead-takeover:')) {
    const row = store.readDocument(id)!.value as { taskId: string; reason: string }
    takeovers.total++; takeovers.reasons[row.reason] = (takeovers.reasons[row.reason] ?? 0) + 1
    takeoversByTask.set(row.taskId, (takeoversByTask.get(row.taskId) ?? 0) + 1)
  }
  takeovers.tasks = takeoversByTask.size
  const start = cursor ? tasks.findIndex(task => task.id === cursor) + 1 : 0
  if (cursor && start === 0) throw new Error('History cursor is no longer available')
  const page = tasks.slice(start, start + limit)
  // Money is read per task from the same recorded rows the token totals come from,
  // so a historical task reports the same cost it would have reported live.
  const overrides = readPriceSettings(store)
  const costOf = (taskId: string): CostTotals => {
    const records = store.listDocumentIds(`usage:${taskId}:`).map(id => store.readDocument(id)?.value as NativeUsageRecord | undefined)
      .filter((row): row is NativeUsageRecord => Boolean(row?.ledger))
    const costs = records.map(row => costOfRecord(row, overrides))
    const sum: CostSum = sumCosts(costs)
    const savingsRecords = records.filter(row => row.purpose !== 'foreman')
    const lead = savingsRecords.find(row => row.role === 'lead')?.ledger.key
    const saving = lead ? computeSavings(savingsRecords.map(row => ({ role: row.role, provider: row.ledger.key.provider,
      model: row.ledger.key.model, ledger: row.ledger })), lead, overrides) : undefined
    return { apiEquivalentUsd: sum.complete ? sum.totalUsd : '0', actualBilledUsd: null,
      leadEquivalentUsd: saving?.leadEquivalentUsd ?? null, savedUsd: saving?.savedUsd ?? null,
      savedPercent: saving?.savedPercent ?? null, basis: saving?.basis ?? 0,
      priced: sum.complete, unpriced: sum.unpriced, incomplete: sum.incomplete, unknown: sum.unknown }
  }
  const pageCosts = page.map(task => costOf(task.id))
  const pageCost: CostTotals = pageCosts.length ? {
    apiEquivalentUsd: pageCosts.reduce((total, cost) => addMoney(total, cost.apiEquivalentUsd), '0'),
    actualBilledUsd: null,
    leadEquivalentUsd: pageCosts.every(cost => cost.leadEquivalentUsd !== null)
      ? pageCosts.reduce((total, cost) => addMoney(total, cost.leadEquivalentUsd!), '0') : null,
    savedUsd: pageCosts.every(cost => cost.savedUsd !== null)
      ? pageCosts.reduce((total, cost) => addMoney(total, cost.savedUsd!), '0') : null,
    savedPercent: null, basis: pageCosts.reduce((total, cost) => total + cost.basis, 0),
    priced: pageCosts.reduce((total, cost) => total + cost.priced, 0),
    unpriced: pageCosts.reduce((total, cost) => total + cost.unpriced, 0),
    incomplete: pageCosts.reduce((total, cost) => total + cost.incomplete, 0),
    unknown: pageCosts.reduce((total, cost) => total + cost.unknown, 0),
  } : { apiEquivalentUsd: '0', actualBilledUsd: null, leadEquivalentUsd: null, savedUsd: null, savedPercent: null,
    basis: 0, priced: 0, unpriced: 0, incomplete: 0, unknown: 0 }
  return { observedAt: new Date().toISOString(), totalTasks: tasks.length,
    tasks: page.map((task, index) => ({ ...task, planReview: withForemanUsage(store, task), usage: byTask.get(task.id) ?? empty(),
      takeovers: takeoversByTask.get(task.id) ?? 0, cost: pageCosts[index]! })),
    nextCursor: start + limit < tasks.length ? page.at(-1)!.id : null, takeovers,
    totals, groups: [...groups.values()].sort((a, b) => b.calls - a.calls), cost: pageCost,
    actualBilledUsd: null, savingsPercent: pageCost.savedPercent, upstreamHttpCalls: null }
}

/** Money addition in integer units, so a page total never drifts by a cent. */
function addMoney(left: string, right: string): string {
  const scale = Math.max(left.split('.')[1]?.length ?? 0, right.split('.')[1]?.length ?? 0)
  const units = (value: string) => {
    const [whole, frac = ''] = value.split('.')
    return BigInt(whole! + frac.padEnd(scale, '0'))
  }
  const total = units(left) + units(right)
  if (scale === 0) return total.toString()
  const text = total.toString().padStart(scale + 1, '0')
  const frac = text.slice(-scale).replace(/0+$/, '')
  return frac ? `${text.slice(0, -scale)}.${frac}` : text.slice(0, -scale)
}
