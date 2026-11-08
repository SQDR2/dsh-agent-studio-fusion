import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteFusionStore } from '../src/task/sqlite-store.js'
import { BindingRepository } from '../src/host/bindings.js'
import { readFusionStatus } from '../src/host/status.js'
import { readHistory } from '../src/host/history.js'
import { PRICE_OVERRIDES_DOCUMENT, writePriceSettings } from '../src/host/price-settings.js'
import { completeProfile } from '../src/profile/resolve.js'
import { loadPromptBundle } from '../src/prompts.js'
import { known, ingestDurable, newLedger, na } from '../src/usage/ledger.js'
import { TaskId, type PhysicalRoute, type Role } from '../src/contracts.js'
import type { NativeUsageRecord } from '../src/host/native-usage.js'
import { created, envelope, TASK, PARENT } from './helpers.js'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()) })

/**
 * The status and history read models both report money now. These tests drive the
 * real store so the wiring — not just the arithmetic — is covered: a cost block
 * that is computed but never reaches the projection is exactly the bug being fixed.
 */
const lead: PhysicalRoute = { provider: 'pi-openai-codex', model: 'gpt-6-astra' }
const worker: PhysicalRoute = { provider: 'pi-zai-coding-cn', model: 'glm-5.3-flash' }

function setup(leadRoute: PhysicalRoute = lead, workerRoute: PhysicalRoute = worker) {
  const root = mkdtempSync(join(tmpdir(), 'fusion-cost-')), store = new SqliteFusionStore(join(root, 'state.sqlite'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }), () => store.close())
  const prompts = loadPromptBundle(), profile = completeProfile({ id: 'fusion-auto', version: '0.2.0-enforced-v3', enabled: true,
    interactionMode: 'model-like', workflowPolicy: 'enforced-v3',
    lead: leadRoute, worker: workerRoute, dataPolicyId: 'local' }, prompts)
  store.create(created())
  store.append(TASK, 1, [envelope('profile/frozen', 2, { digest: profile.digest, profileId: profile.id, version: profile.version })])
  new BindingRepository(store).select(PARENT, TASK, { profile, prompts })
  return { store }
}

/** Record one finalised request, in the shape the Host itself persists. */
function usage(store: SqliteFusionStore, role: Role, route: PhysicalRoute, input: number, cacheRead: number, output: number): void {
  const id = `${role}-${route.model}-${input}`
  const key = { provider: route.provider, model: route.model, requestId: id, attemptId: id, contractDigest: 'c' }
  const ledger = ingestDurable(newLedger(key), { id: 'o1', key, sequence: 1, mode: 'final',
    bill: { uncachedInput: known(input), cacheRead: known(cacheRead), output: known(output),
      cacheWrite: { kind: 'not_applicable' }, reasoning: { kind: 'not_applicable', tokens: na() } } })
  const record: NativeUsageRecord = { schemaVersion: 1, taskId: TASK, sessionId: role === 'lead' ? PARENT : 'child',
    role, purpose: 'conversation', maxOutputTokens: 8000, nativeInvocationId: id,
    startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), nativeStreamInvocations: 1,
    upstreamHttpCalls: null, outcome: 'stop', ledger, actualSubscriptionChargeUsd: null, apiEquivalentCostUsd: null }
  store.writeDocument(`usage:${TASK}:${id}`, 0, record)
}

/** The store writes `task-index` on create; rewrite it at its current revision. */
function markCompleted(store: SqliteFusionStore): void {
  const id = `task-index:${TASK}`, row = store.readDocument(id)
  store.writeDocument(id, row?.revision ?? 0, { ...(row?.value as object ?? {}), id: TASK, sessionId: PARENT, seq: 2,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), title: 'a task',
    phase: 'COMPLETED', verification: 'verified', mode: 'completed' })
}

describe('cost reaches the status projection', () => {
  it('prices a task and reports the Sidekick saving against the Lead', () => {
    const { store } = setup()
    // 1M tokens through the cheap Sidekick: $0.15 input + $0.03 cache read + $0.50 output = $0.68.
    usage(store, 'worker', worker, 1_000_000, 1_000_000, 1_000_000)
    // A small Lead request: 10k input at $10/1M plus 1k output at $50/1M = $0.15.
    usage(store, 'lead', lead, 10_000, 0, 1_000)

    const cost = readFusionStatus(store, PARENT).task?.cost
    expect(cost).toBeDefined()
    expect(Number(cost!.apiEquivalentUsd)).toBeCloseTo(0.83, 4)
    expect(cost!.priced).toBe(2)
    // Both requests are priced on both sides, so both enter the comparison.
    expect(cost!.basis).toBe(2)
    // The Sidekick's 1M tokens would have cost $61 at Astra rates; it saved the difference.
    expect(Number(cost!.savedUsd)).toBeGreaterThan(55)
    // It is an estimate, never a bill.
    expect(cost!.actualBilledUsd).toBeNull()
  })

  it('reports unpriced models instead of silently costing them at zero', () => {
    const { store } = setup({ provider: 'pi-openai-codex', model: 'gpt-6-astra' }, { provider: 'mystery', model: 'no-rate-model' })
    usage(store, 'worker', { provider: 'mystery', model: 'no-rate-model' }, 1000, 0, 100)
    const cost = readFusionStatus(store, PARENT).task!.cost!
    expect(cost.unpriced).toBe(1)
    expect(cost.priced).toBe(0)
    // Null, not 0: nothing could be priced, and 0 would read as free.
    expect(cost.apiEquivalentUsd).toBeNull()
    expect(cost.unpricedModels).toContain('no-rate-model')
    expect(cost.savedUsd).toBeNull()
  })

  it('uses a saved rate override for the next read', () => {
    const { store } = setup({ provider: 'pi-openai-codex', model: 'gpt-6-astra' }, { provider: 'mystery', model: 'custom-model' })
    usage(store, 'worker', { provider: 'mystery', model: 'custom-model' }, 1_000_000, 0, 0)
    expect(readFusionStatus(store, PARENT).task!.cost!.priced).toBe(0)
    writePriceSettings(store, 0, { 'custom-model': { input: '2', cacheRead: '0', output: '0' } })
    const cost = readFusionStatus(store, PARENT).task!.cost!
    expect(cost.priced).toBe(1)
    expect(Number(cost.apiEquivalentUsd)).toBeCloseTo(2, 6)
  })

  it('rejects a save against a stale revision', () => {
    const { store } = setup()
    writePriceSettings(store, 0, { a: { input: '1', cacheRead: '0', output: '0' } })
    expect(() => writePriceSettings(store, 0, { b: { input: '1', cacheRead: '0', output: '0' } })).toThrow('价目表已变化')
    expect(store.readDocument(PRICE_OVERRIDES_DOCUMENT)?.revision).toBe(1)
  })
})

describe('cost reaches the history projection', () => {
  it('reports money per task and for the page', () => {
    const { store } = setup()
    usage(store, 'worker', worker, 1_000_000, 0, 0)
    markCompleted(store)
    const page = readHistory(store)
    expect(page.cost).toBeDefined()
    expect(page.cost!.priced).toBe(1)
    // $0.15 for 1M uncached input on the Flash route.
    expect(Number(page.cost!.apiEquivalentUsd)).toBeCloseTo(0.15, 4)
    expect(page.tasks[0]?.cost?.priced).toBe(1)
    expect(page.actualBilledUsd).toBeNull()
  })

  it('adds a page total without floating-point drift', () => {
    const { store } = setup()
    // Two Sidekick requests: $0.15 + $0.30 = $0.45 exactly.
    usage(store, 'worker', worker, 1_000_000, 0, 0)
    usage(store, 'worker', worker, 2_000_000, 0, 0)
    markCompleted(store)
    const total = readHistory(store).cost!.apiEquivalentUsd
    expect(Number(total)).toBeCloseTo(0.45, 6)
    // The decimal string itself must be clean, not 0.44999999999999996.
    expect(total).toBe('0.45')
  })
})
