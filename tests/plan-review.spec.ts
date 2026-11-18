import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { PlanReviewCandidate, PlanReviewCheckDefinition, PlanReviewRecord, RequirementCoverage, WorkOrder } from '../src/contracts.js'
import { OperationId, SessionId, SnapshotId, TaskId, WorkOrderId } from '../src/contracts.js'
import { assertValidPlanReviewCandidate, candidateDigest, collectForemanFindings, FOREMAN_MAX_FINDINGS, FOREMAN_SYSTEM_PROMPT, foremanAssessmentSchema, lintPlanReviewCandidate, parseForemanAssessment, planReviewGateDecision, semanticCandidateProjection } from '../src/plan-review.js'
import { NativePlanReviewService } from '../src/host/plan-review.js'
import { NativeAuxiliaryRequests } from '../src/host/native-auxiliary.js'
import type { SessionBinding } from '../src/host/bindings.js'

function makeCandidate(patch?: {
  order?: Partial<WorkOrder>
  brief?: string
  requirementCoverage?: RequirementCoverage[]
  checkDefinitions?: PlanReviewCandidate['checkDefinitions']
  userMessages?: readonly string[]
  evidenceSummary?: string
  assessmentSchema?: Readonly<Record<string, unknown>>
}): PlanReviewCandidate {
  const source = { sessionId: SessionId('lead-session'), eventSeq: 1, messageId: 'msg-1' }
  const order: WorkOrder = {
    schemaVersion: 1,
    mode: 'implement',
    taskId: TaskId('task-1'),
    id: WorkOrderId('order-1'),
    operationId: OperationId('op-1'),
    revision: 1,
    goal: 'Implement feature X',
    constraints: [
      { id: 'constraint-0', text: 'Do not break existing API', mandatory: true, provenance: 'inferred', source },
      { id: 'requirement-0', text: 'User wants feature X', mandatory: true, provenance: 'user', source },
      { id: 'requirement-1', text: 'User wants feature Y', mandatory: true, provenance: 'user', source },
    ],
    acceptance: [
      { id: 'check-x', description: 'Test feature X', mandatory: true, verificationKind: 'test' },
      { id: 'check-y', description: 'Test feature Y', mandatory: true, verificationKind: 'static-check' },
    ],
    allowedPaths: ['src/feature.ts', 'tests/feature.spec.ts'],
    forbiddenActions: ['Change unrelated paths'],
    baseSnapshot: SnapshotId('snap-1'),
    evidence: [],
    decisions: [{ text: 'Use module pattern', source }],
    uncertainties: ['Edge case with large input'],
    policy: {
      maxWorkerSteps: 20,
      maxReworkRounds: 3,
      maxCapabilityUpgrades: 0,
      commandMaxSeconds: 300,
    },
    ...patch?.order,
  }

  const checkDefinitions: readonly PlanReviewCheckDefinition[] = patch?.checkDefinitions ?? [
    { id: 'check-x', description: 'Test feature X', command: 'pnpm test tests/x.spec.ts', kind: 'test', parser: 'vitest', definitionPaths: ['tests/x.spec.ts'] },
    { id: 'check-y', description: 'Test feature Y', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
  ]

  const requirementCoverage: RequirementCoverage[] = patch?.requirementCoverage ?? [
    { requirementIndex: 0, implementationNotes: ['Implement feature X in src/feature.ts'], acceptanceIds: ['check-x'] },
    { requirementIndex: 1, implementationNotes: ['Implement feature Y in src/feature.ts'], acceptanceIds: ['check-y'] },
  ]

  order.requirementCoverage = requirementCoverage

  return {
    schemaVersion: 1,
    order,
    brief: patch?.brief ?? 'Stage 1: implement X and Y',
    requirementCoverage,
    checkDefinitions,
    ...(patch?.userMessages === undefined ? {} : { userMessages: patch.userMessages }),
    ...(patch?.evidenceSummary === undefined ? {} : { evidenceSummary: patch.evidenceSummary }),
    ...(patch?.assessmentSchema === undefined ? {} : { assessmentSchema: patch.assessmentSchema }),
  }
}

describe('candidateDigest calculation', () => {
  it('computes a stable deterministic digest for the same candidate', () => {
    const candidate1 = makeCandidate()
    const candidate2 = makeCandidate()
    const digest1 = candidateDigest(candidate1)
    const digest2 = candidateDigest(candidate2)
    expect(digest1).toBe(digest2)
    expect(digest1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('normalizes away order.candidateDigest so setting it does not alter the digest', () => {
    const candidate = makeCandidate()
    const rawDigest = candidateDigest(candidate)
    candidate.order.candidateDigest = rawDigest
    const digestAfterSetting = candidateDigest(candidate)
    expect(digestAfterSetting).toBe(rawDigest)
  })

  it('is invariant to random/ephemeral IDs (taskId, order.id, operationId, constraint IDs, source references, acceptance planId/planDigest)', () => {
    const candidate1 = makeCandidate()
    const digest1 = candidateDigest(candidate1)

    // Reconstruct candidate with completely different ephemeral IDs and source refs
    const candidate2 = makeCandidate({
      order: {
        id: WorkOrderId('order-random-999'),
        operationId: OperationId('op-random-888'),
        taskId: TaskId('task-random-777'),
        constraints: [
          { id: 'constraint-diff-1', text: 'Do not break existing API', mandatory: true, provenance: 'inferred', source: { sessionId: SessionId('other-s'), eventSeq: 42, messageId: 'other-m' } },
          { id: 'req-diff-2', text: 'User wants feature X', mandatory: true, provenance: 'user', source: { sessionId: SessionId('s-diff'), eventSeq: 100 } },
          { id: 'req-diff-3', text: 'User wants feature Y', mandatory: true, provenance: 'user', source: { sessionId: SessionId('s-diff-2'), eventSeq: 200 } },
        ],
        acceptance: [
          { id: 'check-x', description: 'Test feature X', mandatory: true, verificationKind: 'test', planId: 'p-1', planDigest: 'd-1' as any },
          { id: 'check-y', description: 'Test feature Y', mandatory: true, verificationKind: 'static-check', planId: 'p-2', planDigest: 'd-2' as any },
        ],
        decisions: [
          { text: 'Use module pattern', source: { sessionId: SessionId('diff-decision-s'), eventSeq: 999 } },
        ],
      },
    })
    const digest2 = candidateDigest(candidate2)
    expect(digest2).toBe(digest1)
  })

  it('changes candidateDigest when any check definition field changes', () => {
    const base = makeCandidate()
    const baseDigest = candidateDigest(base)

    // Command change
    expect(candidateDigest({
      ...base,
      checkDefinitions: [
        { ...base.checkDefinitions[0]!, command: 'pnpm test --bail' },
        base.checkDefinitions[1]!,
      ],
    })).not.toBe(baseDigest)

    // Parser change
    expect(candidateDigest({
      ...base,
      checkDefinitions: [
        { ...base.checkDefinitions[0]!, parser: 'jest' },
        base.checkDefinitions[1]!,
      ],
    })).not.toBe(baseDigest)

    // Kind change (and acceptance matching)
    expect(candidateDigest({
      ...base,
      order: {
        ...base.order,
        acceptance: [
          { id: 'check-x', description: 'Test feature X', mandatory: true, verificationKind: 'static-check' },
          base.order.acceptance[1]!,
        ],
      },
      checkDefinitions: [
        { ...base.checkDefinitions[0]!, kind: 'static-check' },
        base.checkDefinitions[1]!,
      ],
    })).not.toBe(baseDigest)

    // timeoutSeconds change
    expect(candidateDigest({
      ...base,
      checkDefinitions: [
        { ...base.checkDefinitions[0]!, timeoutSeconds: 60 },
        base.checkDefinitions[1]!,
      ],
    })).not.toBe(baseDigest)

    // baseline change
    expect(candidateDigest({
      ...base,
      checkDefinitions: [
        { ...base.checkDefinitions[0]!, baseline: 'no-new-failures' },
        base.checkDefinitions[1]!,
      ],
    })).not.toBe(baseDigest)

    // independent change
    expect(candidateDigest({
      ...base,
      checkDefinitions: [
        { ...base.checkDefinitions[0]!, independent: true },
        base.checkDefinitions[1]!,
      ],
    })).not.toBe(baseDigest)

    // allowedFailures change
    expect(candidateDigest({
      ...base,
      checkDefinitions: [
        { ...base.checkDefinitions[0]!, allowedFailures: ['fail-1'] },
        base.checkDefinitions[1]!,
      ],
    })).not.toBe(baseDigest)
  })

  it('produces a different digest when any candidate field changes', () => {
    const base = makeCandidate()
    const baseDigest = candidateDigest(base)

    // Brief change
    expect(candidateDigest({ ...base, brief: 'Different brief' })).not.toBe(baseDigest)

    // Goal change
    expect(candidateDigest({ ...base, order: { ...base.order, goal: 'Different goal' } })).not.toBe(baseDigest)

    // Allowed paths change
    expect(candidateDigest({ ...base, order: { ...base.order, allowedPaths: ['src/other.ts'] } })).not.toBe(baseDigest)

    // Acceptance change
    expect(candidateDigest({
      ...base,
      order: {
        ...base.order,
        acceptance: [{ id: 'check-z', description: 'Test Z', mandatory: true, verificationKind: 'test' }],
      },
      checkDefinitions: [{ id: 'check-z', description: 'Test Z', command: 'pnpm test tests/z.spec.ts', kind: 'test', parser: 'vitest', definitionPaths: [] }],
    })).not.toBe(baseDigest)

    // Coverage change
    expect(candidateDigest({
      ...base,
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Alternative note'], acceptanceIds: ['check-x'] },
        base.requirementCoverage[1]!,
      ],
    })).not.toBe(baseDigest)

    // Decisions change
    expect(candidateDigest({
      ...base,
      order: {
        ...base.order,
        decisions: [{ text: 'Different decision', source: base.order.decisions[0]!.source }],
      },
    })).not.toBe(baseDigest)

    // Uncertainties change
    expect(candidateDigest({
      ...base,
      order: {
        ...base.order,
        uncertainties: ['Different uncertainty'],
      },
    })).not.toBe(baseDigest)
  })
})

describe('lintPlanReviewCandidate', () => {
  it('accepts a fully valid candidate with matching digest', () => {
    const candidate = makeCandidate()
    candidate.order.candidateDigest = candidateDigest(candidate)
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues).toEqual([])
    expect(() => assertValidPlanReviewCandidate(candidate)).not.toThrow()
  })

  it('rejects candidate when requirement coverage is incomplete for implementation mode', () => {
    // 2 requirements, only 1 coverage item
    const candidate = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Note 0'], acceptanceIds: ['check-x'] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field === 'requirementCoverage' && i.message.includes('requires exactly 2'))).toBe(true)
  })

  it('rejects duplicate requirementIndex in coverage', () => {
    const candidate = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Note 0'], acceptanceIds: ['check-x'] },
        { requirementIndex: 0, implementationNotes: ['Note 0 again'], acceptanceIds: ['check-y'] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('requirementIndex') && i.message.includes('Duplicate coverage'))).toBe(true)
  })

  it('rejects out of bounds requirementIndex in coverage', () => {
    const candidate = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Note 0'], acceptanceIds: ['check-x'] },
        { requirementIndex: 99, implementationNotes: ['Note 99'], acceptanceIds: ['check-y'] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('requirementIndex') && i.message.includes('out of bounds'))).toBe(true)
  })

  it('rejects empty or whitespace-only implementationNotes', () => {
    const candidateEmpty = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: [], acceptanceIds: ['check-x'] },
        { requirementIndex: 1, implementationNotes: ['Note 1'], acceptanceIds: ['check-y'] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateEmpty).some(i => i.field.includes('implementationNotes'))).toBe(true)

    const candidateWhitespace = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['   ', '\t'], acceptanceIds: ['check-x'] },
        { requirementIndex: 1, implementationNotes: ['Note 1'], acceptanceIds: ['check-y'] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateWhitespace).some(i => i.field.includes('implementationNotes'))).toBe(true)
  })

  it('rejects empty acceptanceIds', () => {
    const candidate = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Note 0'], acceptanceIds: [] },
        { requirementIndex: 1, implementationNotes: ['Note 1'], acceptanceIds: ['check-y'] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('acceptanceIds'))).toBe(true)
  })

  it('rejects duplicate acceptanceIds in one coverage item', () => {
    const candidate = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Note 0'], acceptanceIds: ['check-x', 'check-x'] },
        { requirementIndex: 1, implementationNotes: ['Note 1'], acceptanceIds: ['check-y'] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('acceptanceIds') && i.message.includes('Duplicate acceptanceId'))).toBe(true)
  })

  it('rejects acceptanceIds referencing unknown check IDs', () => {
    const candidate = makeCandidate({
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Note 0'], acceptanceIds: ['check-nonexistent'] },
        { requirementIndex: 1, implementationNotes: ['Note 1'], acceptanceIds: ['check-y'] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('acceptanceIds') && i.message.includes('Unknown acceptanceId'))).toBe(true)
  })

  it('rejects mismatched checkDefinitions and order.acceptance', () => {
    const candidate = makeCandidate({
      checkDefinitions: [
        { id: 'check-x', description: 'Test feature X', command: 'pnpm test', kind: 'test', parser: 'vitest', definitionPaths: [] },
        { id: 'check-different-id', description: 'Different ID', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('checkDefinitions') && i.message.includes('does not match'))).toBe(true)
  })

  it('rejects empty decision text', () => {
    const source = { sessionId: SessionId('lead-session'), eventSeq: 1 }
    const candidate = makeCandidate({
      order: {
        decisions: [{ text: '   ', source }],
      },
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('order.decisions') && i.message.includes('non-empty'))).toBe(true)
  })

  it('rejects empty uncertainty text', () => {
    const candidate = makeCandidate({
      order: {
        uncertainties: [''],
      },
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field.includes('order.uncertainties') && i.message.includes('non-empty'))).toBe(true)
  })

  it('rejects mismatched order.candidateDigest', () => {
    const candidate = makeCandidate()
    candidate.order.candidateDigest = '0'.repeat(64) as any
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field === 'order.candidateDigest' && i.message.includes('mismatch'))).toBe(true)
  })

  it('permits empty requirementCoverage in implement mode when there are no user requirements', () => {
    const candidate = makeCandidate({
      order: {
        constraints: [
          { id: 'constraint-0', text: 'Inferred constraint', mandatory: true, provenance: 'inferred', source: { sessionId: SessionId('s'), eventSeq: 1 } },
        ],
      },
      requirementCoverage: [],
    })
    candidate.order.candidateDigest = candidateDigest(candidate)
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues).toEqual([])
  })

  it('rejects non-empty requirementCoverage in implement mode when there are no user requirements', () => {
    const candidate = makeCandidate({
      order: {
        constraints: [],
      },
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['Note'], acceptanceIds: ['check-x'] },
      ],
    })
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues.some(i => i.field === 'requirementCoverage' && i.message.includes('must have empty'))).toBe(true)
  })

  it('does not require coverage for non-implement mode (e.g. explore or text)', () => {
    const candidateExplore = makeCandidate({
      order: {
        mode: 'explore',
      },
      requirementCoverage: [],
    })
    candidateExplore.order.candidateDigest = candidateDigest(candidateExplore)
    expect(lintPlanReviewCandidate(candidateExplore)).toEqual([])

    const candidateText = makeCandidate({
      order: {
        mode: 'text',
      },
      requirementCoverage: [],
    })
    candidateText.order.candidateDigest = candidateDigest(candidateText)
    expect(lintPlanReviewCandidate(candidateText)).toEqual([])
  })

  it('validates PlanReviewCheckDefinition structure fields strictly', () => {
    // Empty command
    const candidateEmptyCommand = makeCandidate({
      checkDefinitions: [
        { id: 'check-x', description: 'Desc', command: '   ', kind: 'test', parser: 'vitest', definitionPaths: [] },
        { id: 'check-y', description: 'Desc', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateEmptyCommand).some(i => i.field.includes('command'))).toBe(true)

    // Empty parser
    const candidateEmptyParser = makeCandidate({
      checkDefinitions: [
        { id: 'check-x', description: 'Desc', command: 'pnpm test', kind: 'test', parser: '' as any, definitionPaths: [] },
        { id: 'check-y', description: 'Desc', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateEmptyParser).some(i => i.field.includes('parser'))).toBe(true)

    // Invalid timeoutSeconds (zero, negative, float)
    for (const invalidTimeout of [0, -10, 1.5]) {
      const candidateBadTimeout = makeCandidate({
        checkDefinitions: [
          { id: 'check-x', description: 'Desc', command: 'pnpm test', kind: 'test', parser: 'vitest', definitionPaths: [], timeoutSeconds: invalidTimeout },
          { id: 'check-y', description: 'Desc', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
        ],
      })
      expect(lintPlanReviewCandidate(candidateBadTimeout).some(i => i.field.includes('timeoutSeconds'))).toBe(true)
    }

    // Invalid baseline
    const candidateBadBaseline = makeCandidate({
      checkDefinitions: [
        { id: 'check-x', description: 'Desc', command: 'pnpm test', kind: 'test', parser: 'vitest', definitionPaths: [], baseline: 123 as any },
        { id: 'check-y', description: 'Desc', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateBadBaseline).some(i => i.field.includes('baseline'))).toBe(true)

    // Invalid independent
    const candidateBadIndep = makeCandidate({
      checkDefinitions: [
        { id: 'check-x', description: 'Desc', command: 'pnpm test', kind: 'test', parser: 'vitest', definitionPaths: [], independent: 'yes' as any },
        { id: 'check-y', description: 'Desc', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateBadIndep).some(i => i.field.includes('independent'))).toBe(true)

    // Invalid allowedFailures
    const candidateBadFailures = makeCandidate({
      checkDefinitions: [
        { id: 'check-x', description: 'Desc', command: 'pnpm test', kind: 'test', parser: 'vitest', definitionPaths: [], allowedFailures: [123] as any },
        { id: 'check-y', description: 'Desc', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateBadFailures).some(i => i.field.includes('allowedFailures'))).toBe(true)

    // Kind mismatch with acceptance
    const candidateKindMismatch = makeCandidate({
      checkDefinitions: [
        { id: 'check-x', description: 'Desc', command: 'pnpm test', kind: 'static-check', parser: 'vitest', definitionPaths: [] },
        { id: 'check-y', description: 'Desc', command: 'pnpm typecheck', kind: 'static-check', parser: 'exit-code', definitionPaths: [] },
      ],
    })
    expect(lintPlanReviewCandidate(candidateKindMismatch).some(i => i.field.includes('kind'))).toBe(true)
  })

  it('remains purely structural and never emits semantic concern or verdict (separation of concerns)', () => {
    // A candidate with semantically questionable or minimal text still passes Host structural lint
    const candidate = makeCandidate({
      brief: 'x',
      order: {
        goal: 'g',
        decisions: [{ text: 'd', source: { sessionId: SessionId('s'), eventSeq: 1 } }],
        uncertainties: ['u'],
      },
      requirementCoverage: [
        { requirementIndex: 0, implementationNotes: ['n1'], acceptanceIds: ['check-x'] },
        { requirementIndex: 1, implementationNotes: ['n2'], acceptanceIds: ['check-y'] },
      ],
    })
    candidate.order.candidateDigest = candidateDigest(candidate)
    const issues = lintPlanReviewCandidate(candidate)
    expect(issues).toEqual([])
    // Structural lint produces no concerns object or verdict
    expect(issues).not.toHaveProperty('verdict')
    expect(issues).not.toHaveProperty('concerns')
  })
})

describe('parseForemanAssessment strict structural schema validation', () => {
  const candidate = makeCandidate()
  const digest = candidateDigest(candidate)
  candidate.order.candidateDigest = digest

  const validReadyObj = () => ({
    schemaVersion: 1,
    candidateDigest: digest,
    verdict: 'ready',
    acceptanceAudit: {
      uncoveredRequirements: [],
      weakOracles: [],
      falseGreenScenarios: [],
    },
    decisionChallenges: {
      unsupportedDecisions: [],
      counterexamples: [],
      unresolvedCriticalAssumptions: [],
    },
    materialAmbiguities: [],
  })

  const validFinding = (id = 'f-1') => ({
    id,
    category: 'requirement-coverage',
    severity: 'blocking-concern',
    requirementIndexes: [0],
    decisionIndexes: [0],
    message: 'Requirement 0 is missing validation check',
    suggestedCorrection: 'Add a check covering requirement 0',
  })

  it('preserves the verbatim required FOREMAN_SYSTEM_PROMPT constant', () => {
    expect(FOREMAN_SYSTEM_PROMPT).toBe(
      'You are Foreman, an independent plan auditor. Review only the supplied candidate work order. Find semantic gaps that deterministic Host validation cannot decide: uncovered hard requirements, weak acceptance oracles, concrete false-green scenarios, unsupported decisions, counterexamples, unresolved critical assumptions, scope contradictions, and material ambiguities that would change observable behavior. A candidate whose mode is explore or text has no acceptance checks by construction: audit whether its goal, brief and constraints can still answer the question the user asked, and leave the acceptance-audit arrays empty instead of inventing checks it was never meant to have. Do not propose an alternative plan. Do not discuss formatting, permissions, path syntax, or other deterministic Host checks. Return exactly one JSON object matching ForemanAssessment schema version 1. Use verdict "ready" only when every finding array is empty; otherwise use "concerns". Report at most 8 findings across all finding arrays, most material first; when the plan has more problems than that, report the ones that would change observable behavior and omit the rest. Copy candidateDigest exactly. Do not use Markdown or include any text outside the JSON object.',
    )
  })

  // The cap keeps the assessment inside the request's output budget by construction: a
  // review that overruns that budget is discarded whole, and every policy then reads the
  // discard as approval. The prompt must therefore name the same number the constant does.
  it('bounds the findings the prompt asks for', () => {
    expect(FOREMAN_MAX_FINDINGS).toBe(8)
    expect(FOREMAN_SYSTEM_PROMPT).toContain(`Report at most ${FOREMAN_MAX_FINDINGS} findings`)
  })

  it('parses valid ready assessment when all finding lists are empty', () => {
    const outcome = parseForemanAssessment(JSON.stringify(validReadyObj()), candidate)
    expect(outcome.kind).toBe('ready')
    if (outcome.kind === 'ready') {
      expect(outcome.assessment.verdict).toBe('ready')
      expect(outcome.assessment.candidateDigest).toBe(digest)
    }
  })

  it('parses valid concerns assessment with at least one finding', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    obj.acceptanceAudit.uncoveredRequirements.push(validFinding('f-1') as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('concerns')
    if (outcome.kind === 'concerns') {
      expect(outcome.assessment.verdict).toBe('concerns')
      expect(outcome.assessment.acceptanceAudit.uncoveredRequirements).toHaveLength(1)
    }
  })

  it('rejects markdown code fences', () => {
    const wrapped = '```json\n' + JSON.stringify(validReadyObj()) + '\n```'
    const outcome = parseForemanAssessment(wrapped, candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Markdown code fences')
    }
  })

  it('rejects free prose surrounding JSON', () => {
    const withProse = 'Here is the plan review:\n' + JSON.stringify(validReadyObj())
    const outcome = parseForemanAssessment(withProse, candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('single JSON object without prose')
    }
  })

  it('rejects invalid non-JSON text', () => {
    const outcome = parseForemanAssessment('not valid json {', candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('without prose')
    }
  })

  it('rejects unknown root fields', () => {
    const obj = { ...validReadyObj(), extraField: 'unexpected' }
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Unknown root field in Foreman output: "extraField"')
    }
  })

  it('rejects unknown fields inside finding', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    obj.acceptanceAudit.uncoveredRequirements.push({ ...validFinding('f-1'), rogueField: 123 } as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Unknown field in finding: "rogueField"')
    }
  })

  it('rejects schemaVersion other than 1', () => {
    const obj = { ...validReadyObj(), schemaVersion: 2 }
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Invalid schemaVersion')
    }
  })

  it('rejects candidateDigest mismatch', () => {
    const obj = { ...validReadyObj(), candidateDigest: '0000000000000000000000000000000000000000000000000000000000000000' }
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('candidateDigest mismatch')
    }
  })

  it('rejects invalid verdict string', () => {
    const obj = { ...validReadyObj(), verdict: 'pass' }
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Invalid verdict: "pass"')
    }
  })

  it('rejects ready verdict when findings are present', () => {
    const obj = validReadyObj()
    obj.acceptanceAudit.uncoveredRequirements.push(validFinding('f-1') as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Verdict is "ready" but findings list contains 1 findings')
    }
  })

  it('rejects concerns verdict when findings are empty', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Verdict is "concerns" but no findings were provided')
    }
  })

  it('rejects invalid category enum', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    obj.acceptanceAudit.uncoveredRequirements.push({ ...validFinding('f-1'), category: 'made-up-category' } as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Invalid finding category: "made-up-category"')
    }
  })

  it('rejects invalid severity enum', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    obj.acceptanceAudit.uncoveredRequirements.push({ ...validFinding('f-1'), severity: 'critical' } as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Invalid finding severity: "critical"')
    }
  })

  it('rejects out-of-bounds requirementIndex', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    // Candidate has 2 user requirements (indexes 0 and 1)
    obj.acceptanceAudit.uncoveredRequirements.push({ ...validFinding('f-1'), requirementIndexes: [99] } as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('requirementIndex 99 is out of bounds')
    }
  })

  it('rejects out-of-bounds decisionIndex', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    // Candidate has 1 decision (index 0)
    obj.acceptanceAudit.uncoveredRequirements.push({ ...validFinding('f-1'), decisionIndexes: [5] } as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('decisionIndex 5 is out of bounds')
    }
  })

  it('rejects duplicate finding ids across different categories', () => {
    const obj = validReadyObj()
    obj.verdict = 'concerns'
    obj.acceptanceAudit.uncoveredRequirements.push(validFinding('shared-id') as never)
    obj.decisionChallenges.counterexamples.push(validFinding('shared-id') as never)
    const outcome = parseForemanAssessment(JSON.stringify(obj), candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Duplicate finding id: "shared-id"')
    }
  })
})

describe('NativePlanReviewService execution and fail-open behavior', () => {
  const candidate = makeCandidate()
  const digest = candidateDigest(candidate)
  candidate.order.candidateDigest = digest

  const validReadyObj = () => ({
    schemaVersion: 1,
    candidateDigest: digest,
    verdict: 'ready',
    acceptanceAudit: { uncoveredRequirements: [], weakOracles: [], falseGreenScenarios: [] },
    decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
    materialAmbiguities: [],
  })

  const validConcernsObj = () => ({
    schemaVersion: 1,
    candidateDigest: digest,
    verdict: 'concerns',
    acceptanceAudit: {
      uncoveredRequirements: [{
        id: 'gap-1',
        category: 'requirement-coverage',
        severity: 'blocking-concern',
        requirementIndexes: [0],
        decisionIndexes: [0],
        message: 'Requirement 0 uncovered',
        suggestedCorrection: 'Add check',
      }],
      weakOracles: [],
      falseGreenScenarios: [],
    },
    decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
    materialAmbiguities: [],
  })

  function makeService(
    streamFn: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
    foremanConfig?: { route: { provider: string; model: string; reasoningEffort?: string }; maxOutputTokens: number; timeoutMs: number },
  ) {
    const ctx = {
      llm: {
        stream: (opts: GenerateOptions) => streamFn(opts),
      },
    } as unknown as Context
    const agent = { id: 'agent-1' } as Agent
    const binding = {
      sessionId: 'agent-1',
      taskId: TaskId('task-1'),
      profile: {
        digest: 'profile-digest',
        foreman: foremanConfig ?? {
          route: { provider: 'test-p', model: 'foreman-m' },
          maxOutputTokens: 2048,
          timeoutMs: 10000,
        },
      },
    } as unknown as SessionBinding
    const auxiliary = new NativeAuxiliaryRequests()
    const service = new NativePlanReviewService(ctx, agent, binding, auxiliary)
    return { service, auxiliary, binding }
  }

  async function* mockTextStream(text: string, finishReason: string = 'stop'): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', text } as StreamChunk
    yield { type: 'finish', reason: { kind: finishReason } } as StreamChunk
  }

  async function* mockTextStreamStreaming(text: string, finishReason: string = 'stop'): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text } as StreamChunk
    yield { type: 'block-end', index: 0, block: { type: 'text', text } } as StreamChunk
    yield { type: 'finish', reason: { kind: finishReason } } as StreamChunk
  }

  const validReadyAssessment = () => ({
    schemaVersion: 1 as const,
    verdict: 'ready' as const,
    acceptanceAudit: { uncoveredRequirements: [], weakOracles: [], falseGreenScenarios: [] },
    decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
    materialAmbiguities: [],
  })

  it('fails open with unavailable when foreman profile is not configured', async () => {
    const { service, binding } = makeService(async function* () {}, undefined)
    delete (binding.profile as { foreman?: unknown }).foreman
    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('not configured')
    }
  })

  it('successfully returns ready outcome on valid ready JSON and tags auxiliary request', async () => {
    let capturedOptions: GenerateOptions | undefined
    const { service, auxiliary } = makeService(async function* (options) {
      capturedOptions = options
      yield* mockTextStream(JSON.stringify(validReadyObj()))
    })

    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('ready')
    expect(capturedOptions?.tools).toEqual([])
    expect(capturedOptions?.maxTokens).toBe(2048)
    expect(capturedOptions?.system).toBe(FOREMAN_SYSTEM_PROMPT)

    const tag = auxiliary.get(capturedOptions!)
    expect(tag).toBeDefined()
    expect(tag?.purpose).toBe('foreman')
    expect(tag?.taskId).toBe('task-1')
    expect(tag?.role).toBe('lead')
  })

  it('successfully returns concerns outcome on valid concerns JSON', async () => {
    const { service } = makeService(async function* () {
      yield* mockTextStream(JSON.stringify(validConcernsObj()))
    })

    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('concerns')
    if (outcome.kind === 'concerns') {
      expect(outcome.assessment.verdict).toBe('concerns')
      expect(outcome.assessment.acceptanceAudit.uncoveredRequirements).toHaveLength(1)
    }
  })

  it('fails open when model finishes with max-tokens', async () => {
    const { service } = makeService(async function* () {
      yield* mockTextStream('{"partial":', 'max-tokens')
    })

    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('exceeded maxOutputTokens reservation')
    }
  })

  it('fails open when model stream throws an error', async () => {
    const { service } = makeService(async function* () {
      throw new Error('Connection reset by peer')
    })

    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Connection reset by peer')
    }
  })

  it('fails open when model output contains markdown fences or prose', async () => {
    const { service } = makeService(async function* () {
      yield* mockTextStream('```json\n' + JSON.stringify(validReadyObj()) + '\n```')
    })

    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('Markdown code fences')
    }
  })

  it('fails open when external signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort('User cancelled')
    const { service } = makeService(async function* () {
      yield* mockTextStream(JSON.stringify(validReadyObj()))
    })

    const outcome = await service.review(candidate, controller.signal)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toContain('User cancelled')
    }
  })

describe('native plan review request and stream assembly', () => {
  const candidateWithSchema = () => makeCandidate({ assessmentSchema: foremanAssessmentSchema(),
    userMessages: ['Fix addition in calc.py.'], evidenceSummary: 'Exploration summary: calc.py subtracts' })

  it('sends the schema inside the candidate JSON with an empty tool table', async () => {
    let seen: GenerateOptions | undefined
    const { service } = makeService(async function* (options) {
      seen = options
      yield* mockTextStreamStreaming(JSON.stringify({ ...validReadyAssessment(), candidateDigest: candidateDigest(candidateWithSchema()) }))
    })
    const outcome = await service.review(candidateWithSchema())
    expect(outcome.kind).toBe('ready')
    expect(seen?.tools).toEqual([])
    expect(seen?.system).toBe(FOREMAN_SYSTEM_PROMPT)
    const text = String((seen!.messages[0] as unknown as { content: { type: string; text: string }[] }).content[0]!.text)
    const sent = JSON.parse(text)
    expect(sent.assessmentSchema).toEqual(foremanAssessmentSchema())
    expect(sent.userMessages).toEqual(['Fix addition in calc.py.'])
    expect(sent.evidenceSummary).toContain('calc.py subtracts')
  })

  it('joins multiple text blocks in index order without duplicating a streamed block', async () => {
    const digest = candidateDigest(candidate)
    const body = JSON.stringify({ ...validReadyAssessment(), candidateDigest: digest })
    // Three text blocks: deltas for each, interleaved, plus the assembled block-end copy. A
    // naive `text += delta; text += block.text` doubles every block; taking only the first
    // block loses blocks 1 and 2.
    const { service } = makeService(async function* () {
      yield* [
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text: body.slice(0, 40) },
        { type: 'block-start', index: 1, blockType: 'text' },
        { type: 'text-delta', index: 0, text: body.slice(40, 80) },
        { type: 'text-delta', index: 1, text: body.slice(80, 120) },
        { type: 'block-end', index: 0, block: { type: 'text', text: body.slice(0, 80) } },
        { type: 'text-delta', index: 1, text: body.slice(120) },
        { type: 'block-end', index: 1, block: { type: 'text', text: body.slice(80) } },
        { type: 'finish', reason: { kind: 'stop' } },
      ] as StreamChunk[]
    })
    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('ready')
  })

  it('fills a block that streamed no deltas from its block-end copy', async () => {
    const body = JSON.stringify({ ...validReadyAssessment(), candidateDigest: candidateDigest(candidate) })
    const { service } = makeService(async function* () {
      yield* [
        { type: 'text-delta', index: 0, text: body.slice(0, 30) },
        { type: 'block-end', index: 0, block: { type: 'text', text: body.slice(0, 30) } },
        { type: 'block-end', index: 1, block: { type: 'text', text: body.slice(30) } },
        { type: 'finish', reason: { kind: 'stop' } },
      ] as StreamChunk[]
    })
    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('ready')
  })

  it('fails open when the route errors or the caller aborts mid-stream', async () => {
    const failing = makeService(async function* () {
      yield { type: 'text-delta', index: 0, text: '{"schemaVersion":1' } as StreamChunk
      throw new Error('route exploded')
    })
    expect((await failing.service.review(candidate)).kind).toBe('unavailable')

    const controller = new AbortController()
    const slow = makeService(async function* () {
      yield { type: 'text-delta', index: 0, text: '{"schemaVersion":1' } as StreamChunk
      controller.abort('cancelled by caller')
    })
    const outcome = await slow.service.review(candidate, controller.signal)
    expect(outcome.kind).toBe('unavailable')
  })
})
})

describe('plan review candidate composition and assessment schema', () => {
  it('includes user messages and exploration evidence in the semantic digest', () => {
    const base = makeCandidate()
    const withContext = makeCandidate({ userMessages: ['Fix addition in calc.py.'],
      evidenceSummary: 'Exploration summary: calc.py subtracts\n- calc.py:1-2' })
    expect(candidateDigest(withContext)).not.toBe(candidateDigest(base))
    // Each new input is independently significant: a plan that answers different words is a
    // different plan, and evidence the Lead collected changes what may be treated as known.
    expect(candidateDigest(makeCandidate({ userMessages: ['Fix addition in calc.py.'] }))).not.toBe(candidateDigest(base))
    expect(candidateDigest(makeCandidate({ evidenceSummary: 'anything' }))).not.toBe(candidateDigest(base))
    // Deterministic for equal input.
    expect(candidateDigest(withContext)).toBe(candidateDigest(makeCandidate({ userMessages: ['Fix addition in calc.py.'],
      evidenceSummary: 'Exploration summary: calc.py subtracts\n- calc.py:1-2' })))
  })

  it('keeps the assessment schema out of the semantic digest', () => {
    // The schema is a derived description of the output contract, not a Lead decision; if it
    // moved the digest, every plugin upgrade would look like the Lead changed the plan.
    const base = makeCandidate()
    expect(candidateDigest(makeCandidate({ assessmentSchema: foremanAssessmentSchema() }))).toBe(candidateDigest(base))
  })

  it('accepts a candidate without the optional context fields, for records written earlier', () => {
    const candidate = makeCandidate()
    expect(candidate.userMessages).toBeUndefined()
    expect(lintPlanReviewCandidate(candidate)).toEqual([])
  })

  it('lints malformed optional context fields instead of ignoring them', () => {
    const messages = lintPlanReviewCandidate(makeCandidate({ userMessages: ['ok', '  '] as string[] }))
    expect(messages.map(issue => issue.field)).toContain('userMessages[1]')
    const summary = lintPlanReviewCandidate(makeCandidate({ evidenceSummary: 42 as unknown as string }))
    expect(summary.map(issue => issue.field)).toContain('evidenceSummary')
  })

  it('declares exactly the plan 7.2 shape with additionalProperties false at every level', () => {
    const schema = foremanAssessmentSchema() as {
      additionalProperties: boolean
      required: string[]
      properties: Record<string, any>
    }
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['schemaVersion', 'candidateDigest', 'verdict', 'acceptanceAudit', 'decisionChallenges', 'materialAmbiguities'])
    expect(Object.keys(schema.properties).sort()).toEqual(
      ['acceptanceAudit', 'candidateDigest', 'decisionChallenges', 'materialAmbiguities', 'schemaVersion', 'verdict'])
    expect(schema.properties.verdict.enum).toEqual(['ready', 'concerns'])
    expect(schema.properties.schemaVersion.enum).toEqual([1])

    const audit = schema.properties.acceptanceAudit
    expect(audit.additionalProperties).toBe(false)
    expect(audit.required).toEqual(['uncoveredRequirements', 'weakOracles', 'falseGreenScenarios'])

    const challenges = schema.properties.decisionChallenges
    expect(challenges.additionalProperties).toBe(false)
    expect(challenges.required).toEqual(['unsupportedDecisions', 'counterexamples', 'unresolvedCriticalAssumptions'])

    const finding = audit.properties.uncoveredRequirements.items
    expect(finding.additionalProperties).toBe(false)
    expect(finding.required).toEqual(['id', 'category', 'severity', 'requirementIndexes', 'decisionIndexes', 'message', 'suggestedCorrection'])
    expect(finding.properties.category.enum).toEqual(['requirement-coverage', 'acceptance-gap', 'decision-counterexample',
      'unresolved-assumption', 'scope-contradiction', 'material-ambiguity'])
    expect(finding.properties.severity.enum).toEqual(['warning', 'blocking-concern'])
    expect(finding.properties.requirementIndexes).toMatchObject({ type: 'array', items: { type: 'integer' } })
    expect(finding.properties.decisionIndexes).toMatchObject({ type: 'array', items: { type: 'integer' } })
    expect(finding.properties.message.type).toBe('string')
    expect(finding.properties.suggestedCorrection.type).toBe('string')
  })

})

describe('plan review gate decision', () => {
  const digest = (char: string) => char.repeat(64) as never
  const review = (overrides: Partial<PlanReviewRecord> & { candidateDigest?: never } = {}, at = digest('a')): PlanReviewRecord => ({
    schemaVersion: 1, taskId: 't' as never, workOrderId: 'wo' as never, candidateDigest: at, round: 1,
    route: { provider: 'p', model: 'm' }, requestedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:01Z',
    outcome: 'assessment', assessment: readyAssessment(at as unknown as string), durationMs: 1000, ...overrides,
  } as PlanReviewRecord)
  const readyAssessment = (at: string) => ({
    schemaVersion: 1 as const, candidateDigest: at, verdict: 'ready' as const,
    acceptanceAudit: { uncoveredRequirements: [], weakOracles: [], falseGreenScenarios: [] },
    decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
    materialAmbiguities: [],
  })
  const concernsAssessment = (at: string, findings = 2) => ({
    ...readyAssessment(at), verdict: 'concerns' as const,
    materialAmbiguities: Array.from({ length: findings }, (_, i) => ({ id: `f-${i}`, category: 'material-ambiguity' as const,
      severity: 'warning' as const, requirementIndexes: [], decisionIndexes: [], message: `gap ${i}`, suggestedCorrection: 'close it' })),
  })
  const dispositions = (action: 'accepted' | 'overridden', count = 2) => Array.from({ length: count }, (_, i) => action === 'accepted'
    ? { findingId: `f-${i}`, action } as const : { findingId: `f-${i}`, action } as const)
    .map(item => item.action === 'accepted'
      ? { findingId: item.findingId, action: 'accepted' as const, changeSummary: 'revised' }
      : { findingId: item.findingId, action: 'overridden' as const, reason: 'deliberate' })

  it('approves a reviewed candidate that is ready, and an unreachable reviewer fails open', () => {
    expect(planReviewGateDecision({ candidateDigest: digest('a'), reviews: [review()], resolutions: [] }))
      .toMatchObject({ approved: true })
    expect(planReviewGateDecision({ candidateDigest: digest('a'),
      reviews: [review({ outcome: 'unavailable', assessment: undefined, unavailableReason: 'timeout' })], resolutions: [] }))
      .toMatchObject({ approved: true })
  })

  it('does not treat a different digest as approved by an earlier review', () => {
    const decision = planReviewGateDecision({ candidateDigest: digest('b'), reviews: [review()], resolutions: [] })
    expect(decision).toMatchObject({ approved: false, round: 1, reason: 'unreviewed' })
  })

  it('dispatches a round-1 all-override only when the override changed nothing', () => {
    const reviews = [review({ assessment: concernsAssessment(digest('a')) as never })]
    expect(planReviewGateDecision({ candidateDigest: digest('a'), reviews,
      resolutions: [{ candidateDigest: digest('a'), round: 1, dispositions: dispositions('overridden') }] }))
      .toMatchObject({ approved: true })
    // Same candidate, but the Lead recorded a revision: the revision still owes round 2, so
    // the reviewed digest is not approved.
    expect(planReviewGateDecision({ candidateDigest: digest('a'), reviews,
      resolutions: [{ candidateDigest: digest('a'), round: 1, dispositions: dispositions('overridden'), revisedCandidateDigest: digest('b') }] }))
      .toMatchObject({ approved: false })
    // A mix that accepted anything is a claim of change, never an approval.
    expect(planReviewGateDecision({ candidateDigest: digest('a'), reviews,
      resolutions: [{ candidateDigest: digest('a'), round: 1, dispositions: dispositions('accepted') }] }))
      .toMatchObject({ approved: false })
  })

  it('continues round 2 after an interrupted request instead of repeating round 1', () => {
    const decision = planReviewGateDecision({ candidateDigest: digest('b'),
      reviews: [review({ assessment: concernsAssessment(digest('a')) as never })],
      resolutions: [{ candidateDigest: digest('a'), round: 1, dispositions: dispositions('accepted'), revisedCandidateDigest: digest('b') }] })
    expect(decision).toEqual({ approved: false, round: 2, reason: 'interrupted-round-2' })
  })

  it('lets a round-2 review close by overriding everything, and not before', () => {
    const reviews = [review({ round: 2, assessment: concernsAssessment(digest('a')) as never })]
    expect(planReviewGateDecision({ candidateDigest: digest('a'), reviews, resolutions: [] }))
      .toMatchObject({ approved: false })
    expect(planReviewGateDecision({ candidateDigest: digest('a'), reviews,
      resolutions: [{ candidateDigest: digest('a'), round: 2, dispositions: dispositions('overridden') }] }))
      .toMatchObject({ approved: true })
  })
})

describe('foreman review budgets: a stall is not the same answer as a slow reviewer', () => {
  const candidate = makeCandidate()
  candidate.order.candidateDigest = candidateDigest(candidate)
  const readyBody = JSON.stringify({
    schemaVersion: 1,
    candidateDigest: candidate.order.candidateDigest,
    verdict: 'ready',
    acceptanceAudit: { uncoveredRequirements: [], weakOracles: [], falseGreenScenarios: [] },
    decisionChallenges: { unsupportedDecisions: [], counterexamples: [], unresolvedCriticalAssumptions: [] },
    materialAmbiguities: [],
  })

  function serviceFor(
    streamFn: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
    foreman: { route: { provider: string; model: string; reasoningEffort?: string }; maxOutputTokens: number; timeoutMs: number },
  ) {
    const ctx = { llm: { stream: (opts: GenerateOptions) => streamFn(opts) } } as unknown as Context
    const binding = {
      sessionId: 'agent-1',
      taskId: TaskId('task-1'),
      profile: { digest: 'profile-digest', foreman },
    } as unknown as SessionBinding
    return new NativePlanReviewService(ctx, { id: 'agent-1' } as Agent, binding, new NativeAuxiliaryRequests())
  }

  // The observed failure: the route produced no chunk at all and the call was ended by one
  // flat `TimeoutError` after the whole budget, which reads as approval. A stall must be
  // reported as a stall — the remedy is a different route — and it must not be confused with
  // a reviewer that was still answering when its total budget ran out.
  it('reports a route that never answered as a stall, and names the route', async () => {
    const service = serviceFor(
      async function* () { await new Promise(() => { /* never answers */ }) },
      { route: { provider: 'gz', model: 'slow-flash', reasoningEffort: 'high' }, maxOutputTokens: 8192, timeoutMs: 4_000 },
    )
    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind !== 'unavailable') return
    expect(outcome.reason).toContain('gz/slow-flash')
    expect(outcome.reason).toContain('never started answering')
    // Both attempts are accounted for: silence is the one case worth retrying.
    expect(outcome.reason).toContain('two attempts')
  }, 20_000)

  it('does not retry once the route has started answering', async () => {
    let calls = 0
    const service = serviceFor(
      async function* () {
        calls += 1
        yield { type: 'text-delta', index: 0, text: readyBody.slice(0, 10) } as StreamChunk
        await new Promise(() => { /* stalls after the first chunk */ })
      },
      { route: { provider: 'gz', model: 'chatty', reasoningEffort: 'high' }, maxOutputTokens: 8192, timeoutMs: 4_000 },
    )
    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('unavailable')
    // One call: a partial answer is not a stall, and repeating it would double the wait.
    expect(calls).toBe(1)
  }, 20_000)

  it('keeps a slow but responsive review inside the total budget', async () => {
    const service = serviceFor(
      async function* () {
        // Each chunk arrives well after the no-progress budget would have fired had it not
        // been cleared by the first one.
        for (const piece of [readyBody.slice(0, 20), readyBody.slice(20)]) {
          await new Promise(resolve => setTimeout(resolve, 30))
          yield { type: 'text-delta', index: 0, text: piece } as StreamChunk
        }
        yield { type: 'finish', reason: { kind: 'stop' } } as StreamChunk
      },
      { route: { provider: 'gz', model: 'steady' }, maxOutputTokens: 8192, timeoutMs: 30_000 },
    )
    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('ready')
  }, 20_000)

  it('says the total budget was spent while streaming, not that the route was silent', async () => {
    const service = serviceFor(
      async function* () {
        yield { type: 'text-delta', index: 0, text: '{"schemaVersion":1' } as StreamChunk
        await new Promise(resolve => setTimeout(resolve, 200))
      },
      { route: { provider: 'gz', model: 'crawler' }, maxOutputTokens: 8192, timeoutMs: 150 },
    )
    const outcome = await service.review(candidate)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind !== 'unavailable') return
    expect(outcome.reason).toContain('150ms')
    expect(outcome.reason).toContain('while still streaming')
  }, 20_000)

  it('keeps a caller cancellation out of the retry path', async () => {
    const controller = new AbortController()
    let calls = 0
    const service = serviceFor(
      async function* () {
        calls += 1
        controller.abort('User cancelled')
        await new Promise(() => { /* ends on the signal */ })
      },
      { route: { provider: 'gz', model: 'any' }, maxOutputTokens: 8192, timeoutMs: 4_000 },
    )
    const outcome = await service.review(candidate, controller.signal)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind !== 'unavailable') return
    expect(outcome.reason).toContain('User cancelled')
    expect(calls).toBe(1)
  }, 20_000)
})
