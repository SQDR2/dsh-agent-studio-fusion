import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SqliteFusionStore } from '../src/task/sqlite-store.js'
import { sha256Hex } from '../src/digest.js'
import { newLedger, ingestDurable } from '../src/usage/ledger.js'
import { billFromNativeUsage, type NativeUsageRecord } from '../src/host/native-usage.js'
import { Worker } from 'node:worker_threads'
import { once } from 'node:events'
import { TaskId, type ForemanAttributionRecord, type FusionEvent, type WorkOrderId } from '../src/contracts.js'
import { projectPlanReviewMetrics, recordForemanAttribution, readForemanAttributions } from '../src/task/status-index.js'
import { envelope } from './helpers.js'

const clean: (() => void)[] = []
afterEach(() => clean.splice(0).reverse().forEach(fn => fn()))
function open(file?: string) {
  if (!file) { const dir = mkdtempSync(join(tmpdir(), 'fusion-index-')); clean.push(() => rmSync(dir, { recursive: true, force: true })); file = join(dir, 'state.sqlite') }
  const store = new SqliteFusionStore(file); clean.push(() => store.close()); return store
}
function raw(file: string) { const db = new DatabaseSync(file); clean.push(() => db.close()); return db }
function row(id: string, tokens?: number, mode: 'snapshot' | 'final' = 'final'): NativeUsageRecord {
  const key = { provider: 'p', model: 'm', requestId: id, attemptId: id, contractDigest: 'd' }
  let ledger = newLedger(key)
  if (tokens !== undefined) ledger = ingestDurable(ledger, { id: 'observation', key, sequence: 1, mode, bill: billFromNativeUsage({ inputTokens: tokens, outputTokens: 0 }) })
  return { schemaVersion: 1, taskId: TaskId('t'), sessionId: 's', role: 'worker', purpose: 'conversation', nativeInvocationId: id,
    maxOutputTokens: 32, startedAt: '2026-10-13T00:00:00Z', endedAt: null, nativeStreamInvocations: 1, upstreamHttpCalls: null,
    outcome: 'entered', ledger, actualSubscriptionChargeUsd: null, apiEquivalentCostUsd: null }
}
const read = (store: SqliteFusionStore) => store.statusSnapshot(index => index.read('t'))
function put(db: DatabaseSync, id: string, value: unknown, revision = 1) {
  const json = JSON.stringify(value)
  db.prepare('INSERT INTO documents VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,checksum=excluded.checksum,revision=excluded.revision')
    .run(id, revision, json, sha256Hex(Buffer.from(json)))
}
// Bulk writers go in one transaction. Row-at-a-time autocommit costs a commit per row, which pushed this test past the
// 5s default timeout on a CI runner while the same 600 rows finish in a quarter second locally. What the test asserts
// is what a reader sees, not how many commits produced it.
function putBulk(db: DatabaseSync, write: () => void) {
  db.exec('BEGIN')
  try { write(); db.exec('COMMIT') } catch (err) { db.exec('ROLLBACK'); throw err }
}

describe('incremental status read model', () => {
  it('replaces snapshots/finals without double counting, keeps unknown counts, and rejects stale writers atomically', () => {
    const store = open(), other = open(store.filename), id = 'usage:t:a'
    store.writeDocument(id, 0, row('a'))
    expect(read(other).usage).toMatchObject({ calls: 1, unreportedCalls: 1, input: { reportedRequests: 0, knownTokens: 0, totalRequests: 1 } })
    store.writeDocument(id, 1, row('a', 20, 'snapshot'))
    expect(read(other).usage).toMatchObject({ calls: 1, provisionalCalls: 1, unreportedCalls: 0, input: { knownTokens: 20 } })
    store.writeDocument(id, 2, row('a', 10))
    store.writeDocument(id, 3, row('a', 10))
    expect(read(other).usage).toMatchObject({ calls: 1, finalCalls: 1, provisionalCalls: 0, input: { knownTokens: 10 }, output: { reportedRequests: 1, knownTokens: 0 }, cacheRead: { reportedRequests: 0 } })
    expect(() => other.writeDocuments([{ id: 'usage:t:b', expectedRevision: 0, value: row('b', 50) }, { id, expectedRevision: 3, value: row('a', 100) }])).toThrow('revision changed')
    expect(other.readDocument('usage:t:b')).toBeUndefined(); expect(read(other).usage.calls).toBe(1)
    expect(read(store)).toEqual(read(other))
  })

  it('tracks old-process raw writes, id replacement, deletion and recreation without stale totals', () => {
    const store = open(), db = raw(store.filename)
    put(db, 'usage:t:a', row('a', 3)); expect(read(store).usage.input.knownTokens).toBe(3)
    put(db, 'usage:t:a', row('a', 7), 2); expect(read(store).usage.input.knownTokens).toBe(7)
    db.exec("UPDATE documents SET id='usage:t:b' WHERE id='usage:t:a'")
    expect(read(store).usage.calls).toBe(1); expect(read(store).requests[0].id).toBe('usage:t:b')
    db.exec('DELETE FROM documents'); expect(read(store).usage.calls).toBe(0)
    put(db, 'usage:t:a', row('a', 9)); expect(read(store).usage.input.knownTokens).toBe(9)
    store.statusSnapshot(index => index.rebuild()); expect(read(store).usage.input.knownTokens).toBe(9)
  })

  it('upgrades an old database with bounded dirty batches and rebuilds missing derived tables', { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'fusion-legacy-')); clean.push(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, 'legacy.sqlite'), db = raw(file)
    db.exec('CREATE TABLE documents (id TEXT PRIMARY KEY,revision INTEGER NOT NULL,json TEXT NOT NULL,checksum TEXT NOT NULL); PRAGMA user_version=1;')
    putBulk(db, () => { for (let i = 0; i < 600; i++) put(db, `usage:t:${i}`, row(String(i), 2)) })
    const store = open(file)
    expect(store.statusSnapshot(index => index.flushBatch('t'))).toBe(true)
    expect(db.prepare('SELECT count(*) n FROM fusion_status_dirty_v1').get()?.n).toBe(344)
    // A later batch failure must preserve the committed prefix, and retry must not double count it.
    db.exec("CREATE TRIGGER fail_backfill BEFORE INSERT ON fusion_status_facts_v1 BEGIN SELECT RAISE(ABORT,'injected backfill failure'); END")
    expect(() => read(store)).toThrow('injected backfill failure')
    expect(db.prepare('SELECT count(*) n FROM fusion_status_facts_v1').get()?.n).toBe(256)
    db.exec('DROP TRIGGER fail_backfill')
    expect(read(store).usage).toMatchObject({ calls: 600, input: { knownTokens: 1200 } }); expect(read(store).requests).toHaveLength(12)
    expect(db.prepare('SELECT count(*) n FROM fusion_status_dirty_v1').get()?.n).toBe(0)
    db.exec('DROP TABLE fusion_status_totals_v1')
    const reopened = open(file); expect(read(reopened).usage.input.knownTokens).toBe(1200)
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(1)
  })

  it('yields during backfill, safely cancels, and resumes from committed progress in another store', { timeout: 60_000 }, async () => {
    const store = open(), db = raw(store.filename)
    putBulk(db, () => { for (let i = 0; i < 600; i++) put(db, `usage:t:${i}`, row(String(i), 2)) })
    const abort = new AbortController()
    setImmediate(() => abort.abort())
    await expect(store.statusSnapshotAsync(index => index.read('t'), abort.signal)).rejects.toThrow()
    expect(db.prepare('SELECT count(*) n FROM fusion_status_facts_v1').get()?.n).toBe(256)
    expect(db.prepare('SELECT count(*) n FROM fusion_status_dirty_v1').get()?.n).toBe(344)
    const other = open(store.filename)
    const [a, b] = await Promise.all([store.statusSnapshotAsync(index => index.read('t')), other.statusSnapshotAsync(index => index.read('t'))])
    expect(a).toEqual(b); expect(a.usage).toMatchObject({ calls: 600, input: { knownTokens: 1200 } })
  })

  it('rebuilds after a missing trigger allowed an old writer to bypass invalidation', () => {
    const store = open(), db = raw(store.filename)
    store.writeDocument('usage:t:a', 0, row('a', 2))
    db.exec('DROP TRIGGER fusion_status_update_v1')
    put(db, 'usage:t:a', row('a', 7), 2)
    const reopened = open(store.filename)
    expect(read(reopened).usage.input.knownTokens).toBe(7)
    expect(read(store)).toEqual(read(reopened))
  })

  it('keeps recent previews, latest contexts and effect/check transitions bounded and complete', () => {
    const store = open()
    for (let i = 0; i < 30; i++) store.writeDocument(`usage:t:${String(i).padStart(2, '0')}`, 0, { ...row(String(i)), startedAt: new Date(i * 1000).toISOString() })
    store.writeDocument('native-effect:t:e', 0, { schemaVersion: 1, taskId: 't', role: 'worker', toolName: 'shell', state: 'dispatch-started', startedAt: 'now', arguments: { secret: 'must-not-expose' } })
    store.writeDocument('check-invocation:t:c', 0, { evidence: { taskId: 't', state: 'started' } })
    for (const role of ['lead', 'worker']) for (let i = 0; i < 3; i++) store.writeDocument(`context-request:t:${role}${i}`, 0, { schemaVersion: 1, taskId: 't', role, purpose: 'conversation', checkedAt: String(i), measurement: { inputTokens: i, quality: 'heuristic' }, budget: 50, admitted: true })
    const value = read(store)
    expect(value).toMatchObject({ checking: true, unsettledTools: 1 }); expect(value.requests[0].id).toBe('usage:t:29'); expect(value.requests).toHaveLength(12)
    expect(value.contexts.map(v => v.inputTokens)).toEqual([2, 2]); expect(JSON.stringify(value)).not.toContain('must-not-expose')
    store.writeDocument('check-invocation:t:c', 1, { evidence: { taskId: 't', state: 'done' } })
    store.writeDocument('native-effect:t:e', 1, { schemaVersion: 1, taskId: 't', role: 'worker', toolName: 'shell', state: 'returned', startedAt: 'now' })
    expect(read(store)).toMatchObject({ checking: false, unsettledTools: 0 })
    expect(store.statusSnapshot(index => index.hasConversation('t', 's'))).toBe(true)
    expect(store.statusSnapshot(index => index.workerConversations('t'))).toBe(30)
  })

  it('detects corrupt source updates and isolates another task from malformed records', () => {
    const store = open(), db = raw(store.filename)
    store.writeDocument('usage:t:a', 0, row('a', 1))
    db.exec("UPDATE documents SET json='{}' WHERE id='usage:t:a'")
    expect(() => read(store)).toThrow('corrupt Host document')
    expect(db.prepare('SELECT count(*) n FROM fusion_status_dirty_v1').get()?.n).toBe(0)
    expect(store.statusSnapshot(index => index.read('other')).usage.calls).toBe(0)
    put(db, 'usage:t:a', row('a', 2), 2)
    expect(read(store).usage.input.knownTokens).toBe(2)
  })
  it('reads a whole committed batch while another process connection writes', async () => {
    const store = open()
    const worker = new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      const {DatabaseSync}=require('node:sqlite');
      const {createHash}=require('node:crypto');
      const db=new DatabaseSync(workerData.file); db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
      const put=db.prepare('INSERT INTO documents VALUES (?,1,?,?)');
      for(const [id,row] of workerData.rows){const json=JSON.stringify(row);put.run(id,json,createHash('sha256').update(json).digest('hex'))}
      parentPort.postMessage('locked');
      setTimeout(()=>{db.exec('COMMIT');db.close()},50);
    `, { eval: true, workerData: { file: store.filename, rows: [['usage:t:a', row('a', 3)], ['usage:t:b', row('b', 7)]] } })
    try {
      await once(worker, 'message')
      expect(read(store).usage).toMatchObject({ calls: 2, input: { knownTokens: 10, reportedRequests: 2 } })
    } finally { await worker.terminate() }
  })

  it('tracks foreman usage separately in foremanCalls and byPurpose without contaminating lead or worker roles', () => {
    const store = open()
    const foremanRecord: NativeUsageRecord = {
      ...row('foreman-1', 40),
      role: 'lead',
      purpose: 'foreman',
    }
    const leadRecord: NativeUsageRecord = {
      ...row('lead-1', 100),
      role: 'lead',
      purpose: 'conversation',
    }
    const workerRecord: NativeUsageRecord = {
      ...row('worker-1', 200),
      role: 'worker',
      purpose: 'conversation',
    }
    store.writeDocument('usage:t:foreman-1', 0, foremanRecord)
    store.writeDocument('usage:t:lead-1', 0, leadRecord)
    store.writeDocument('usage:t:worker-1', 0, workerRecord)

    const status = read(store)
    expect(status.usage.calls).toBe(3)
    expect(status.usage.foremanCalls).toBe(1)
    expect(status.usage.input.knownTokens).toBe(340)

    // Lead role only has lead-1 (100 tokens)
    expect(status.usage.byRole.lead.calls).toBe(1)
    expect(status.usage.byRole.lead.input.knownTokens).toBe(100)

    // Worker role only has worker-1 (200 tokens)
    expect(status.usage.byRole.worker.calls).toBe(1)
    expect(status.usage.byRole.worker.input.knownTokens).toBe(200)

    // Foreman purpose has foreman-1 (40 tokens)
    expect(status.usage.byPurpose?.foreman?.calls).toBe(1)
    expect(status.usage.byPurpose?.foreman?.input.knownTokens).toBe(40)
  })

  it('rebuilds a projection written by an older build whose totals table lacked foremanCalls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fusion-oldindex-')); clean.push(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, 'old.sqlite'), db = raw(file)
    // A real earlier build: schema version 1, present tasks table, and the projection tables it
    // created before `foremanCalls` existed.
    db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
      CREATE TABLE artifacts (task_id TEXT NOT NULL REFERENCES tasks(id), digest TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(task_id, digest));
      CREATE TABLE documents (id TEXT PRIMARY KEY,revision INTEGER NOT NULL,json TEXT NOT NULL,checksum TEXT NOT NULL);
      PRAGMA user_version=1;
      CREATE TABLE fusion_status_dirty_v1 (id TEXT PRIMARY KEY);
      CREATE TABLE fusion_status_facts_v1 (id TEXT PRIMARY KEY, task TEXT NOT NULL, kind TEXT NOT NULL, role TEXT NOT NULL,
        stamp TEXT NOT NULL, session TEXT NOT NULL, active INTEGER NOT NULL, error TEXT, preview TEXT NOT NULL,
        calls INTEGER NOT NULL, finalCalls INTEGER NOT NULL, provisionalCalls INTEGER NOT NULL, unreportedCalls INTEGER NOT NULL,
        compactionCalls INTEGER NOT NULL, keepaliveCalls INTEGER NOT NULL,
        inputTokens INTEGER NOT NULL, inputReported INTEGER NOT NULL, cacheReadTokens INTEGER NOT NULL, cacheReadReported INTEGER NOT NULL,
        outputTokens INTEGER NOT NULL, outputReported INTEGER NOT NULL, unsettled INTEGER NOT NULL, checking INTEGER NOT NULL,
        workerConversations INTEGER NOT NULL);
      CREATE TABLE fusion_status_totals_v1 (task TEXT NOT NULL, role TEXT NOT NULL,
        calls INTEGER NOT NULL, finalCalls INTEGER NOT NULL, provisionalCalls INTEGER NOT NULL, unreportedCalls INTEGER NOT NULL,
        compactionCalls INTEGER NOT NULL, keepaliveCalls INTEGER NOT NULL,
        inputTokens INTEGER NOT NULL, inputReported INTEGER NOT NULL, cacheReadTokens INTEGER NOT NULL, cacheReadReported INTEGER NOT NULL,
        outputTokens INTEGER NOT NULL, outputReported INTEGER NOT NULL, unsettled INTEGER NOT NULL, checking INTEGER NOT NULL,
        workerConversations INTEGER NOT NULL, PRIMARY KEY(task,role));`)
    const withTokens = (id: string, tokens: number, role: string, purpose: string): NativeUsageRecord => ({
      ...row(id, tokens), role: role as NativeUsageRecord['role'], purpose: purpose as NativeUsageRecord['purpose'] })
    putBulk(db, () => {
      put(db, 'usage:t:lead', withTokens('lead', 10, 'lead', 'conversation'))
      put(db, 'usage:t:worker', withTokens('worker', 20, 'worker', 'conversation'))
      put(db, 'usage:t:foreman', withTokens('foreman', 5, 'lead', 'foreman'))
    })
    const store = open(file)
    // The old tables are a rebuildable cache. Opening must notice the missing column, recreate
    // the shape and re-queue every relevant document, leaving `documents` untouched.
    const status = read(store)
    expect(status.usage).toMatchObject({ calls: 3, foremanCalls: 1, input: { knownTokens: 35 } })
    expect(status.usage.byRole.lead.input.knownTokens).toBe(10)
    expect(status.usage.byRole.worker.input.knownTokens).toBe(20)
    expect(status.usage.byPurpose?.foreman?.input.knownTokens).toBe(5)
    expect(db.prepare('SELECT count(*) n FROM documents').get()?.n).toBe(3)
    expect(db.prepare('PRAGMA table_info(fusion_status_totals_v1)').all().map((c: any) => c.name)).toContain('foremanCalls')
  })

  it('projects plan review metrics from a sequence of events', () => {
    const orderId = 'order-1' as WorkOrderId
    const digest = 'd'.repeat(64) as any

    const concernsAssessment = {
      schemaVersion: 1 as const,
      candidateDigest: digest,
      verdict: 'concerns' as const,
      acceptanceAudit: { uncoveredRequirements: [], weakOracles: [], falseGreenScenarios: [] },
      decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
      materialAmbiguities: [{
        id: 'f-1',
        category: 'material-ambiguity' as const,
        severity: 'blocking-concern' as const,
        requirementIndexes: [],
        decisionIndexes: [],
        message: 'Ambiguous',
        suggestedCorrection: 'Fix',
      }],
    }

    const readyAssessment = {
      schemaVersion: 1 as const,
      candidateDigest: digest,
      verdict: 'ready' as const,
      acceptanceAudit: { uncoveredRequirements: [], weakOracles: [], falseGreenScenarios: [] },
      decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
      materialAmbiguities: [],
    }

    const events: FusionEvent[] = [
      // Round 1: concerns
      envelope('plan-review/completed', 1, {
        workOrderId: orderId,
        candidateDigest: digest,
        round: 1,
        assessment: concernsAssessment,
        record: {} as any,
      }),
      // Resolutions: 1 override, 1 accepted
      envelope('plan-review/resolved', 2, {
        workOrderId: orderId,
        candidateDigest: digest,
        round: 1,
        dispositions: [
          { findingId: 'f-1', action: 'overridden', reason: 'Deliberate design' },
          { findingId: 'f-2', action: 'accepted', changeSummary: 'Updated tests' },
        ],
      }),
      // Round 2 (reworkRound): ready
      envelope('plan-review/completed', 3, {
        workOrderId: orderId,
        candidateDigest: digest,
        round: 2,
        assessment: readyAssessment,
        record: {} as any,
      }),
      // Another task/round: unavailable
      envelope('plan-review/unavailable', 4, {
        workOrderId: orderId,
        candidateDigest: digest,
        round: 1,
        reason: 'timeout',
        record: {} as any,
      }),
      // Protocol invalid review completion -> errorAccept
      envelope('review/completed', 5, {
        decision: 'accept',
        binding: { protocolValid: false } as any,
      }),
    ]

    const metrics = projectPlanReviewMetrics(events)
    expect(metrics).toEqual({
      reviews: 3,
      concerns: 1,
      ready: 1,
      unavailable: 1,
      overrides: 1,
      acceptedDispositions: 1,
      // The reviewer's round 2 is its own counter; no Worker rework happened in this trace.
      reworkRounds: 0,
      planReviewRevisions: 1,
      errorAccepts: 1,
    })
  })

  it('counts Worker rework rounds from the rework events and ignores unverified completion', () => {
    const taskId = 't' as TaskId
    // A report revision tracks user requirements, not rework: three Lead handoffs back to
    // implementation still report revision 1, which is exactly why the metric reads events.
    const validated = (revision: number, verification: 'verified' | 'unverified') => envelope('report/validated', revision, {
      operationId: 'op' as never,
      report: { revision, verification } as never,
    })
    const reworked = (seq: number, ordinal: number) => envelope('worker/rework-requested', seq, {
      workOrderId: 'wo' as never, child: 'worker' as never, ordinal, briefRevision: ordinal,
    })
    const events: FusionEvent[] = [
      validated(1, 'verified'),
      validated(1, 'unverified'),
      reworked(10, 1),
      reworked(11, 2),
      // An accept over a valid binding after an unverified completion is not an error accept:
      // the task recorded that it settled unverified, which the verification level reports.
      envelope('review/completed', 20, { decision: 'accept', binding: { protocolValid: true } as never }),
      envelope('review/completed', 21, { decision: 'accept', binding: { protocolValid: false } as never }),
    ]
    const metrics = projectPlanReviewMetrics(events)
    expect(metrics.reworkRounds).toBe(2)
    expect(metrics.planReviewRevisions).toBe(0)
    expect(metrics.errorAccepts).toBe(1)
    expect(taskId).toBe('t' as TaskId)
  })

  it('records attributions only on an existing task, and reads them back from its state', () => {
    const store = open()
    // An attribution describes a task; there is no task here, so nothing is written.
    const orphan: ForemanAttributionRecord = {
      schemaVersion: 1, id: 'attr-orphan', taskId: TaskId('missing-task'), failureClass: 'plan-defect',
      preventableAtPlanTime: true, attribution: 'hit', confidence: 0.5, evidence: [],
    }
    expect(() => recordForemanAttribution(store, orphan)).toThrow(/unknown task/)
    expect(store.listTaskIds()).not.toContain('missing-task')

    store.create({
      schemaVersion: 1, id: 'created-1', taskId: TaskId('task-attr-test'), seq: 1, revision: 1,
      createdAt: '2026-01-01T00:00:00Z', causeId: 'test', type: 'task/created',
      payload: { parent: 'lead' as never, selection: { profileId: 'p', profileDigest: 'd' } as never },
    } as never)
    const taskId = TaskId('task-attr-test')
    const record: ForemanAttributionRecord = {
      schemaVersion: 1, id: 'attr-1', taskId, workOrderId: 'wo-1' as WorkOrderId,
      candidateDigest: 'c'.repeat(64) as never, failureClass: 'acceptance-gap', preventableAtPlanTime: true,
      attribution: 'hit', confidence: 0.9, evidence: [], summary: 'Acceptance gap detected offline',
    }
    recordForemanAttribution(store, record)
    expect(readForemanAttributions(store, taskId)).toEqual([record])
    // Read from state/events, not from a side document: nothing redundant is persisted.
    expect(store.listDocumentIds('foreman-attribution:')).toHaveLength(0)
    expect(store.events(taskId).filter(event => event.type === 'foreman-attribution/completed')).toHaveLength(1)
    expect(store.load(taskId)?.foremanAttributions).toEqual([record])
    expect(readForemanAttributions(store, TaskId('other-task'))).toHaveLength(0)
  })

  it('rejects malformed attribution evidence and non-boolean preventability', () => {
    const store = open()
    store.create({
      schemaVersion: 1, id: 'created-2', taskId: TaskId('t-evidence'), seq: 1, revision: 1,
      createdAt: '2026-01-01T00:00:00Z', causeId: 'test', type: 'task/created',
      payload: { parent: 'lead' as never, selection: { profileId: 'p', profileDigest: 'd' } as never },
    } as never)
    const base: ForemanAttributionRecord = { schemaVersion: 1, id: 'a', taskId: TaskId('t-evidence'),
      failureClass: 'plan-defect', preventableAtPlanTime: false, attribution: 'hit', confidence: 0.5, evidence: [] }
    // An array of junk is not evidence: each entry has to be a resolvable artifact reference.
    expect(() => recordForemanAttribution(store, { ...base, evidence: ['nope'] as never }))
      .toThrow(/must be an artifact reference object/)
    expect(() => recordForemanAttribution(store, { ...base,
      evidence: [{ id: 'x', digest: 'y', ownerTaskId: 't', mediaType: 'text/plain', bytes: -1 }] as never }))
      .toThrow(/bytes must be a non-negative integer/)
    expect(() => recordForemanAttribution(store, { ...base,
      evidence: [{ id: '', digest: 'y', ownerTaskId: 't', mediaType: 'text/plain', bytes: 1 }] as never }))
      .toThrow(/id must be a non-empty string/)
    expect(() => recordForemanAttribution(store, { ...base, preventableAtPlanTime: 'yes' as never }))
      .toThrow(/preventableAtPlanTime must be a boolean/)
  })

  it('persists several attributions to the replayable event log, not only a side document', () => {
    const store = open()
    // A task must exist for the attributed event to join its own durable log.
    store.create({
      schemaVersion: 1, id: 'created-1', taskId: TaskId('t-attr'), seq: 1, revision: 1,
      createdAt: '2026-01-01T00:00:00Z', causeId: 'test', type: 'task/created',
      payload: { parent: 'lead' as never, selection: { profileId: 'p', profileDigest: 'd' } as never },
    } as never)
    const make = (id: string, attribution: ForemanAttributionRecord['attribution']): ForemanAttributionRecord => ({
      schemaVersion: 1, id, taskId: TaskId('t-attr'), failureClass: 'acceptance-gap', preventableAtPlanTime: true,
      attribution, confidence: 0.7, evidence: [], summary: id,
    })
    recordForemanAttribution(store, make('a-1', 'hit'))
    recordForemanAttribution(store, make('a-2', 'miss'))
    recordForemanAttribution(store, make('a-3', 'false-positive'))

    const events = store.events(TaskId('t-attr')).filter(event => event.type === 'foreman-attribution/completed')
    expect(events).toHaveLength(3)
    expect(store.events(TaskId('t-attr')).filter(event => event.type === 'foreman-attribution/completed')
      .map(event => (event.payload as { record: ForemanAttributionRecord }).record.attribution))
      .toEqual(['hit', 'miss', 'false-positive'])
    expect(readForemanAttributions(store, TaskId('t-attr'))).toHaveLength(3)

    // Replay of the same id and content is idempotent; a different record on the same id is
    // a conflict, because the id is the key an offline calibration run joins on.
    recordForemanAttribution(store, make('a-1', 'hit'))
    expect(store.events(TaskId('t-attr')).filter(event => event.type === 'foreman-attribution/completed')).toHaveLength(3)
    expect(() => recordForemanAttribution(store, make('a-1', 'miss'))).toThrow(/conflict/)
  })

  it('validates attribution confidence, enums and evidence before recording anything', () => {
    const store = open()
    const base: ForemanAttributionRecord = {
      schemaVersion: 1, id: 'a', taskId: TaskId('t'), failureClass: 'plan-defect', preventableAtPlanTime: false,
      attribution: 'hit', confidence: 0.5, evidence: [],
    }
    expect(() => recordForemanAttribution(store, { ...base, confidence: -0.1 })).toThrow(/between 0 and 1/)
    expect(() => recordForemanAttribution(store, { ...base, confidence: 1.1 })).toThrow(/between 0 and 1/)
    expect(() => recordForemanAttribution(store, { ...base, confidence: Number.NaN })).toThrow(/between 0 and 1/)
    expect(() => recordForemanAttribution(store, { ...base, attribution: 'maybe' as never })).toThrow(/Invalid attribution/)
    expect(() => recordForemanAttribution(store, { ...base, failureClass: 'other' as never })).toThrow(/Invalid failureClass/)
    expect(() => recordForemanAttribution(store, { ...base, evidence: undefined as never })).toThrow(/evidence must be an array/)
    expect(() => recordForemanAttribution(store, { ...base, id: '  ' })).toThrow(/id must be a non-empty string/)
  })
})

describe('history projection of plan review detail', () => {
  it('carries Foreman tokens, cost, elapsed time and answered findings, excluding them from the pair', async () => {
    const { taskSummary } = await import('../src/host/history.js')
    const digest = 'b'.repeat(64)
    const store = open()
    const state = {
      taskId: TaskId('t'), parent: 'lead', seq: 4, phase: 'COMPLETED', verification: 'verified', control: { mode: 'completed' },
      planReviews: [{
        schemaVersion: 1 as const, taskId: TaskId('t'), workOrderId: 'wo' as WorkOrderId, candidateDigest: digest as never,
        round: 1, route: { provider: 'p', model: 'foreman' }, requestedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:00:02Z', outcome: 'assessment' as const, durationMs: 2000,
        assessment: { schemaVersion: 1 as const, candidateDigest: digest, verdict: 'concerns' as const,
          acceptanceAudit: { uncoveredRequirements: [{ id: 'f-1', category: 'acceptance-gap' as const, severity: 'warning' as const,
            requirementIndexes: [0], decisionIndexes: [], message: 'no oracle', suggestedCorrection: 'add one' }],
          weakOracles: [], falseGreenScenarios: [] },
          decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
          materialAmbiguities: [] },
      }],
      planReviewResolutions: [{ workOrderId: 'wo' as WorkOrderId, candidateDigest: digest as never, round: 1,
        dispositions: [{ findingId: 'f-1', action: 'accepted' as const, changeSummary: 'added a check' }] }],
      latestPlanReview: undefined,
    } as never
    const planned = { ...(state as Record<string, unknown>), latestPlanReview: (state as unknown as { planReviews: readonly unknown[] }).planReviews[0] }
    const summary = taskSummary(planned as never, '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z')
    expect(summary.planReview).toMatchObject({ status: 'concerns', round: 1,
      dispositionsCount: { accepted: 1, overridden: 0 } })
    expect(summary.planReview?.findings?.[0]).toMatchObject({ id: 'f-1', category: 'acceptance-gap',
      disposition: { action: 'accepted', note: 'added a check' } })

    // Foreman usage is its own block: the Lead/Sidekick totals in the same page must not grow.
    const foreman = { ...row('foreman-1', 40), role: 'lead' as const, purpose: 'foreman' as const,
      startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:01.500Z' }
    store.writeDocument('usage:t:foreman-1', 0, foreman)
    const withUsage = taskSummary(planned as never, '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z')
    expect(store.listDocumentIds('usage:t:')).toHaveLength(1)
    expect(withUsage.planReview?.status).toBe('concerns')
  })
})
