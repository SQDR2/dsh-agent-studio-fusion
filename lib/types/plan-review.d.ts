import type { ArtifactId, AuthorityAction, Constraint, Digest, ForemanAssessment, ForemanDisposition, ForemanFinding, PlanReviewCandidate, PlanReviewCheckDefinition, PlanReviewRecord, RequirementCoverage, ResourcePolicy, SnapshotId, WorkOrder } from './contracts.js';
export interface PlanReviewLintIssue {
    readonly field: string;
    readonly message: string;
}
export interface SemanticCandidateProjection {
    schemaVersion: 1;
    brief: string;
    mode: WorkOrder['mode'];
    goal: string;
    constraints: readonly {
        text: string;
        provenance: Constraint['provenance'];
        mandatory: boolean;
    }[];
    allowedPaths: readonly string[];
    forbiddenActions: readonly string[];
    authority?: readonly AuthorityAction[];
    preserveRuntime?: true;
    decisions: readonly {
        text: string;
    }[];
    uncertainties: readonly string[];
    policy: ResourcePolicy;
    requirementCoverage: readonly RequirementCoverage[];
    baseSnapshot: SnapshotId;
    evidence: readonly {
        id: ArtifactId;
        digest: Digest;
    }[];
    checkDefinitions: readonly PlanReviewCheckDefinition[];
    /** The user's own words, when the candidate carries them; part of the semantic digest. */
    userMessages?: readonly string[];
    /** Collected exploration evidence, when the candidate carries it; part of the digest. */
    evidenceSummary?: string;
}
/**
 * Computes semantic candidate projection, stripping ephemeral random IDs
 * (order.id, order.operationId, order.taskId, acceptance[].planId/planDigest,
 * constraint ids, SourceRefs) while preserving the full semantic specification.
 */
export declare function semanticCandidateProjection(candidate: PlanReviewCandidate): SemanticCandidateProjection;
/**
 * Compute stable candidate digest by hashing its semantic projection.
 */
export declare function candidateDigest(candidate: PlanReviewCandidate): Digest;
export type PlanReviewRiskReason = 'user-requirements-count' | 'multiple-allowed-paths' | 'authority-granted' | 'empty-acceptance' | 'unresolved-uncertainties';
export interface PlanReviewRiskEvaluation {
    triggered: boolean;
    reasons: readonly PlanReviewRiskReason[];
}
/**
 * Pure deterministic risk assessment on a candidate work order.
 */
export declare function planReviewRisk(candidate: PlanReviewCandidate): PlanReviewRiskEvaluation;
/**
 * Collect all findings across all 7 sections of ForemanAssessment.
 */
export declare function collectForemanFindings(assessment: ForemanAssessment): readonly ForemanFinding[];
/**
 * Host lint performs deterministic structural validation on a candidate
 * before any model review or Worker dispatch.
 */
export declare const VALID_CHECK_PARSERS: readonly ["unittest", "pytest", "vitest", "jest", "mocha", "tap", "go", "cargo", "exit-code"];
export declare const VALID_TEST_PARSERS: readonly ["unittest", "pytest", "vitest", "jest", "mocha", "tap", "go", "cargo"];
export declare function lintPlanReviewCandidate(candidate: PlanReviewCandidate): readonly PlanReviewLintIssue[];
export declare function assertValidPlanReviewCandidate(candidate: PlanReviewCandidate): void;
export interface PlanReviewModule {
    review(candidate: PlanReviewCandidate, signal?: AbortSignal): Promise<PlanReviewOutcome>;
}
export type PlanReviewOutcome = {
    kind: 'ready';
    assessment: ForemanAssessment;
} | {
    kind: 'concerns';
    assessment: ForemanAssessment;
} | {
    kind: 'unavailable';
    reason: string;
};
/**
 * The most findings one review may report.
 *
 * A finding carries a message and a suggested correction, so the assessment grows with the
 * count. The request also has a finite output budget ({@link ForemanConfig.maxOutputTokens}),
 * and a review that exceeds it is discarded whole rather than partly kept, which reads
 * downstream as approval. Bounding the count keeps the review inside the budget by
 * construction instead of relying on the cap to catch it.
 */
export declare const FOREMAN_MAX_FINDINGS = 8;
export declare const FOREMAN_SYSTEM_PROMPT = "You are Foreman, an independent plan auditor. Review only the supplied candidate work order. Find semantic gaps that deterministic Host validation cannot decide: uncovered hard requirements, weak acceptance oracles, concrete false-green scenarios, unsupported decisions, counterexamples, unresolved critical assumptions, scope contradictions, and material ambiguities that would change observable behavior. Do not propose an alternative plan. Do not discuss formatting, permissions, path syntax, or other deterministic Host checks. Return exactly one JSON object matching ForemanAssessment schema version 1. Use verdict \"ready\" only when every finding array is empty; otherwise use \"concerns\". Report at most 8 findings across all finding arrays, most material first; when the plan has more problems than that, report the ones that would change observable behavior and omit the rest. Copy candidateDigest exactly. Do not use Markdown or include any text outside the JSON object.";
export declare function parseForemanAssessment(rawText: string, candidate: PlanReviewCandidate): PlanReviewOutcome;
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
export declare function foremanAssessmentSchema(): Readonly<Record<string, unknown>>;
/** One Lead resolution, as the gate reads it: which findings were answered and what it revised. */
export interface PlanReviewGateResolution {
    readonly candidateDigest: Digest;
    readonly round: number;
    readonly dispositions: readonly ForemanDisposition[];
    readonly revisedCandidateDigest?: Digest;
}
export interface PlanReviewGateDecision {
    /** The exact candidate may dispatch without another model call. */
    approved: boolean;
    /** The round the gate would run next when it is not approved. */
    round: 1 | 2;
    /** Why it is not approved, for the diagnostic the Lead sees. */
    reason?: 'interrupted-round-2' | 'unreviewed';
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
export declare function planReviewGateDecision(input: {
    candidateDigest: Digest;
    reviews: readonly PlanReviewRecord[];
    resolutions: readonly PlanReviewGateResolution[];
}): PlanReviewGateDecision;
