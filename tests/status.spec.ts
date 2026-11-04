import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteFusionStore } from '../src/task/sqlite-store.js'
import { BindingRepository } from '../src/host/bindings.js'
import { readFusionStatus, taskStage } from '../src/host/status.js'
import { completeProfile } from '../src/profile/resolve.js'
import { loadPromptBundle } from '../src/prompts.js'
import { billFromNativeUsage, type NativeUsageRecord } from '../src/host/native-usage.js'
import { newLedger, ingestDurable } from '../src/usage/ledger.js'
import { TASK_BUSY, TASK_NOT_FOUND } from '../src/errors.js'
import { created, envelope, TASK, PARENT, SNAP } from './helpers.js'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()) })
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'fusion-status-')), file = join(root, 'state.sqlite')
  const store = new SqliteFusionStore(file)
  cleanup.push(() => rmSync(root, { recursive: true, force: true }), () => store.close())
  const prompts = loadPromptBundle(), profile = completeProfile({ id: 'fusion-auto', version: 'faithful-v1', enabled: true,
    lead: { provider: 'fixture', model: 'lead' }, worker: { provider: 'fixture', model: 'worker' }, dataPolicyId: 'local' }, prompts)
  store.create(created())
  store.append(TASK, 1, [envelope('profile/frozen', 2, { digest: profile.digest, profileId: profile.id, version: profile.version })])
  const bindings = new BindingRepository(store); bindings.select(PARENT, TASK, { profile, prompts })
  return { store, bindings, file }
}

function usage(id: string, mode: 'final' | 'snapshot' | 'none', tokens = 0): NativeUsageRecord {
  const key = { provider: 'actual-provider', model: 'actual-model', requestId: id, attemptId: id, contractDigest: 'native' }
  let ledger = newLedger(key)
  if (mode !== 'none') {
    ledger = ingestDurable(ledger, { id: `${id}:partial`, key, sequence: 1, mode: 'snapshot', bill: billFromNativeUsage({ inputTokens: 999, outputTokens: 999 }) })
    ledger = ingestDurable(ledger, { id: `${id}:latest`, key, sequence: 2, mode,
      bill: billFromNativeUsage({ inputTokens: tokens, outputTokens: 2, cacheReadTokens: 0 }) })
  }
  return { schemaVersion: 1, taskId: TASK, sessionId: PARENT, role: 'lead', purpose: 'conversation', maxOutputTokens: 8000,
    nativeInvocationId: id, startedAt: `2026-09-22T00:00:${id.padStart(2, '0')}Z`, endedAt: null, nativeStreamInvocations: 1,
    upstreamHttpCalls: null, outcome: 'entered', ledger, actualSubscriptionChargeUsd: null, apiEquivalentCostUsd: null }
}

describe('read-only Fusion status', () => {
  it('does not expose another session or an inactive binding, or create settings/runtime state', () => {
    const { store, bindings } = setup()
    const write = vi.spyOn(store, 'writeDocument')
    expect(readFusionStatus(store, 'ordinary')).not.toHaveProperty('task')
    expect(write).not.toHaveBeenCalled()
    bindings.clear(PARENT); write.mockClear()
    expect(readFusionStatus(store, PARENT)).toMatchObject({ selected: false })
    expect(readFusionStatus(store, PARENT)).not.toHaveProperty('task')
    expect(write).not.toHaveBeenCalled()
  })

  it('projects authoritative usage without summing partial snapshots, and keeps missing fields unknown', () => {
    const { store } = setup()
    store.writeDocument(`usage:${TASK}:one`, 0, usage('1', 'final', 30))
    store.writeDocument(`usage:${TASK}:two`, 0, usage('2', 'snapshot', 20))
    store.writeDocument(`usage:${TASK}:three`, 0, usage('3', 'none'))
    const task = readFusionStatus(store, PARENT).task!
    expect(task.usage).toMatchObject({ calls: 3, finalCalls: 1, provisionalCalls: 1, unreportedCalls: 1,
      input: { knownTokens: 50, reportedRequests: 2, totalRequests: 3 }, output: { knownTokens: 4, reportedRequests: 2 },
      cacheRead: { knownTokens: 0, reportedRequests: 2 }, actualBilledUsd: null, upstreamHttpCalls: null })
    expect(task.requests[0]).toMatchObject({ provider: 'actual-provider', model: 'actual-model', authority: 'none' })
  })

  it('splits usage by role so the Lead share of spend is visible', () => {
    const { store } = setup()
    store.writeDocument(`usage:${TASK}:lead`, 0, usage('1', 'final', 30))
    store.writeDocument(`usage:${TASK}:worker`, 0, { ...usage('2', 'final', 70), role: 'worker' })
    const { usage: totals, automatedChecks } = readFusionStatus(store, PARENT).task!
    expect(totals.byRole.lead).toMatchObject({ calls: 1, input: { knownTokens: 30 }, output: { knownTokens: 2 } })
    expect(totals.byRole.worker).toMatchObject({ calls: 1, input: { knownTokens: 70 }, output: { knownTokens: 2 } })
    expect(automatedChecks).toBeNull()
  })

  it('never labels gated work complete, even if its business phase is completed', () => {
    const { store } = setup(), state = { ...store.load(TASK)!, phase: 'COMPLETED' as const }
    expect(taskStage({ ...state, control: { ...state.control, mode: 'paused' } }, false).stage).toBe('已暂停')
    expect(taskStage({ ...state, control: { ...state.control, budgetBlocked: true } }, false).stage).toBe('等待额度')
    expect(taskStage({ ...state, control: { ...state.control, pendingApprovalIds: ['one'] } }, false).stage).toBe('等待确认')
    expect(taskStage({ ...state, control: { ...state.control, recovering: true } }, false).stage).toBe('等待检查')
    expect(taskStage(state, false).stage).toBe('等待检查')
    expect(taskStage({ ...state, control: { ...state.control, mode: 'completed' } }, false).stage).toBe('完成')
  })

  it('shows in-progress frozen validation and excludes private arguments, prompts and raw evidence', () => {
    const { store } = setup()
    store.writeDocument(`native-effect:${TASK}:one`, 0, { schemaVersion: 1, taskId: TASK, role: 'worker',
      toolName: 'bash', state: 'dispatch-started', startedAt: '2026-09-22T00:00:00Z', arguments: { secret: 'PRIVATE_ARGUMENT' } })
    store.writeDocument(`check-invocation:${TASK}:one`, 0, { evidence: { taskId: TASK, state: 'started' }, check: 'PRIVATE_CHECK' })
    const value = readFusionStatus(store, PARENT)
    expect(value.task).toMatchObject({ stage: '验证', unsettledTools: 1, tools: [{ name: 'bash', state: 'dispatch-started' }] })
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE_ARGUMENT|PRIVATE_CHECK|prompts|observations|arguments/)
  })

  it('does not let an exhausted Worker hint conceal approval, budget, recovery or validation state', () => {
    const { store } = setup(), state = { ...store.load(TASK)!, phase: 'WORKER_RUNNING' as const }
    expect(taskStage(state, false, true)).toMatchObject({ stage: '等待反馈', attention: true })
    expect(taskStage({ ...state, control: { ...state.control, pendingApprovalIds: ['one'] } }, false, true).stage).toBe('等待确认')
    expect(taskStage({ ...state, control: { ...state.control, budgetBlocked: true } }, false, true).stage).toBe('等待额度')
    expect(taskStage({ ...state, control: { ...state.control, recovering: true } }, false, true).stage).toBe('等待检查')
    expect(taskStage(state, true, true).stage).toBe('验证')
    expect(taskStage({ ...state, phase: 'DIRECT' }, false, true).stage).toBe('执行')
  })

  it('keeps aggregate counts across a bounded tail and survives reopening without writes', () => {
    const { store, file } = setup()
    for (let i = 1; i <= 20; i++) store.writeDocument(`usage:${TASK}:${i}`, 0, usage(String(i), 'final', 1))
    const before = store.listDocumentIds('').map(id => [id, store.readDocument(id)])
    const reopened = new SqliteFusionStore(file); cleanup.push(() => reopened.close())
    for (let i = 0; i < 10; i++) {
      const task = readFusionStatus(reopened, PARENT).task!
      expect(task.usage.calls).toBe(20); expect(task.usage.input.knownTokens).toBe(20)
      expect(task.requests).toHaveLength(12)
      expect(task.requests[0]!.startedAt).toContain(':20Z')
    }
    expect(store.listDocumentIds('').map(id => [id, store.readDocument(id)])).toEqual(before)
  })

  it('shows an upstream quota stop without masking recovery, approval, validation or completion', () => {
    const { store } = setup(), state = { ...store.load(TASK)!, phase: 'WORKER_RUNNING' as const }
    expect(taskStage(state, false, false, true)).toMatchObject({ stage: '等待额度', attention: true })
    expect(taskStage({ ...state, control: { ...state.control, recovering: true } }, false, false, true).stage).toBe('等待检查')
    expect(taskStage({ ...state, control: { ...state.control, pendingApprovalIds: ['one'] } }, false, false, true).stage).toBe('等待确认')
    expect(taskStage(state, true, false, true).stage).toBe('验证')
    expect(taskStage({ ...state, phase: 'COMPLETED', control: { ...state.control, mode: 'completed' } }, false, false, true).stage).toBe('完成')
  })

  it('rejects foreign usage and corrupt ledgers instead of reporting plausible totals', () => {
    const { store } = setup(), id = `usage:${TASK}:bad`
    store.writeDocument(id, 0, { ...usage('1', 'none'), taskId: 'foreign' })
    expect(() => readFusionStatus(store, PARENT)).toThrow('状态记录')
    store.writeDocument(id, 1, { ...usage('1', 'none'), ledger: { schemaVersion: 0 } })
    expect(() => readFusionStatus(store, PARENT)).toThrow('UNSUPPORTED_LEDGER_FORMAT')
  })
})

import { backfillHistory, readHistory, usageSummary } from '../src/host/history.js'

describe('history projection', () => {
  it('backfills once, uses actual routes, preserves unknowns, and never loads full task snapshots on GET', () => {
    const { store } = setup()
    store.writeDocument(`usage:${TASK}:one`, 0, usage('1', 'final', 30))
    store.writeDocument(`usage:${TASK}:two`, 0, { ...usage('2', 'snapshot', 20), role: 'worker', purpose: 'compaction' })
    store.writeDocument(`usage:${TASK}:three`, 0, usage('3', 'none'))
    backfillHistory(store)
    const load = vi.spyOn(store, 'load'), write = vi.spyOn(store, 'writeDocument')
    const result = readHistory(store)
    expect(result.totals).toMatchObject({ calls: 3, final: 1, provisional: 1, unreported: 1, input: { known: 50, reported: 2 } })
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0]).toMatchObject({ provider: 'actual-provider', model: 'actual-model' })
    expect(result.savingsPercent).toBeNull()
    expect(result.actualBilledUsd).toBeNull()
    expect(load).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
    backfillHistory(store)
    expect(load).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
    expect(readHistory(store).totals).toEqual(result.totals)
  })

  it('replaces an invocation summary instead of double counting and rolls back a conflicting batch', () => {
    const { store } = setup(), id = `usage-index:${TASK}:one`
    store.writeDocument(id, 0, usageSummary(usage('1', 'snapshot', 25)))
    expect(readHistory(store).totals.input.known).toBe(25)
    store.writeDocument(id, 1, usageSummary(usage('1', 'final', 30)))
    expect(readHistory(store).totals).toMatchObject({ calls: 1, final: 1, input: { known: 30, reported: 1 } })
    expect(() => store.writeDocuments([{ id: 'new-index', expectedRevision: 0, value: {} },
      { id, expectedRevision: 0, value: {} }])).toThrow()
    expect(store.readDocument('new-index')).toBeUndefined()
    expect(readHistory(store).totals.calls).toBe(1)
  })

  it('reports totalOutput and reasoning in HistoryTotals', () => {
    const { store } = setup()
    store.writeDocument(`usage:${TASK}:one`, 0, usage('1', 'final', 10))
    backfillHistory(store)
    let result = readHistory(store)
    expect(result.totals.totalOutput).toBeDefined()
    expect(result.totals.reasoning).toBeDefined()
    // When reasoning is unknown, totalOutput is unknown:
    expect(result.totals.totalOutput.reported).toBe(0)
    expect(result.totals.output.known).toBeGreaterThanOrEqual(2)

    // With explicit reasoning:
    const key = { provider: 'actual-provider', model: 'actual-model', requestId: '2', attemptId: '2', contractDigest: 'native' }
    let ledger = newLedger(key)
    ledger = ingestDurable(ledger, { id: '2:latest', key, sequence: 1, mode: 'final',
      bill: billFromNativeUsage({ inputTokens: 10, outputTokens: 20, reasoningTokens: 30, cacheReadTokens: 0 }) })
    store.writeDocument(`usage:${TASK}:two`, 0, {
      ...usage('2', 'none'), ledger,
    })
    backfillHistory(store)
    result = readHistory(store)
    expect(result.totals.totalOutput.known).toBe(50)
    expect(result.totals.reasoning.known).toBe(30)
  })
})

describe('task deletion', () => {
  it('refuses to delete a running task', () => {
    const { store } = setup()
    expect(() => store.deleteTask(TASK)).toThrow('Cannot delete a running task')
  })

  it('safely deletes a completed task and all its associated documents, artifacts, and indexes atomically', () => {
    const { store, bindings } = setup()
    store.append(TASK, 1, [
      envelope('intent/chosen', 3, { intent: 'DIRECT' }),
      envelope('task/completed', 4, { snapshot: SNAP, verification: 'unverified' }),
    ])
    const art = store.putArtifact(TASK, Buffer.from('evidence content'), 'text/plain')
    store.writeDocument(`usage:${TASK}:one`, 0, usage('1', 'final', 30))
    store.writeDocument(`lead-takeover:${TASK}:wo1`, 0, { taskId: TASK, reason: 'checks-still-failing' })
    store.writeDocument(`check-invocation:${TASK}:call-1`, 0, { schemaVersion: 1, taskId: TASK })
    store.writeDocument('child:worker-child', 0, { parent: PARENT, taskId: TASK })
    backfillHistory(store)

    let history = readHistory(store)
    expect(history.totalTasks).toBe(1)
    expect(history.totals.calls).toBe(1)
    expect(history.takeovers.total).toBe(1)
    expect(bindings.read(PARENT)?.binding.selected).toBe(true)

    store.deleteTask(TASK)

    expect(store.load(TASK)).toBeUndefined()
    expect(store.listTaskIds()).not.toContain(TASK)
    expect(() => store.readArtifact(TASK, art.digest)).toThrow()
    expect(store.readDocument(`task-index:${TASK}`)).toBeUndefined()
    expect(store.readDocument(`usage:${TASK}:one`)).toBeUndefined()
    expect(store.readDocument(`usage-index:${TASK}:one`)).toBeUndefined()
    expect(store.readDocument(`lead-takeover:${TASK}:wo1`)).toBeUndefined()
    expect(store.readDocument(`check-invocation:${TASK}:call-1`)).toBeUndefined()
    expect(store.readDocument('child:worker-child')).toBeUndefined()

    expect(bindings.read(PARENT)?.binding.selected).toBe(false)

    history = readHistory(store)
    expect(history.totalTasks).toBe(0)
    expect(history.tasks).toHaveLength(0)
    expect(history.totals.calls).toBe(0)
    expect(history.totals.input.known).toBe(0)
    expect(history.takeovers.total).toBe(0)
    expect(history.takeovers.tasks).toBe(0)
  })

  it('deletes documents that only name the task inside their id or ticket', () => {
    const { store } = setup()
    store.append(TASK, 1, [
      envelope('intent/chosen', 3, { intent: 'DIRECT' }),
      envelope('task/completed', 4, { snapshot: SNAP, verification: 'unverified' }),
    ])
    // These families carry the task only in the id (workflow-progress, workflow-stop) or in a
    // nested review ticket, so a sweep that trusts a top-level taskId leaves them behind.
    store.writeDocument(`workflow-progress:${TASK}:worker-1`, 0, { schemaVersion: 1, milestone: 'm', recent: [] })
    store.writeDocument(`workflow-stop:${TASK}:worker-1:m`, 0, { schemaVersion: 1, role: 'lead', at: '2026-09-20T00:00:00Z' })
    store.writeDocument(`check-invocation:${TASK}:call-1`, 0, { check: { plan: { id: 'p' } }, evidence: { state: 'started' } })
    store.writeDocument(`review-request:${PARENT}:1:2`, 0, { schemaVersion: 1, sessionId: PARENT, turn: 1, step: 2,
      ticket: { id: 't1', subject: { taskId: TASK, workOrderId: 'wo-1', revision: 1, reportId: 'r', reportDigest: 'd', snapshot: SNAP } } })
    store.writeDocument(`model-control:${PARENT}`, 0, { schemaVersion: 1, sessionId: PARENT, epoch: 0, routes: {}, waits: {} })

    store.deleteTask(TASK)

    expect(store.readDocument(`workflow-progress:${TASK}:worker-1`)).toBeUndefined()
    expect(store.readDocument(`workflow-stop:${TASK}:worker-1:m`)).toBeUndefined()
    expect(store.readDocument(`check-invocation:${TASK}:call-1`)).toBeUndefined()
    expect(store.readDocument(`review-request:${PARENT}:1:2`)).toBeUndefined()
    // Session-scoped state belongs to the conversation and must survive a task deletion.
    expect(store.readDocument(`model-control:${PARENT}`)).toBeDefined()
    expect(store.readDocument(`binding:${PARENT}`)).toBeDefined()
  })

  it('reports a missing task and a live task as distinct codes, not by message text', () => {
    const { store } = setup()
    // The HTTP layer maps these codes to 404 and 409; a translated message must not decide the status.
    expect(() => store.deleteTask('non-existent-task')).toThrow(expect.objectContaining({ code: TASK_NOT_FOUND }))
    expect(() => store.deleteTask(TASK)).toThrow(expect.objectContaining({ code: TASK_BUSY }))
  })

  it('does not accidentally delete another task or similar task id', () => {
    const { store, bindings } = setup()
    const TASK_A = TASK
    const TASK_B = (TASK + '-sim') as typeof TASK
    const PARENT_B = 'parent-session-b' as typeof PARENT

    store.append(TASK_A, 1, [
      envelope('intent/chosen', 3, { intent: 'DIRECT' }),
      envelope('task/completed', 4, { snapshot: SNAP, verification: 'unverified' }),
    ])

    store.create(created(TASK_B))
    store.append(TASK_B, 1, [
      envelope('intent/chosen', 2, { intent: 'DIRECT' }, { taskId: TASK_B }),
      envelope('task/completed', 3, { snapshot: SNAP, verification: 'unverified' }, { taskId: TASK_B }),
    ])
    bindings.select(PARENT_B, TASK_B, { profile: bindings.read(PARENT)!.binding.profile, prompts: loadPromptBundle() })

    const artA = store.putArtifact(TASK_A, Buffer.from('artifact A'), 'text/plain')
    const artB = store.putArtifact(TASK_B, Buffer.from('artifact B'), 'text/plain')

    expect(store.readDocument(`task-index:${TASK_A}`)).toBeDefined()
    expect(store.readDocument(`task-index:${TASK_B}`)).toBeDefined()

    store.writeDocument(`usage:${TASK_A}:1`, 0, { ...usage('1', 'final', 10), taskId: TASK_A })
    store.writeDocument(`usage:${TASK_B}:1`, 0, { ...usage('2', 'final', 20), taskId: TASK_B })

    store.writeDocument(`scope-expansion:${TASK_A}:exp1`, 0, { taskId: TASK_A })
    store.writeDocument(`scope-expansion:${TASK_B}:exp1`, 0, { taskId: TASK_B })

    store.writeDocument('child:child-a', 0, { parent: PARENT, taskId: TASK_A })
    store.writeDocument('child:child-b', 0, { parent: PARENT_B, taskId: TASK_B })

    store.deleteTask(TASK_A)

    expect(store.load(TASK_A)).toBeUndefined()
    expect(store.listTaskIds()).not.toContain(TASK_A)
    expect(() => store.readArtifact(TASK_A, artA.digest)).toThrow()
    expect(store.readDocument(`task-index:${TASK_A}`)).toBeUndefined()
    expect(store.readDocument(`usage:${TASK_A}:1`)).toBeUndefined()
    expect(store.readDocument(`scope-expansion:${TASK_A}:exp1`)).toBeUndefined()
    expect(store.readDocument('child:child-a')).toBeUndefined()
    expect(bindings.read(PARENT)?.binding.selected).toBe(false)

    expect(store.load(TASK_B)).toBeDefined()
    expect(store.listTaskIds()).toContain(TASK_B)
    expect(Buffer.from(store.readArtifact(TASK_B, artB.digest))).toEqual(Buffer.from('artifact B'))
    expect(store.readDocument(`task-index:${TASK_B}`)).toBeDefined()
    expect(store.readDocument(`usage:${TASK_B}:1`)).toBeDefined()
    expect(store.readDocument(`scope-expansion:${TASK_B}:exp1`)).toBeDefined()
    expect(store.readDocument('child:child-b')).toBeDefined()
    expect(bindings.read(PARENT_B)?.binding.selected).toBe(true)
  })
})
