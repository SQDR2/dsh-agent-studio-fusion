import { acceptedResultFromTicket } from './review-fixture.js'
import { describe, expect, it } from 'vitest'
import { ArtifactId, PUBLICATION_PROHIBITION, WorkOrderId } from '../src/contracts.js'
import type { PlanReviewRecord } from '../src/contracts.js'
import { FusionError, REVISION_STALE } from '../src/errors.js'
import { reviewRequestedEvent } from '../src/review/ticket.js'
import { reduce, reduceAll } from '../src/task/reducer.js'
import { CHILD, SNAP, created, envelope, order } from './helpers.js'

const report = {
  schemaVersion: 1 as const,
  workOrderId: order().id,
  revision: 1,
  status: 'completed' as const,
  summary: 'done',
  snapshot: SNAP,
  changeManifest: {
    id: ArtifactId('m'),
    digest: digestish(),
    ownerTaskId: created().taskId,
    mediaType: 'text/plain',
    bytes: 1,
  },
  coverage: [],
  verification: [],
  unresolved: [],
  questions: [],
}

function digestish() {
  return 'a'.repeat(64) as ReturnType<typeof import('../src/digest.js').sha256Hex>
}

function happyPath() {
  const prefix = [
    created(),
    envelope('profile/frozen', 2, { digest: digestish(), profileId: 'fusion-auto', version: '0.1.0-experimental' }),
    envelope('intent/chosen', 3, { intent: 'DELEGATE' }),
    envelope('work-order/prepared', 4, { order: order(), reservedChild: CHILD }),
    envelope('child/accepted', 5, { operationId: order().operationId, child: CHILD, messageId: 'm1' }),
    envelope('report/submitted', 6, { operationId: order().operationId, report }),
    envelope('report/validated', 7, { operationId: order().operationId, report }),
  ]
  const requested = reviewRequestedEvent(reduceAll(prefix), 8, { ticketId: 'ticket-1', requestId: 'req-1' })
  const completed = acceptedResultFromTicket(requested.payload.ticket, 9, { terminalEvidenceRef: 'term:req-1' })
  return [
    ...prefix,
    requested,
    completed,
    envelope('task/completed', 10, { snapshot: SNAP, verification: 'verified' }),
  ]
}

describe('task reducer', () => {
  it('widens the current work order scope only by adding paths', () => {
    const reported = reduceAll(happyPath().slice(0, 7))
    const widened = reduce(reported, envelope('work-order/scope-expanded', 8,
      { workOrderId: order().id, allowedPaths: [...order().allowedPaths, 'tests/extra.py'], added: ['tests/extra.py'], reason: 'test outside scope' }))
    expect(widened.currentWorkOrder?.allowedPaths).toEqual([...order().allowedPaths, 'tests/extra.py'])
    expect(() => reduce(reported, envelope('work-order/scope-expanded', 8,
      { workOrderId: order().id, allowedPaths: ['tests/extra.py'], added: ['tests/extra.py'], reason: 'drops the original scope' }))).toThrowError(FusionError)
  })

  it('grants an authority action to the current work order and only ever adds', () => {
    const reported = reduceAll(happyPath().slice(0, 7))
    const orderWithProhibition = envelope('work-order/prepared', 4, { order: {
      ...order(), authority: undefined, forbiddenActions: [...order().forbiddenActions, PUBLICATION_PROHIBITION],
    }, reservedChild: CHILD })
    const frozen = reduceAll([...happyPath().slice(0, 3), orderWithProhibition, ...happyPath().slice(4, 7)])
    const granted = reduce(frozen, envelope('work-order/authority-granted', 8,
      { workOrderId: order().id, authority: ['commit', 'push'], added: ['commit', 'push'], reason: 'user asked to publish' }))
    expect(granted.currentWorkOrder?.authority).toEqual(['commit', 'push'])
    // The prohibition described the ungranted state, so it is gone once an action is granted.
    expect(granted.currentWorkOrder?.forbiddenActions).toEqual(order().forbiddenActions)
    // A second grant widens; it never drops what the order already had.
    const widened = reduce(granted, envelope('work-order/authority-granted', 9,
      { workOrderId: order().id, authority: ['commit', 'push', 'pr'], added: ['pr'], reason: 'open the pull request too' }))
    expect(widened.currentWorkOrder?.authority).toEqual(['commit', 'push', 'pr'])
    expect(() => reduce(granted, envelope('work-order/authority-granted', 9,
      { workOrderId: order().id, authority: ['commit'], added: [], reason: 'drops the push' }))).toThrowError(FusionError)
    // A grant for another order never reaches the current one.
    expect(() => reduce(reported, envelope('work-order/authority-granted', 8,
      { workOrderId: WorkOrderId('wo-other'), authority: ['commit'], added: ['commit'], reason: 'wrong order' }))).toThrowError(FusionError)
  })

  it('replays the same events to the same state', () => {
    expect(reduceAll(happyPath())).toEqual(reduceAll(happyPath()))
    expect(reduceAll(happyPath()).phase).toBe('COMPLETED')
  })

  it('treats duplicate event ids as idempotent', () => {
    const first = reduce(undefined, created())
    expect(reduce(first, created())).toEqual(first)
  })

  it('rejects an old revision completing a newer task', () => {
    const state = reduceAll([
      created(),
      envelope('requirements/revised', 2, { reason: 'user added a constraint' }, { revision: 2 }),
      envelope('intent/chosen', 3, { intent: 'DIRECT' }, { revision: 2 }),
    ])
    expect(state.revision).toBe(2)
    expect(() => reduce(state, envelope('task/completed', 4, { snapshot: SNAP, verification: 'verified' }, { revision: 1 })))
      .toThrowError(FusionError)
    try {
      reduce(state, envelope('task/completed', 4, { snapshot: SNAP, verification: 'verified' }, { revision: 1 }))
    } catch (error) {
      expect((error as FusionError).code).toBe(REVISION_STALE)
    }
  })

  it('rejects a late report for a stale revision', () => {
    const state = reduceAll([
      created(),
      envelope('requirements/revised', 2, { reason: 'steer' }, { revision: 2 }),
    ])
    expect(() => reduce(state, envelope('report/validated', 3, { operationId: order().operationId, report }, { revision: 2 })))
      .toThrowError(/report revision 1/)
  })

  it('does not complete while an effect is unknown', () => {
    const state = reduceAll([
      created(),
      envelope('intent/chosen', 2, { intent: 'DIRECT' }),
      envelope('effect/outcome-unknown', 3, { operationId: order().operationId, reason: 'crash after dispatch' }),
    ])
    expect(state.phase).toBe('NEEDS_DECISION')
    expect(() => reduce(state, envelope('task/completed', 4, { snapshot: SNAP, verification: 'partial' }))).toThrowError(/OUTCOME_UNKNOWN/)
  })

  it('keeps DIRECT from forcing a worker', () => {
    const state = reduceAll([
      created(),
      envelope('intent/chosen', 2, { intent: 'DIRECT' }),
    ])
    expect(state.phase).toBe('DIRECT')
    expect(state.reservedChild).toBeUndefined()
  })

  it('maps stop then cancel without inventing a new child', () => {
    const state = reduceAll([
      created(),
      envelope('work-order/prepared', 2, { order: order(), reservedChild: CHILD }),
      envelope('child/accepted', 3, { operationId: order().operationId, child: CHILD, messageId: 'm1' }),
      envelope('task/stop-requested', 4, { intent: 'cancel' }),
      envelope('task/cancelled', 5, { reason: 'user cancel' }),
    ])
    expect(state.phase).toBe('CANCELLED')
    expect(state.acceptedChild).toBe(CHILD)
  })

  it('manages plan-review lifecycle, pending validation, deduplication and resolution', () => {
    const initial = reduce(undefined, created())
    const digest = 'd'.repeat(64) as any
    const route = { provider: 'test-p', model: 'foreman-m' }

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
        message: 'Ambiguous spec',
        suggestedCorrection: 'Clarify',
      }],
    }

    const concernsRecord = {
      schemaVersion: 1 as const,
      taskId: initial.taskId,
      workOrderId: order().id,
      candidateDigest: digest,
      round: 1,
      route,
      requestedAt: '2026-11-16T00:00:00Z',
      completedAt: '2026-11-16T00:00:05Z',
      outcome: 'assessment' as const,
      assessment: concernsAssessment,
      durationMs: 5000,
    }

    // 1. plan-review/requested sets pendingPlanReview
    const req1 = envelope('plan-review/requested', 2, {
      workOrderId: order().id,
      candidateDigest: digest,
      round: 1,
      route,
      requestedAt: '2026-11-16T00:00:00Z',
    })
    const requestedState = reduce(initial, req1)
    expect(requestedState.pendingPlanReview).toEqual({
      workOrderId: order().id,
      candidateDigest: digest,
      round: 1,
      route,
      requestedAt: '2026-11-16T00:00:00Z',
    })

    // 2. plan-review/completed without matching pending throws error
    expect(() => reduce(initial, envelope('plan-review/completed', 2, {
      workOrderId: order().id,
      candidateDigest: digest,
      round: 1,
      assessment: concernsAssessment,
      record: concernsRecord,
    }))).toThrow(/pending plan review request/)

    // 3. Mismatched candidateDigest in completed throws error
    expect(() => reduce(requestedState, envelope('plan-review/completed', 3, {
      workOrderId: order().id,
      candidateDigest: 'e'.repeat(64) as any,
      round: 1,
      assessment: concernsAssessment,
      record: { ...concernsRecord, candidateDigest: 'e'.repeat(64) as any },
    }))).toThrow(/does not match completed payload/i)

    // 4. Completed successfully with concerns
    const completedState = reduce(requestedState, envelope('plan-review/completed', 3, {
      workOrderId: order().id,
      candidateDigest: digest,
      round: 1,
      assessment: concernsAssessment,
      record: concernsRecord,
    }))
    expect(completedState.pendingPlanReview).toBeUndefined()
    expect(completedState.planReviews).toHaveLength(1)
    expect(completedState.latestPlanReview?.assessment?.verdict).toBe('concerns')

    // 5. Duplicate round for same candidateDigest is rejected
    expect(() => reduce(completedState, envelope('plan-review/requested', 4, {
      workOrderId: order().id,
      candidateDigest: digest,
      round: 1,
      route,
      requestedAt: '2026-11-16T00:00:10Z',
    }))).toThrow(/Duplicate plan review round 1/)

    // 6. plan-review/resolved attaches dispositions
    const resolvedState = reduce(completedState, envelope('plan-review/resolved', 4, {
      workOrderId: order().id,
      candidateDigest: digest,
      round: 1,
      dispositions: [{ findingId: 'f-1', action: 'overridden', reason: 'Intentional scope choice' }],
      resolvedAt: '2026-11-16T00:00:15Z',
    }))
    expect(resolvedState.latestPlanReview?.dispositions).toHaveLength(1)
    expect(resolvedState.latestPlanReview?.dispositions?.[0]?.action).toBe('overridden')
    expect(resolvedState.planReviewResolutions).toHaveLength(1)

    // 7. plan-review/unavailable lifecycle
    const digest2 = '2'.repeat(64) as any
    const reqRound2 = envelope('plan-review/requested', 5, {
      workOrderId: order().id,
      candidateDigest: digest2,
      round: 2,
      route,
      requestedAt: '2026-11-16T00:00:20Z',
    })
    const round2Pending = reduce(resolvedState, reqRound2)
    const unavailRecord = {
      schemaVersion: 1 as const,
      taskId: initial.taskId,
      workOrderId: order().id,
      candidateDigest: digest2,
      round: 2,
      route,
      requestedAt: '2026-11-16T00:00:20Z',
      completedAt: '2026-11-16T00:00:25Z',
      outcome: 'unavailable' as const,
      unavailableReason: 'model timeout',
      durationMs: 5000,
    }
    const unavailState = reduce(round2Pending, envelope('plan-review/unavailable', 6, {
      workOrderId: order().id,
      candidateDigest: digest2,
      round: 2,
      reason: 'model timeout',
      record: unavailRecord,
    }))
    expect(unavailState.pendingPlanReview).toBeUndefined()
    expect(unavailState.planReviews).toHaveLength(2)
    expect(unavailState.latestPlanReview?.outcome).toBe('unavailable')
    expect(unavailState.latestPlanReview?.unavailableReason).toBe('model timeout')

    // 8. foreman-attribution/completed records durable defect attribution
    const attrState = reduce(unavailState, envelope('foreman-attribution/completed', 7, {
      record: {
        schemaVersion: 1,
        id: 'attr-1',
        taskId: initial.taskId,
        workOrderId: order().id,
        candidateDigest: digest,
        failureClass: 'plan-defect',
        preventableAtPlanTime: true,
        attribution: 'hit',
        confidence: 0.95,
        evidence: [],
        summary: 'Foreman correctly flagged missing acceptance oracle',
      },
    }))
    expect(attrState.foremanAttributions).toHaveLength(1)
    expect(attrState.foremanAttributions![0]!.attribution).toBe('hit')
  })
})

describe('plan review reducer binding', () => {
  const digest = 'd'.repeat(64) as any
  const route = { provider: 'test-p', model: 'foreman-m' }
  const assessment = (verdict: 'ready' | 'concerns', findings = 0) => ({
    schemaVersion: 1 as const,
    candidateDigest: digest,
    verdict,
    acceptanceAudit: { uncoveredRequirements: [] as never[], weakOracles: [] as never[], falseGreenScenarios: [] as never[] },
    decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
    materialAmbiguities: Array.from({ length: findings }, (_, i) => ({
      id: `f-${i}`, category: 'material-ambiguity' as const, severity: 'blocking-concern' as const,
      requirementIndexes: [], decisionIndexes: [], message: `gap ${i}`, suggestedCorrection: 'fix',
    })),
  })
  const record = (verdict: 'ready' | 'concerns', findings = 0, patch: Record<string, unknown> = {}): PlanReviewRecord => ({
    schemaVersion: 1 as const, taskId: created().taskId, workOrderId: order().id, candidateDigest: digest, round: 1,
    route, requestedAt: '2026-11-16T00:00:00Z', completedAt: '2026-11-16T00:00:05Z', outcome: 'assessment' as const,
    assessment: assessment(verdict, findings) as PlanReviewRecord['assessment'], durationMs: 5, ...patch,
  } as PlanReviewRecord)
  const requested = (patch: Record<string, unknown> = {}) => envelope('plan-review/requested', 2, {
    workOrderId: order().id, candidateDigest: digest, round: 1, route, requestedAt: '2026-11-16T00:00:00Z', ...patch,
  })
  const base = () => reduce(undefined, created())

  it('accepts only rounds 1 and 2', () => {
    expect(() => reduce(base(), requested({ round: 3 }))).toThrow(/round must be 1 or 2/)
    expect(() => reduce(base(), requested({ round: 0 }))).toThrow(/round must be 1 or 2/)
  })

  it('refuses a second request while one review is already pending', () => {
    const pending = reduce(base(), requested())
    expect(() => reduce(pending, envelope('plan-review/requested', 3, {
      workOrderId: order().id, candidateDigest: 'e'.repeat(64) as any, round: 2, route,
      requestedAt: '2026-11-16T00:00:09Z',
    }))).toThrow(/already pending/)
  })

  it('binds a completed record to the payload assessment, candidate digest and full route', () => {
    const pending = reduce(base(), requested())
    const completed = (patch: Record<string, unknown> = {}, assessmentPatch: Record<string, unknown> = {}) => {
      const rec = record('concerns', 1, patch)
      return envelope('plan-review/completed', 3, {
        workOrderId: order().id, candidateDigest: digest, round: 1,
        assessment: { ...assessment('concerns', 1), ...assessmentPatch }, record: rec,
      })
    }
    expect(reduce(pending, completed()).planReviews).toHaveLength(1)
    // A record whose findings differ from the payload would hide findings the Lead must answer.
    expect(() => reduce(pending, completed({ assessment: assessment('concerns', 2) }))).toThrow(/recorded assessment/)
    // The route is cost attribution: a different effort bills one model and claims another.
    expect(() => reduce(pending, completed({ route: { provider: 'test-p', model: 'foreman-m', reasoningEffort: 'high' } })))
      .toThrow(/route does not fully match/)
    expect(() => reduce(pending, completed({ round: 2 }))).toThrow(/inconsistent|does not match completed payload/)
    expect(() => reduce(pending, completed({ taskId: 'other' }))).toThrow(/inconsistent/)
    // An assessment about another candidate cannot be this candidate's review.
    expect(() => reduce(pending, completed({}, { candidateDigest: 'e'.repeat(64) }))).toThrow(/assessment does not match|candidateDigest does not match/)
  })

  it('resolves only a concerns review, exactly once, with one disposition per finding', () => {
    const concernsPending = reduce(base(), requested())
    const completed = reduce(concernsPending, envelope('plan-review/completed', 3, {
      workOrderId: order().id, candidateDigest: digest, round: 1, assessment: assessment('concerns', 2), record: record('concerns', 2),
    }))
    const resolved = (patch: Record<string, unknown> = {}) => envelope('plan-review/resolved', 4, {
      workOrderId: order().id, candidateDigest: digest, round: 1,
      dispositions: [{ findingId: 'f-0', action: 'overridden', reason: 'deliberate' }, { findingId: 'f-1', action: 'overridden', reason: 'deliberate' }],
      ...patch,
    })
    expect(reduce(completed, resolved()).planReviewResolutions).toHaveLength(1)
    expect(() => reduce(completed, resolved({ dispositions: [{ findingId: 'f-0', action: 'overridden', reason: 'x' }] })))
      .toThrow(/does not match findings count/)
    expect(() => reduce(completed, resolved({ dispositions: [{ findingId: 'f-0', action: 'overridden', reason: 'x' },
      { findingId: 'f-0', action: 'overridden', reason: 'y' }] }))).toThrow(/Duplicate disposition/)
    const once = reduce(completed, resolved())
    expect(() => reduce(once, envelope('plan-review/resolved', 5, {
      workOrderId: order().id, candidateDigest: digest, round: 1,
      dispositions: [{ findingId: 'f-0', action: 'overridden', reason: 'again' }, { findingId: 'f-1', action: 'overridden', reason: 'again' }],
    }))).toThrow(/already been resolved/)

    // A ready review asks nothing of the Lead, so it cannot carry an override.
    const readyPending = reduce(base(), requested())
    const ready = reduce(readyPending, envelope('plan-review/completed', 3, {
      workOrderId: order().id, candidateDigest: digest, round: 1, assessment: assessment('ready'), record: record('ready'),
    }))
    expect(() => reduce(ready, resolved({ dispositions: [] }))).toThrow(/not concerns|not a concerns/)
  })

  it('requires an accepted disposition to record a different revised digest', () => {
    const pending = reduce(base(), requested())
    const completed = reduce(pending, envelope('plan-review/completed', 3, {
      workOrderId: order().id, candidateDigest: digest, round: 1, assessment: assessment('concerns', 1), record: record('concerns', 1),
    }))
    const accepted = (patch: Record<string, unknown> = {}) => envelope('plan-review/resolved', 4, {
      workOrderId: order().id, candidateDigest: digest, round: 1,
      dispositions: [{ findingId: 'f-0', action: 'accepted', changeSummary: 'revised the checks' }], ...patch,
    })
    // Accepting without recording a revision would let a restarted gate treat any new
    // candidate as the approved one.
    expect(() => reduce(completed, accepted())).toThrow(/must record the revised candidate digest/)
    expect(() => reduce(completed, accepted({ revisedCandidateDigest: digest }))).toThrow(/must differ/)
    const revised = reduce(completed, accepted({ revisedCandidateDigest: 'e'.repeat(64) as any }))
    expect(revised.planReviewResolutions?.[0]?.revisedCandidateDigest).toBe('e'.repeat(64))
    // A revision with no accepted finding contradicts the dispositions.
    const overrides = reduce(base(), requested())
    const overriddenCompleted = reduce(overrides, envelope('plan-review/completed', 3, {
      workOrderId: order().id, candidateDigest: digest, round: 1, assessment: assessment('concerns', 1), record: record('concerns', 1),
    }))
    expect(() => reduce(overriddenCompleted, envelope('plan-review/resolved', 4, {
      workOrderId: order().id, candidateDigest: digest, round: 1,
      dispositions: [{ findingId: 'f-0', action: 'overridden', reason: 'deliberate' }],
      revisedCandidateDigest: 'e'.repeat(64) as any,
    }))).toThrow(/no accepted finding/)
  })
})
