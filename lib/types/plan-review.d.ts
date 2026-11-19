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
/**
 * The most review rounds one candidate may go through.
 *
 * A round is review feedback the Lead can answer: round 1 finds problems, the Lead repairs
 * the plan, and the repaired plan is reviewed again. Two rounds ended the loop while a
 * repaired plan could still be challenged, so the Lead's only remaining move was an override
 * — the argument the second review had just refuted. A third round is what a second repair
 * is worth. A fourth is not: past this point the plan is oscillating, and the Lead must ask
 * the user instead of iterating on its own judgement.
 *
 * Named once so a caller can raise it later without re-deriving the gate, the coordinator and
 * the messages from separate literals.
 */
export declare const FOREMAN_MAX_REVIEW_ROUNDS = 3;
export declare const FOREMAN_SYSTEM_PROMPT = "You are Foreman, an independent plan auditor. Review only the supplied candidate work order, and audit it against the real repository: you may read the workspace with read, grep and glob, and run commands (including the test and lint commands an acceptance claim names) with the shell, so open the files and check the claims every finding and every approval depends on instead of reasoning from the plan text alone. Your role is audit only, and that rule is yours to keep: do not edit the plan, do not fix or write code, do not run mutating commands, and do not perform any fix. If something is broken or missing, report it to Lead instead of repairing it, and never leave the workspace modified. Find semantic gaps that deterministic Host validation cannot decide: uncovered hard requirements, weak acceptance oracles, concrete false-green scenarios, unsupported decisions, counterexamples, unresolved critical assumptions, scope contradictions, and material ambiguities that would change observable behavior. A text candidate has no acceptance checks by construction: audit whether its goal, brief and constraints can still answer the question the user asked, and leave the acceptance-audit arrays empty instead of inventing checks it was never meant to have. Do not propose an alternative plan. Do not discuss formatting, permissions, path syntax, or other deterministic Host checks. Bind every claim to code: a finding with severity \"blocking-concern\" must carry a non-empty evidence array, and a verdict of \"ready\" must carry a non-empty inspected array listing the ranges you actually read. Each entry is {\"path\": \"<repo-relative path>\", \"startLine\": <first line>, \"endLine\": <last line>}, with 1 <= startLine <= endLine. The Host opens every cited file, checks that the range exists, records the digest of the bytes it read, and discards the whole assessment as unavailable if one citation does not resolve; cite only what you actually read. Return exactly one JSON object matching ForemanAssessment schema version 1. Use verdict \"ready\" only when every finding array is empty; otherwise use \"concerns\". Report at most 8 findings across all finding arrays, most material first; when the plan has more problems than that, report the ones that would change observable behavior and omit the rest. Copy candidateDigest exactly. Do not use Markdown or include any text outside the JSON object.";
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
 *
 * The two citation lists are part of the contract because the verdict is bound to code: a
 * blocking finding must carry `evidence`, and `inspected` is required at the root (an approval
 * with nothing inspected is refused by the parser anyway). The citation object deliberately
 * has no `digest` field — the Host fills that from the bytes it opened.
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
    round: number;
    /** Why it is not approved, for the diagnostic the Lead sees. */
    reason?: 'interrupted-review' | 'unreviewed' | 'unavailable';
}
/**
 * Decide whether a candidate may dispatch, and which round reviews it if not.
 *
 * Approval is bound to the digest that was actually reviewed:
 *
 * - `ready` closes the question for that digest. An unavailable reviewer is not an
 *   approval; a repeated delegation must not implicitly retry or dispatch it.
 * - Round 1 closes only when every finding was overridden AND the override did not change
 *   the candidate. An override with a revision is a claim that the plan changed, and the
 *   changed plan still owes another round; a revision recorded here is what sends the
 *   *revised* digest to the next one.
 * - Only the last round (round {@link FOREMAN_MAX_REVIEW_ROUNDS}) closes by overriding
 *   everything: every earlier round can still send the repaired plan back for review.
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
