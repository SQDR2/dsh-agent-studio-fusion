import type { SqliteFusionStore } from '../task/sqlite-store.js'
import type { TaskState } from '../task/state.js'
import type { NativeUsageRecord } from './native-usage.js'
import { projectLedger, restoreLedger, type Count } from '../usage/ledger.js'
import { computeSavings, costOfRecord, sumCosts, type CostSum } from '../usage/cost.js'
import { readPriceSettings } from './price-settings.js'

export interface TaskSummary {
  id: string; sessionId: string; seq: number; createdAt: string; updatedAt: string
  title: string; phase: string; verification: string; mode: string
}
export function taskSummary(state: TaskState, createdAt: string, updatedAt: string): TaskSummary {
  return { id: state.taskId, sessionId: state.parent, seq: state.seq, createdAt, updatedAt,
    title: state.currentWorkOrder?.goal?.slice(0, 160) || '对话任务', phase: state.phase, verification: state.verification, mode: state.control.mode }
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

  return { id: row.nativeInvocationId, taskId: row.taskId, role: row.role, provider: row.ledger.key.provider, model: row.ledger.key.model,
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
export interface HistoryTotals { calls: number; final: number; provisional: number; unreported: number;
  input: { known: number; reported: number }; output: { known: number; reported: number }
  reasoning: { known: number; reported: number }; totalOutput: { known: number; reported: number }; cacheRead: { known: number; reported: number } }
const empty = (): HistoryTotals => ({ calls: 0, final: 0, provisional: 0, unreported: 0,
  input: { known: 0, reported: 0 }, output: { known: 0, reported: 0 },
  reasoning: { known: 0, reported: 0 }, totalOutput: { known: 0, reported: 0 }, cacheRead: { known: 0, reported: 0 } })
function add(total: HistoryTotals, row: UsageSummary) {
  total.calls++; total[row.authority === 'none' ? 'unreported' : row.authority]++
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
    const lead = records.find(row => row.role === 'lead')?.ledger.key
    const saving = lead ? computeSavings(records.map(row => ({ role: row.role, provider: row.ledger.key.provider,
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
    tasks: page.map((task, index) => ({ ...task, usage: byTask.get(task.id) ?? empty(), takeovers: takeoversByTask.get(task.id) ?? 0,
      cost: pageCosts[index]! })),
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
