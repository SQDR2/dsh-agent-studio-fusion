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
import type { Role } from '../src/contracts.js'
import { newLedger, ingestDurable } from '../src/usage/ledger.js'
import { TASK_BUSY, TASK_NOT_FOUND } from '../src/errors.js'
import { created, envelope, TASK, PARENT, SNAP, CHILD, order } from './helpers.js'

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

function usage(id: string, mode: 'final' | 'snapshot' | 'none', tokens = 0, role: Role = 'lead'): NativeUsageRecord {
  const key = { provider: 'actual-provider', model: 'actual-model', requestId: id, attemptId: id, contractDigest: 'native' }
  let ledger = newLedger(key)
  if (mode !== 'none') {
    ledger = ingestDurable(ledger, { id: `${id}:partial`, key, sequence: 1, mode: 'snapshot', bill: billFromNativeUsage({ inputTokens: 999, outputTokens: 999 }) })
    ledger = ingestDurable(ledger, { id: `${id}:latest`, key, sequence: 2, mode,
      bill: billFromNativeUsage({ inputTokens: tokens, outputTokens: 2, cacheReadTokens: 0 }) })
  }
  return { schemaVersion: 1, taskId: TASK, sessionId: PARENT, role, purpose: 'conversation', maxOutputTokens: 8000,
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

describe('role-separated permissions', () => {
  function roleSetup() {
    const root = mkdtempSync(join(tmpdir(), 'fusion-role-status-')), file = join(root, 'state.sqlite')
    const store = new SqliteFusionStore(file)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }), () => store.close())
    const prompts = loadPromptBundle(), profile = completeProfile({ id: 'fusion-auto', version: '0.2.0-enforced-v3', enabled: true,
      interactionMode: 'model-like', workflowPolicy: 'enforced-v3',
      lead: { provider: 'fixture', model: 'lead' }, worker: { provider: 'fixture', model: 'worker' }, dataPolicyId: 'local' }, prompts)
    store.create(created())
    store.append(TASK, 1, [envelope('profile/frozen', 2, { digest: profile.digest, profileId: profile.id, version: profile.version })])
    new BindingRepository(store).select(PARENT, TASK, { profile, prompts })
    return store
  }
  const intent = (mode: string, active = true) => ({ schemaVersion: 1, sessionId: PARENT, mode, ownSeqs: [], active })

  it('names the mode of the role working now instead of leaving the composer on custom', () => {
    const store = roleSetup()
    expect(readFusionStatus(store, PARENT).task).not.toHaveProperty('permissions')
    store.writeDocument(`sandbox-intent:${PARENT}`, 0, intent('danger-full-access'))
    store.writeDocument(`usage:${TASK}:lead`, 0, usage('1', 'final', 10))
    expect(readFusionStatus(store, PARENT).task!.permissions)
      .toEqual({ lead: 'read-only', worker: 'danger-full-access', active: 'lead' })
    store.writeDocument(`usage:${TASK}:worker`, 0, usage('2', 'final', 10, 'worker'))
    expect(readFusionStatus(store, PARENT).task!.permissions)
      .toEqual({ lead: 'read-only', worker: 'danger-full-access', active: 'worker' })
  })

  it('reports the user mode while the Lead holds a takeover and nothing once Fusion released the conversation', () => {
    const store = roleSetup()
    store.writeDocument(`sandbox-intent:${PARENT}`, 0, intent('workspace-write'))
    store.writeDocument(`runtime:${TASK}`, 0, { schemaVersion: 1, taskId: TASK, takeover: true })
    // Nothing is in flight yet, so the phase names the role that will run next.
    expect(readFusionStatus(store, PARENT).task!.permissions)
      .toEqual({ lead: 'workspace-write', worker: 'workspace-write', active: 'lead' })
    store.writeDocument(`sandbox-intent:${PARENT}`, 1, intent('workspace-write', false))
    expect(readFusionStatus(store, PARENT).task).not.toHaveProperty('permissions')
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
  /** No in-process Host owns the task: nothing here is running. */
  const idle = { liveReason: () => undefined }
  /** An in-process Host reports live work for the task. */
  const live = { liveReason: () => 'agent' as const }

  it('refuses to delete a task a live Host is still running', () => {
    const { store } = setup()
    expect(() => store.deleteTask(TASK, live)).toThrow('Cannot delete a running task')
    expect(store.load(TASK)).toBeDefined()
  })

  it('deletes a task whose owning process was replaced, which keeps only the stale phase of its last moment', () => {
    const { store } = setup()
    // A Host restart appends recovery/needed and leaves control.mode at 'running':
    // the event that would have moved it on is appended by a process that is gone.
    store.append(TASK, 1, [
      envelope('intent/chosen', 3, { intent: 'DELEGATE' }),
      envelope('recovery/needed', 4, { reason: 'Host runtime was replaced with a recorded writer' }),
    ])
    const state = store.load(TASK)!
    expect(state.control.mode).toBe('running')
    expect(state.phase).toBe('RECOVERING')
    // The interrupted call journal describes work that a dead pid abandoned.
    store.writeDocument(`native-effect:${TASK}:e1`, 0, { schemaVersion: 1, taskId: TASK, agentId: 'a',
      role: 'worker', callId: 'c1', rootCallId: 'r1', toolName: 'bash', processId: 2147483646,
      startedAt: '2026-11-04T00:00:00.000Z', state: 'dispatch-started', arguments: { digest: 'd' } })

    store.deleteTask(TASK, idle)

    expect(store.load(TASK)).toBeUndefined()
    expect(store.readDocument(`native-effect:${TASK}:e1`)).toBeUndefined()
  })

  it('deletes a record whose task never started, where the only events are creation and the frozen profile', () => {
    const { store } = setup()
    expect(store.load(TASK)).toMatchObject({ control: { mode: 'running' }, phase: 'PLANNING' })
    store.deleteTask(TASK, idle)
    expect(store.load(TASK)).toBeUndefined()
    expect(store.readDocument(`binding:${PARENT}`)?.value).toMatchObject({ selected: false })
  })

  it('still refuses a task a different, living process left an unfinished tool call on', () => {
    const { store } = setup()
    store.append(TASK, 1, [envelope('recovery/needed', 3, { reason: 'Host runtime was replaced' })])
    // The parent process is alive and is not this one, which models a second Host.
    store.writeDocument(`native-effect:${TASK}:e1`, 0, { schemaVersion: 1, taskId: TASK, agentId: 'a',
      role: 'worker', callId: 'c1', rootCallId: 'r1', toolName: 'bash', processId: process.ppid,
      startedAt: '2026-11-04T00:00:00.000Z', state: 'dispatch-started', arguments: { digest: 'd' } })

    expect(() => store.deleteTask(TASK, idle)).toThrow(expect.objectContaining({ code: TASK_BUSY }))
    expect(store.load(TASK)).toBeDefined()

    // The same row, once settled, no longer pins the record.
    store.writeDocument(`native-effect:${TASK}:e1`, 1, { schemaVersion: 1, taskId: TASK, agentId: 'a',
      role: 'worker', callId: 'c1', rootCallId: 'r1', toolName: 'bash', processId: process.ppid,
      startedAt: '2026-11-04T00:00:00.000Z', endedAt: '2026-11-04T00:00:05.000Z', state: 'returned',
      arguments: { digest: 'd' } })
    store.deleteTask(TASK, idle)
    expect(store.load(TASK)).toBeUndefined()
  })

  it('does not treat an unfinished row from this process as a live writer', () => {
    const { store } = setup()
    store.append(TASK, 1, [envelope('recovery/needed', 3, { reason: 'Host runtime was replaced' })])
    // Written by this process and then interrupted: the live Host authority has
    // already answered that nothing here runs, so the row is residue.
    store.writeDocument(`native-effect:${TASK}:e1`, 0, { schemaVersion: 1, taskId: TASK, agentId: 'a',
      role: 'worker', callId: 'c1', rootCallId: 'r1', toolName: 'bash', processId: process.pid,
      startedAt: '2026-11-04T00:00:00.000Z', state: 'dispatch-started', arguments: { digest: 'd' } })
    store.deleteTask(TASK, idle)
    expect(store.load(TASK)).toBeUndefined()
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

    store.deleteTask(TASK, idle)

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

    store.deleteTask(TASK, idle)

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
    expect(() => store.deleteTask('non-existent-task', idle)).toThrow(expect.objectContaining({ code: TASK_NOT_FOUND }))
    expect(() => store.deleteTask(TASK, live)).toThrow(expect.objectContaining({ code: TASK_BUSY }))
  })

  it('decides on live work rather than on the phase a task stopped in', () => {
    const { store } = setup()
    const currentOrder = order()
    store.append(TASK, 1, [
      envelope('intent/chosen', 3, { intent: 'DELEGATE' }),
      envelope('work-order/prepared', 4, { order: currentOrder, reservedChild: CHILD }),
      envelope('child/accepted', 5, { operationId: currentOrder.operationId, child: CHILD, messageId: 'm1' }),
    ])
    expect(store.load(TASK)?.phase).toBe('WORKER_RUNNING')
    // A Worker mid-dispatch is exactly what must not be stranded: refuse while it lives.
    expect(() => store.deleteTask(TASK, live)).toThrow(expect.objectContaining({ code: TASK_BUSY }))
    // The Worker Agent is gone (Host replaced, session disposed): the phase is a
    // leftover of its last moment, and the record is a historical one.
    store.deleteTask(TASK, idle)
    expect(store.load(TASK)).toBeUndefined()
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

    store.deleteTask(TASK_A, idle)

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
