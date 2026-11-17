import type {
  ArtifactId,
  AuthorityAction,
  Constraint,
  Digest,
  ForemanAssessment,
  ForemanDisposition,
  ForemanFinding,
  PlanReviewCandidate,
  PlanReviewCheckDefinition,
  PlanReviewRecord,
  RequirementCoverage,
  ResourcePolicy,
  SnapshotId,
  WorkOrder,
} from './contracts.js'
import { digestOf } from './digest.js'

export interface PlanReviewLintIssue {
  readonly field: string
  readonly message: string
}

export interface SemanticCandidateProjection {
  schemaVersion: 1
  brief: string
  mode: WorkOrder['mode']
  goal: string
  constraints: readonly { text: string; provenance: Constraint['provenance']; mandatory: boolean }[]
  allowedPaths: readonly string[]
  forbiddenActions: readonly string[]
  authority?: readonly AuthorityAction[]
  preserveRuntime?: true
  decisions: readonly { text: string }[]
  uncertainties: readonly string[]
  policy: ResourcePolicy
  requirementCoverage: readonly RequirementCoverage[]
  baseSnapshot: SnapshotId
  evidence: readonly { id: ArtifactId; digest: Digest }[]
  checkDefinitions: readonly PlanReviewCheckDefinition[]
  /** The user's own words, when the candidate carries them; part of the semantic digest. */
  userMessages?: readonly string[]
  /** Collected exploration evidence, when the candidate carries it; part of the digest. */
  evidenceSummary?: string
}

/**
 * Computes semantic candidate projection, stripping ephemeral random IDs
 * (order.id, order.operationId, order.taskId, acceptance[].planId/planDigest,
 * constraint ids, SourceRefs) while preserving the full semantic specification.
 */
export function semanticCandidateProjection(candidate: PlanReviewCandidate): SemanticCandidateProjection {
  const { order, brief, requirementCoverage, checkDefinitions } = candidate
  return {
    schemaVersion: 1,
    brief,
    mode: order.mode,
    goal: order.goal,
    constraints: (order.constraints ?? []).map(c => ({
      text: c.text,
      provenance: c.provenance,
      mandatory: c.mandatory,
    })),
    allowedPaths: order.allowedPaths ?? [],
    forbiddenActions: order.forbiddenActions ?? [],
    ...(order.authority && order.authority.length > 0 ? { authority: order.authority } : {}),
    ...(order.preserveRuntime ? { preserveRuntime: true as const } : {}),
    decisions: (order.decisions ?? []).map(d => ({ text: d.text })),
    uncertainties: order.uncertainties ?? [],
    policy: order.policy,
    requirementCoverage: requirementCoverage ?? [],
    baseSnapshot: order.baseSnapshot,
    evidence: (order.evidence ?? []).map(e => ({ id: e.id, digest: e.digest })),
    ...(candidate.userMessages !== undefined ? { userMessages: [...candidate.userMessages] } : {}),
    ...(candidate.evidenceSummary !== undefined ? { evidenceSummary: candidate.evidenceSummary } : {}),
    checkDefinitions: (checkDefinitions ?? []).map(def => ({
      id: def.id,
      description: def.description,
      command: def.command,
      kind: def.kind,
      parser: def.parser,
      definitionPaths: def.definitionPaths ?? [],
      ...(def.timeoutSeconds !== undefined ? { timeoutSeconds: def.timeoutSeconds } : {}),
      ...(def.baseline !== undefined ? { baseline: def.baseline } : {}),
      ...(def.independent !== undefined ? { independent: def.independent } : {}),
      ...(def.allowedFailures !== undefined ? { allowedFailures: def.allowedFailures } : {}),
    })),
  }
}

/**
 * Compute stable candidate digest by hashing its semantic projection.
 */
export function candidateDigest(candidate: PlanReviewCandidate): Digest {
  return digestOf(semanticCandidateProjection(candidate))
}

export type PlanReviewRiskReason =
  | 'user-requirements-count'
  | 'multiple-allowed-paths'
  | 'authority-granted'
  | 'empty-acceptance'
  | 'unresolved-uncertainties'

export interface PlanReviewRiskEvaluation {
  triggered: boolean
  reasons: readonly PlanReviewRiskReason[]
}

/**
 * Pure deterministic risk assessment on a candidate work order.
 */
export function planReviewRisk(candidate: PlanReviewCandidate): PlanReviewRiskEvaluation {
  const reasons: PlanReviewRiskReason[] = []
  const order = candidate.order
  const userRequirements = (order.constraints ?? []).filter(c => c && c.provenance === 'user')
  if (userRequirements.length > 1) {
    reasons.push('user-requirements-count')
  }
  if ((order.allowedPaths ?? []).length > 1) {
    reasons.push('multiple-allowed-paths')
  }
  if (order.authority && order.authority.length > 0) {
    reasons.push('authority-granted')
  }
  const checkCount = (order.acceptance ?? []).length
  if (order.mode === 'implement' && checkCount === 0) {
    reasons.push('empty-acceptance')
  }
  if ((order.uncertainties ?? []).length > 0) {
    reasons.push('unresolved-uncertainties')
  }
  return {
    triggered: reasons.length > 0,
    reasons,
  }
}

/**
 * Collect all findings across all 7 sections of ForemanAssessment.
 */
export function collectForemanFindings(assessment: ForemanAssessment): readonly ForemanFinding[] {
  return [
    ...(assessment.acceptanceAudit?.uncoveredRequirements ?? []),
    ...(assessment.acceptanceAudit?.weakOracles ?? []),
    ...(assessment.acceptanceAudit?.falseGreenScenarios ?? []),
    ...(assessment.decisionChallenges?.unsupportedDecisions ?? []),
    ...(assessment.decisionChallenges?.counterexamples ?? []),
    ...(assessment.decisionChallenges?.unresolvedCriticalAssumptions ?? []),
    ...(assessment.materialAmbiguities ?? []),
  ]
}

/**
 * Host lint performs deterministic structural validation on a candidate
 * before any model review or Worker dispatch.
 */
export const VALID_CHECK_PARSERS = [
  'unittest',
  'pytest',
  'vitest',
  'jest',
  'mocha',
  'tap',
  'go',
  'cargo',
  'exit-code',
] as const

export const VALID_TEST_PARSERS = [
  'unittest',
  'pytest',
  'vitest',
  'jest',
  'mocha',
  'tap',
  'go',
  'cargo',
] as const

export function lintPlanReviewCandidate(candidate: PlanReviewCandidate): readonly PlanReviewLintIssue[] {
  const issues: PlanReviewLintIssue[] = []

  if (!candidate || typeof candidate !== 'object') {
    return [{ field: 'candidate', message: 'Candidate must be an object' }]
  }

  const validCandidateKeys = new Set(['schemaVersion', 'order', 'brief', 'requirementCoverage', 'checkDefinitions',
    'userMessages', 'evidenceSummary', 'assessmentSchema'])
  for (const key of Object.keys(candidate)) {
    if (!validCandidateKeys.has(key)) {
      issues.push({ field: key, message: `Unknown property "${key}" in plan review candidate` })
    }
  }

  if (candidate.schemaVersion !== 1) {
    issues.push({ field: 'schemaVersion', message: 'schemaVersion must be 1' })
  }

  if (typeof candidate.brief !== 'string') {
    issues.push({ field: 'brief', message: 'Brief must be a string' })
  }

  if (candidate.userMessages !== undefined) {
    if (!Array.isArray(candidate.userMessages)) {
      issues.push({ field: 'userMessages', message: 'userMessages must be an array of strings' })
    } else {
      for (let i = 0; i < candidate.userMessages.length; i++) {
        const text = candidate.userMessages[i]
        if (typeof text !== 'string' || !text.trim()) {
          issues.push({ field: `userMessages[${i}]`, message: 'Each user message must be a non-empty string' })
        }
      }
    }
  }

  if (candidate.evidenceSummary !== undefined && typeof candidate.evidenceSummary !== 'string') {
    issues.push({ field: 'evidenceSummary', message: 'evidenceSummary must be a string' })
  }

  const order = candidate.order
  if (!order || typeof order !== 'object') {
    issues.push({ field: 'order', message: 'Order must be defined' })
    return issues
  }

  // 1. Acceptance & CheckDefinitions ID, Kind, Parser, Baseline and Structure alignment
  const orderAcceptance = Array.isArray(order.acceptance) ? order.acceptance : []
  const checkDefs = Array.isArray(candidate.checkDefinitions) ? candidate.checkDefinitions : []

  if (orderAcceptance.length !== checkDefs.length) {
    issues.push({
      field: 'checkDefinitions',
      message: `checkDefinitions count (${checkDefs.length}) does not match order.acceptance count (${orderAcceptance.length})`,
    })
  } else {
    const validCheckKeys = new Set([
      'id',
      'description',
      'command',
      'kind',
      'parser',
      'definitionPaths',
      'timeoutSeconds',
      'baseline',
      'independent',
      'allowedFailures',
    ])

    for (let i = 0; i < orderAcceptance.length; i++) {
      const acc = orderAcceptance[i]!
      const def = checkDefs[i]!
      if (!def || typeof def !== 'object') {
        issues.push({ field: `checkDefinitions[${i}]`, message: 'Check definition must be an object' })
        continue
      }
      for (const key of Object.keys(def)) {
        if (!validCheckKeys.has(key)) {
          issues.push({ field: `checkDefinitions[${i}].${key}`, message: `Unknown property "${key}" in check definition` })
        }
      }
      if (typeof def.id !== 'string' || !def.id.trim()) {
        issues.push({ field: `checkDefinitions[${i}].id`, message: 'Check definition id must be a non-empty string' })
      } else if (acc.id !== def.id) {
        issues.push({
          field: `checkDefinitions[${i}].id`,
          message: `Check definition id "${def.id}" does not match acceptance id "${acc.id}" at index ${i}`,
        })
      }
      if (typeof def.description !== 'string') {
        issues.push({ field: `checkDefinitions[${i}].description`, message: 'Check definition description must be a string' })
      }
      if (typeof def.command !== 'string' || !def.command.trim()) {
        issues.push({ field: `checkDefinitions[${i}].command`, message: 'Check definition command must be a non-empty string' })
      }
      if (!Array.isArray(def.definitionPaths)) {
        issues.push({ field: `checkDefinitions[${i}].definitionPaths`, message: 'Check definition definitionPaths must be an array' })
      }
      if (def.kind !== 'test' && def.kind !== 'static-check') {
        issues.push({ field: `checkDefinitions[${i}].kind`, message: `Invalid check definition kind "${def.kind}": must be "test" or "static-check"` })
      } else if (acc.verificationKind !== def.kind) {
        issues.push({
          field: `checkDefinitions[${i}].kind`,
          message: `Check definition kind "${def.kind}" does not match acceptance verificationKind "${acc.verificationKind}" at index ${i}`,
        })
      }
      if (!VALID_CHECK_PARSERS.includes(def.parser as (typeof VALID_CHECK_PARSERS)[number])) {
        issues.push({ field: `checkDefinitions[${i}].parser`, message: `Invalid parser "${def.parser}": must be one of ${VALID_CHECK_PARSERS.join(', ')}` })
      } else if (def.kind === 'static-check' && def.parser !== 'exit-code') {
        issues.push({ field: `checkDefinitions[${i}].parser`, message: 'Static checks must use the "exit-code" parser' })
      } else if (def.kind === 'test' && def.parser === 'exit-code') {
        issues.push({ field: `checkDefinitions[${i}].parser`, message: 'Test checks must use a count parser, not "exit-code"' })
      }
      if (def.timeoutSeconds !== undefined && (!Number.isInteger(def.timeoutSeconds) || def.timeoutSeconds <= 0)) {
        issues.push({ field: `checkDefinitions[${i}].timeoutSeconds`, message: 'timeoutSeconds must be a positive integer' })
      }
      if (def.baseline !== undefined && def.baseline !== 'no-new-failures') {
        issues.push({ field: `checkDefinitions[${i}].baseline`, message: 'baseline must be "no-new-failures"' })
      }
      if (def.independent !== undefined && typeof def.independent !== 'boolean') {
        issues.push({ field: `checkDefinitions[${i}].independent`, message: 'independent must be a boolean' })
      }
      if (def.allowedFailures !== undefined && (!Array.isArray(def.allowedFailures) || def.allowedFailures.some((f: unknown) => typeof f !== 'string'))) {
        issues.push({ field: `checkDefinitions[${i}].allowedFailures`, message: 'allowedFailures must be an array of strings' })
      }
    }
  }

  const validAcceptanceIds = new Set(orderAcceptance.map(a => a.id))

  // 2. Decisions & Uncertainties non-empty check
  const decisions = Array.isArray(order.decisions) ? order.decisions : []
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i]
    if (!d || typeof d !== 'object' || typeof d.text !== 'string' || !d.text.trim()) {
      issues.push({ field: `order.decisions[${i}]`, message: 'Decision text must be a non-empty string' })
    }
  }

  const uncertainties = Array.isArray(order.uncertainties) ? order.uncertainties : []
  for (let i = 0; i < uncertainties.length; i++) {
    const u = uncertainties[i]
    if (typeof u !== 'string' || !u.trim()) {
      issues.push({ field: `order.uncertainties[${i}]`, message: 'Uncertainty must be a non-empty string' })
    }
  }

  // 3. Requirement coverage structure and bounds
  const constraints = Array.isArray(order.constraints) ? order.constraints : []
  const userRequirements = constraints.filter(c => c && c.provenance === 'user')
  const reqCount = userRequirements.length
  const coverage = Array.isArray(candidate.requirementCoverage) ? candidate.requirementCoverage : []

  if (order.mode === 'implement') {
    if (reqCount > 0) {
      if (coverage.length !== reqCount) {
        issues.push({
          field: 'requirementCoverage',
          message: `Implementation mode with ${reqCount} user requirements requires exactly ${reqCount} coverage entries, got ${coverage.length}`,
        })
      }
      const seenIndexes = new Set<number>()
      for (let i = 0; i < coverage.length; i++) {
        const item = coverage[i]!
        if (!item || typeof item !== 'object') {
          issues.push({ field: `requirementCoverage[${i}]`, message: 'Coverage entry must be an object' })
          continue
        }
        if (!Number.isInteger(item.requirementIndex) || item.requirementIndex < 0 || item.requirementIndex >= reqCount) {
          issues.push({
            field: `requirementCoverage[${i}].requirementIndex`,
            message: `Requirement index ${item.requirementIndex} is out of bounds (must be an integer in 0..${reqCount - 1})`,
          })
        } else if (seenIndexes.has(item.requirementIndex)) {
          issues.push({
            field: `requirementCoverage[${i}].requirementIndex`,
            message: `Duplicate coverage for requirement index ${item.requirementIndex}`,
          })
        } else {
          seenIndexes.add(item.requirementIndex)
        }
      }
    } else {
      if (coverage.length > 0) {
        issues.push({
          field: 'requirementCoverage',
          message: 'Implementation mode without user requirements must have empty requirementCoverage',
        })
      }
    }
  } else {
    // Non-implement mode: coverage is optional, but if present, validate index range
    const seenIndexes = new Set<number>()
    for (let i = 0; i < coverage.length; i++) {
      const item = coverage[i]!
      if (!item || typeof item !== 'object') {
        issues.push({ field: `requirementCoverage[${i}]`, message: 'Coverage entry must be an object' })
        continue
      }
      if (!Number.isInteger(item.requirementIndex) || item.requirementIndex < 0 || (reqCount > 0 && item.requirementIndex >= reqCount)) {
        issues.push({
          field: `requirementCoverage[${i}].requirementIndex`,
          message: `Requirement index ${item.requirementIndex} is invalid`,
        })
      } else if (seenIndexes.has(item.requirementIndex)) {
        issues.push({
          field: `requirementCoverage[${i}].requirementIndex`,
          message: `Duplicate coverage for requirement index ${item.requirementIndex}`,
        })
      } else {
        seenIndexes.add(item.requirementIndex)
      }
    }
  }

  // 4. implementationNotes & acceptanceIds per coverage entry
  const validCoverageKeys = new Set(['requirementIndex', 'implementationNotes', 'acceptanceIds'])
  for (let i = 0; i < coverage.length; i++) {
    const item = coverage[i]
    if (!item || typeof item !== 'object') continue

    for (const key of Object.keys(item)) {
      if (!validCoverageKeys.has(key)) {
        issues.push({ field: `requirementCoverage[${i}].${key}`, message: `Unknown property "${key}" in requirement coverage` })
      }
    }

    // implementationNotes: every item must be a non-empty string
    if (!Array.isArray(item.implementationNotes) || item.implementationNotes.length === 0) {
      issues.push({
        field: `requirementCoverage[${i}].implementationNotes`,
        message: 'implementationNotes must contain at least one note',
      })
    } else {
      for (let k = 0; k < item.implementationNotes.length; k++) {
        const note = item.implementationNotes[k]
        if (typeof note !== 'string' || !note.trim()) {
          issues.push({
            field: `requirementCoverage[${i}].implementationNotes[${k}]`,
            message: 'Each implementation note must be a non-empty string',
          })
        }
      }
    }

    // acceptanceIds: at least one, unique, and all reference candidate acceptance
    if (!Array.isArray(item.acceptanceIds) || item.acceptanceIds.length === 0) {
      issues.push({
        field: `requirementCoverage[${i}].acceptanceIds`,
        message: 'acceptanceIds must contain at least one check id',
      })
    } else {
      const seenIds = new Set<string>()
      for (let j = 0; j < item.acceptanceIds.length; j++) {
        const id = item.acceptanceIds[j]!
        if (typeof id !== 'string' || !id.trim()) {
          issues.push({
            field: `requirementCoverage[${i}].acceptanceIds[${j}]`,
            message: 'acceptanceId must be a non-empty string',
          })
        } else if (seenIds.has(id)) {
          issues.push({
            field: `requirementCoverage[${i}].acceptanceIds[${j}]`,
            message: `Duplicate acceptanceId "${id}" in requirementCoverage[${i}]`,
          })
        } else {
          seenIds.add(id)
          if (!validAcceptanceIds.has(id)) {
            issues.push({
              field: `requirementCoverage[${i}].acceptanceIds[${j}]`,
              message: `Unknown acceptanceId "${id}" not present in candidate acceptance checks`,
            })
          }
        }
      }
    }
  }

  // 5. Candidate digest matching check
  if (order.candidateDigest !== undefined) {
    const expected = candidateDigest(candidate)
    if (order.candidateDigest !== expected) {
      issues.push({
        field: 'order.candidateDigest',
        message: `Candidate digest mismatch: expected ${expected}, got ${order.candidateDigest}`,
      })
    }
  }

  return issues
}

export function assertValidPlanReviewCandidate(candidate: PlanReviewCandidate): void {
  const issues = lintPlanReviewCandidate(candidate)
  if (issues.length > 0) {
    throw new Error(`Plan review candidate rejected: ${issues.map(i => `${i.field}: ${i.message}`).join('; ')}`)
  }
}

export interface PlanReviewModule {
  review(candidate: PlanReviewCandidate, signal?: AbortSignal): Promise<PlanReviewOutcome>
}

export type PlanReviewOutcome =
  | { kind: 'ready'; assessment: ForemanAssessment }
  | { kind: 'concerns'; assessment: ForemanAssessment }
  | { kind: 'unavailable'; reason: string }

/**
 * The most findings one review may report.
 *
 * A finding carries a message and a suggested correction, so the assessment grows with the
 * count. The request also has a finite output budget ({@link ForemanConfig.maxOutputTokens}),
 * and a review that exceeds it is discarded whole rather than partly kept, which reads
 * downstream as approval. Bounding the count keeps the review inside the budget by
 * construction instead of relying on the cap to catch it.
 */
export const FOREMAN_MAX_FINDINGS = 8

export const FOREMAN_SYSTEM_PROMPT =
  'You are Foreman, an independent plan auditor. Review only the supplied candidate work order. Find semantic gaps that deterministic Host validation cannot decide: uncovered hard requirements, weak acceptance oracles, concrete false-green scenarios, unsupported decisions, counterexamples, unresolved critical assumptions, scope contradictions, and material ambiguities that would change observable behavior. Do not propose an alternative plan. Do not discuss formatting, permissions, path syntax, or other deterministic Host checks. Return exactly one JSON object matching ForemanAssessment schema version 1. Use verdict "ready" only when every finding array is empty; otherwise use "concerns". Report at most 8 findings across all finding arrays, most material first; when the plan has more problems than that, report the ones that would change observable behavior and omit the rest. Copy candidateDigest exactly. Do not use Markdown or include any text outside the JSON object.'

const ROOT_KEYS = new Set(['schemaVersion', 'candidateDigest', 'verdict', 'acceptanceAudit', 'decisionChallenges', 'materialAmbiguities'])
const ACCEPTANCE_AUDIT_KEYS = new Set(['uncoveredRequirements', 'weakOracles', 'falseGreenScenarios'])
const DECISION_CHALLENGES_KEYS = new Set(['unsupportedDecisions', 'counterexamples', 'unresolvedCriticalAssumptions'])
const FINDING_KEYS = new Set(['id', 'category', 'severity', 'requirementIndexes', 'decisionIndexes', 'message', 'suggestedCorrection'])
const VALID_CATEGORIES = new Set([
  'requirement-coverage',
  'acceptance-gap',
  'decision-counterexample',
  'unresolved-assumption',
  'scope-contradiction',
  'material-ambiguity',
])
const VALID_SEVERITIES = new Set(['warning', 'blocking-concern'])

export function parseForemanAssessment(rawText: string, candidate: PlanReviewCandidate): PlanReviewOutcome {
  if (typeof rawText !== 'string') {
    return { kind: 'unavailable', reason: 'Foreman output must be a string' }
  }

  // Reject markdown code fences explicitly
  if (rawText.includes('```')) {
    return { kind: 'unavailable', reason: 'Markdown code fences are not permitted in Foreman output' }
  }

  const trimmed = rawText.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { kind: 'unavailable', reason: 'Foreman output must be a single JSON object without prose' }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>
  } catch (error) {
    return { kind: 'unavailable', reason: `Invalid JSON in Foreman output: ${error instanceof Error ? error.message : String(error)}` }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'unavailable', reason: 'Foreman output must be a non-null object' }
  }

  // Check unknown root fields
  for (const key of Object.keys(parsed)) {
    if (!ROOT_KEYS.has(key)) {
      return { kind: 'unavailable', reason: `Unknown root field in Foreman output: "${key}"` }
    }
  }

  // schemaVersion
  if (parsed.schemaVersion !== 1) {
    return { kind: 'unavailable', reason: `Invalid schemaVersion: expected 1, got ${parsed.schemaVersion}` }
  }

  // candidateDigest
  const expectedDigest = candidate.order.candidateDigest ?? candidateDigest(candidate)
  if (parsed.candidateDigest !== expectedDigest) {
    return {
      kind: 'unavailable',
      reason: `candidateDigest mismatch: expected "${expectedDigest}", got "${parsed.candidateDigest}"`,
    }
  }

  // verdict
  if (parsed.verdict !== 'ready' && parsed.verdict !== 'concerns') {
    return { kind: 'unavailable', reason: `Invalid verdict: "${parsed.verdict}", must be "ready" or "concerns"` }
  }

  // acceptanceAudit
  const audit = parsed.acceptanceAudit as Record<string, unknown> | undefined
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    return { kind: 'unavailable', reason: 'acceptanceAudit must be an object' }
  }
  for (const key of Object.keys(audit)) {
    if (!ACCEPTANCE_AUDIT_KEYS.has(key)) {
      return { kind: 'unavailable', reason: `Unknown field in acceptanceAudit: "${key}"` }
    }
  }
  for (const key of ACCEPTANCE_AUDIT_KEYS) {
    if (!Array.isArray(audit[key])) {
      return { kind: 'unavailable', reason: `acceptanceAudit.${key} must be an array` }
    }
  }

  // decisionChallenges
  const challenges = parsed.decisionChallenges as Record<string, unknown> | undefined
  if (!challenges || typeof challenges !== 'object' || Array.isArray(challenges)) {
    return { kind: 'unavailable', reason: 'decisionChallenges must be an object' }
  }
  for (const key of Object.keys(challenges)) {
    if (!DECISION_CHALLENGES_KEYS.has(key)) {
      return { kind: 'unavailable', reason: `Unknown field in decisionChallenges: "${key}"` }
    }
  }
  for (const key of DECISION_CHALLENGES_KEYS) {
    if (!Array.isArray(challenges[key])) {
      return { kind: 'unavailable', reason: `decisionChallenges.${key} must be an array` }
    }
  }

  // materialAmbiguities
  if (!Array.isArray(parsed.materialAmbiguities)) {
    return { kind: 'unavailable', reason: 'materialAmbiguities must be an array' }
  }

  // Collect all findings and validate each
  const findingLists: unknown[][] = [
    audit.uncoveredRequirements as unknown[],
    audit.weakOracles as unknown[],
    audit.falseGreenScenarios as unknown[],
    challenges.unsupportedDecisions as unknown[],
    challenges.counterexamples as unknown[],
    challenges.unresolvedCriticalAssumptions as unknown[],
    parsed.materialAmbiguities,
  ]

  const userReqCount = (candidate.order.constraints ?? []).filter(c => c && c.provenance === 'user').length
  const decisionsCount = (candidate.order.decisions ?? []).length
  const seenIds = new Set<string>()

  for (const list of findingLists) {
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { kind: 'unavailable', reason: 'Each finding must be an object' }
      }
      const finding = item as Record<string, unknown>

      // Check unknown fields on finding
      for (const key of Object.keys(finding)) {
        if (!FINDING_KEYS.has(key)) {
          return { kind: 'unavailable', reason: `Unknown field in finding: "${key}"` }
        }
      }

      // id
      if (typeof finding.id !== 'string' || !finding.id.trim()) {
        return { kind: 'unavailable', reason: 'Finding id must be a non-empty string' }
      }
      if (seenIds.has(finding.id)) {
        return { kind: 'unavailable', reason: `Duplicate finding id: "${finding.id}"` }
      }
      seenIds.add(finding.id)

      // category
      if (typeof finding.category !== 'string' || !VALID_CATEGORIES.has(finding.category)) {
        return { kind: 'unavailable', reason: `Invalid finding category: "${String(finding.category)}"` }
      }

      // severity
      if (typeof finding.severity !== 'string' || !VALID_SEVERITIES.has(finding.severity)) {
        return { kind: 'unavailable', reason: `Invalid finding severity: "${String(finding.severity)}"` }
      }

      // requirementIndexes
      if (!Array.isArray(finding.requirementIndexes)) {
        return { kind: 'unavailable', reason: `Finding requirementIndexes must be an array` }
      }
      for (const reqIdx of finding.requirementIndexes) {
        if (!Number.isInteger(reqIdx) || reqIdx < 0 || reqIdx >= userReqCount) {
          return {
            kind: 'unavailable',
            reason: `requirementIndex ${reqIdx} is out of bounds (allowed: 0..${userReqCount - 1})`,
          }
        }
      }

      // decisionIndexes
      if (!Array.isArray(finding.decisionIndexes)) {
        return { kind: 'unavailable', reason: `Finding decisionIndexes must be an array` }
      }
      for (const decIdx of finding.decisionIndexes) {
        if (!Number.isInteger(decIdx) || decIdx < 0 || decIdx >= decisionsCount) {
          return {
            kind: 'unavailable',
            reason: `decisionIndex ${decIdx} is out of bounds (allowed: 0..${decCountString(decisionsCount)})`,
          }
        }
      }

      // message
      if (typeof finding.message !== 'string' || !finding.message.trim()) {
        return { kind: 'unavailable', reason: 'Finding message must be a non-empty string' }
      }

      // suggestedCorrection
      if (typeof finding.suggestedCorrection !== 'string') {
        return { kind: 'unavailable', reason: 'Finding suggestedCorrection must be a string' }
      }
    }
  }

  // Validate verdict against finding count
  if (parsed.verdict === 'ready') {
    if (seenIds.size > 0) {
      return { kind: 'unavailable', reason: `Verdict is "ready" but findings list contains ${seenIds.size} findings` }
    }
    return { kind: 'ready', assessment: parsed as unknown as ForemanAssessment }
  } else {
    if (seenIds.size === 0) {
      return { kind: 'unavailable', reason: 'Verdict is "concerns" but no findings were provided' }
    }
    return { kind: 'concerns', assessment: parsed as unknown as ForemanAssessment }
  }
}

function decCountString(count: number): string {
  return count > 0 ? `0..${count - 1}` : 'none (0 decisions exist)'
}

/**
 * Read-only JSON Schema of `ForemanAssessment`, exactly as plan 7.2 declares it.
 *
 * The reviewer is told the output type's name and nothing else, which is not enough to
 * produce a conforming object: it has to invent the section names, the finding fields, the
 * category and severity vocabularies, and the array-of-findings shape. Attaching the
 * structure removes that guessing without adding any scoring rule, rubric or instruction —
 * `FOREMAN_SYSTEM_PROMPT` stays byte-identical, and this object only describes what a
 * well-formed answer looks like.
 *
 * Every object closes with `additionalProperties: false` so an extra field is a shape error
 * rather than a silently ignored one; `parseForemanAssessment` rejects unknown fields for the
 * same reason.
 */
export function foremanAssessmentSchema(): Readonly<Record<string, unknown>> {
  const finding = {
    type: 'object' as const,
    additionalProperties: false,
    required: ['id', 'category', 'severity', 'requirementIndexes', 'decisionIndexes', 'message', 'suggestedCorrection'],
    properties: {
      id: { type: 'string', description: 'Unique finding id within this assessment.' },
      category: {
        type: 'string',
        enum: ['requirement-coverage', 'acceptance-gap', 'decision-counterexample', 'unresolved-assumption',
          'scope-contradiction', 'material-ambiguity'],
      },
      severity: { type: 'string', enum: ['warning', 'blocking-concern'] },
      requirementIndexes: { type: 'array', items: { type: 'integer', minimum: 0 } },
      decisionIndexes: { type: 'array', items: { type: 'integer', minimum: 0 } },
      message: { type: 'string' },
      suggestedCorrection: { type: 'string' },
    },
  }
  const findings = { type: 'array' as const, items: finding }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'candidateDigest', 'verdict', 'acceptanceAudit', 'decisionChallenges', 'materialAmbiguities'],
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      candidateDigest: { type: 'string', description: 'The candidate digest supplied with this candidate, copied exactly.' },
      verdict: { type: 'string', enum: ['ready', 'concerns'] },
      acceptanceAudit: {
        type: 'object',
        additionalProperties: false,
        required: ['uncoveredRequirements', 'weakOracles', 'falseGreenScenarios'],
        properties: {
          uncoveredRequirements: findings,
          weakOracles: findings,
          falseGreenScenarios: findings,
        },
      },
      decisionChallenges: {
        type: 'object',
        additionalProperties: false,
        required: ['unsupportedDecisions', 'counterexamples', 'unresolvedCriticalAssumptions'],
        properties: {
          unsupportedDecisions: findings,
          counterexamples: findings,
          unresolvedCriticalAssumptions: findings,
        },
      },
      materialAmbiguities: findings,
    },
  }
}

/** One Lead resolution, as the gate reads it: which findings were answered and what it revised. */
export interface PlanReviewGateResolution {
  readonly candidateDigest: Digest
  readonly round: number
  readonly dispositions: readonly ForemanDisposition[]
  readonly revisedCandidateDigest?: Digest
}

export interface PlanReviewGateDecision {
  /** The exact candidate may dispatch without another model call. */
  approved: boolean
  /** The round the gate would run next when it is not approved. */
  round: 1 | 2
  /** Why it is not approved, for the diagnostic the Lead sees. */
  reason?: 'interrupted-round-2' | 'unreviewed'
}

/**
 * Decide whether a candidate may dispatch, and which round reviews it if not.
 *
 * Approval is bound to the digest that was actually reviewed:
 *
 * - `ready` and `unavailable` close the question for that digest. A reviewer that could not
 *   be reached must not block dispatch — that is the fail-open half of plan §8.3 — while the
 *   Host's own deterministic checks remain fail-closed.
 * - Round 1 closes only when every finding was overridden AND the override did not change
 *   the candidate. An override with a revision is a claim that the plan changed, and the
 *   changed plan still owes round 2; a revision recorded here is what sends the *revised*
 *   digest to round 2.
 * - Round 2 is the last round, so overriding everything there is the only way past it.
 * - A digest that was never reviewed is not approved, even when a different digest was.
 *
 * This is deliberately a pure function of the recorded reviews and resolutions: the gate runs
 * on a candidate that is constructed fresh after a restart, so anything it inferred from
 * in-memory state would be lost exactly when it matters.
 */
export function planReviewGateDecision(input: {
  candidateDigest: Digest
  reviews: readonly PlanReviewRecord[]
  resolutions: readonly PlanReviewGateResolution[]
}): PlanReviewGateDecision {
  const { candidateDigest, reviews, resolutions } = input
  for (const round of [2, 1] as const) {
    const review = reviews.find(item => item.candidateDigest === candidateDigest && item.round === round)
    if (!review) continue
    if (review.outcome === 'unavailable') return { approved: true, round }
    if (review.assessment?.verdict === 'ready') return { approved: true, round }
    if (review.assessment?.verdict !== 'concerns') continue
    const resolution = resolutions.find(item => item.candidateDigest === candidateDigest && item.round === round)
    const dispositions = resolution?.dispositions ?? review.dispositions
    if (!dispositions?.length || !dispositions.every(item => item.action === 'overridden')) continue
    if (round === 2) return { approved: true, round }
    // A round-1 override that also revised the plan is not an approval of the newer candidate:
    // the recorded revision has to be the candidate in hand for the override to stand.
    if (resolution?.revisedCandidateDigest === undefined || resolution.revisedCandidateDigest === candidateDigest) {
      return { approved: true, round }
    }
  }
  // No review approved this digest. If a round-1 resolution revised the plan into exactly this
  // candidate, the interruption happened between persisting the resolution and requesting
  // round 2, so continue there rather than asking round 1's findings again.
  const continuesRound2 = resolutions.some(item => item.round === 1
    && item.revisedCandidateDigest !== undefined && item.revisedCandidateDigest === candidateDigest)
  return continuesRound2 ? { approved: false, round: 2, reason: 'interrupted-round-2' } : { approved: false, round: 1, reason: 'unreviewed' }
}
