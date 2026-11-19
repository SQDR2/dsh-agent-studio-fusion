/**
 * Proposed plugin-domain contracts, NOT existing DSH API declarations.
 * No runtime behavior or authorization is supplied by these types.
 * Convert DSH branded IDs only in the version-pinned bridge layer.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
export type TaskId = Brand<string, 'FusionTaskId'>;
export type SessionId = Brand<string, 'DshSessionId'>;
export type WorkOrderId = Brand<string, 'FusionWorkOrderId'>;
export type OperationId = Brand<string, 'FusionOperationId'>;
export type ArtifactId = Brand<string, 'FusionArtifactId'>;
export type SnapshotId = Brand<string, 'FusionSnapshotId'>;
export type Digest = Brand<string, 'Sha256Hex'>;
/** Decimal string avoids binary-float money and is JSON serializable. */
export type UsdDecimal = Brand<string, 'UsdDecimal'>;
export type EpochId = Brand<string, 'ContextEpochId'>;

export interface PhysicalRoute {
  provider: string;
  model: string;
  reasoningEffort?: string; // Validate against the owning adapter's opaque IDs.
}
export type RunSelection =
  | { kind: 'model'; route: PhysicalRoute }
  | { kind: 'profile'; profileId: string; requestedVersion?: string };
export type Role = 'lead' | 'worker';
/** A Host sandbox mode, spelled as the `sandbox/mode` session event writes it. */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type Phase =
  | 'READY' | 'PLANNING' | 'DIRECT' | 'WORKER_RUNNING' | 'REVIEWING'
  | 'REWORK' | 'WAITING_APPROVAL' | 'WAITING_USER' | 'WAITING_BUDGET'
  | 'RECOVERING' | 'PAUSED' | 'STOPPING' | 'NEEDS_DECISION'
  | 'FAILED' | 'COMPLETED' | 'CANCELLED';
export type VerificationLevel = 'unverified' | 'partial' | 'verified';
export type ExecutionIntent = 'DIRECT' | 'DELEGATE';

export interface SourceRef {
  sessionId: SessionId;
  eventSeq: number;
  messageId?: string;
}
export interface ArtifactRef {
  id: ArtifactId;
  digest: Digest;
  ownerTaskId: TaskId;
  mediaType: string;
  bytes: number;
}
export interface Constraint {
  id: string;
  text: string;
  source: SourceRef;
  provenance: 'user' | 'policy' | 'inferred';
  mandatory: boolean;
}
export interface AcceptanceCriterion {
  id: string;
  description: string;
  verificationKind: 'test' | 'static-check' | 'human' | 'review';
  mandatory: boolean;
  verifierId?: string;
  planId?: string;
  planDigest?: Digest;
}
export interface ResourcePolicy {
  maxWorkerSteps: number;
  maxReworkRounds: number;
  maxCapabilityUpgrades: number;
  modelSpendAuthorizationId?: string;
  maxApiCostUsd?: UsdDecimal;
  maxTotalOutputTokens: number;
  /** Human approval has no expiry; only machine execution has a deadline. */
  commandMaxSeconds: number;
}
/**
 * An action that leaves the workspace (or rewrites what was already published).
 * The Lead is the authority for these; a work order names the ones it grants,
 * and the Host refuses every other one on the Sidekick's shell.
 */
export type AuthorityAction = 'commit' | 'push' | 'tag' | 'publish' | 'release' | 'pr' | 'ci';
/**
 * A background process the Worker asked to keep alive after its report: a dev
 * server, a watcher, a debugger. The Host records what it started (never the raw
 * command, which may carry a token), who owns it and when it dies on its own, so
 * a later handoff reuses it instead of paying the startup again, and nothing
 * adopts a process from a previous Host that merely shares a PID.
 */
export interface RuntimeHandle {
  schemaVersion: 1;
  taskId: TaskId;
  workOrderId: WorkOrderId;
  jobId: string;
  /** Why this process must outlive the report; shown in the next brief. */
  purpose: string;
  /** Digest of the command the Host started, not the command text. */
  commandDigest: Digest;
  cwd: string;
  /** Host start time of the job; part of its identity, like the process id. */
  startedAt: number;
  deadlineAt: number | null;
  owner: { processId: number; agentId: string; role: 'worker' };
}
export interface WorkOrder {
  schemaVersion: 1;
  /** Older work orders are implementation work. Exploration never grants a writer. */
  mode?: 'explore' | 'implement' | 'text';
  taskId: TaskId;
  id: WorkOrderId;
  operationId: OperationId;
  revision: number;
  goal: string;
  constraints: readonly Constraint[];
  acceptance: readonly AcceptanceCriterion[];
  allowedPaths: readonly string[];
  forbiddenActions: readonly string[];
  /** Authority actions the Lead granted for this work order; absent means none. */
  authority?: readonly AuthorityAction[];
  /**
   * The Worker may leave a declared background process running past its report.
   * Absent means every command must settle before a report can be submitted.
   */
  preserveRuntime?: true;
  baseSnapshot: SnapshotId;
  evidence: readonly ArtifactRef[];
  decisions: readonly { text: string; source: SourceRef }[];
  uncertainties: readonly string[];
  policy: ResourcePolicy;
  /** Stable digest of the semantic plan-review projection of this order. */
  candidateDigest?: Digest;
  /** Requirement-to-implementation and acceptance mapping for each user requirement. */
  requirementCoverage?: readonly RequirementCoverage[];
}
/** One user requirement's implementation notes and the checks that prove it. */
export interface RequirementCoverage {
  requirementIndex: number;
  implementationNotes: readonly string[];
  acceptanceIds: readonly string[];
}
export type PlanReviewCheckKind = 'test' | 'static-check';
export type PlanReviewCheckParser =
  | 'unittest'
  | 'pytest'
  | 'vitest'
  | 'jest'
  | 'mocha'
  | 'tap'
  | 'go'
  | 'cargo'
  | 'exit-code';
export type PlanReviewBaseline = 'no-new-failures';
/** One frozen acceptance command as the plan reviewer sees it. */
export interface PlanReviewCheckDefinition {
  id: string;
  description: string;
  command: string;
  kind: PlanReviewCheckKind;
  parser: PlanReviewCheckParser;
  definitionPaths: readonly string[];
  timeoutSeconds?: number;
  baseline?: PlanReviewBaseline;
  independent?: boolean;
  allowedFailures?: readonly string[];
}
/** The complete, self-contained input one plan review sees. */
export interface PlanReviewCandidate {
  schemaVersion: 1;
  order: WorkOrder;
  brief: string;
  requirementCoverage: readonly RequirementCoverage[];
  checkDefinitions: readonly PlanReviewCheckDefinition[];
  /** The user messages this plan answers, verbatim; absent on older records. */
  userMessages?: readonly string[];
  /** Bounded summary of collected exploration evidence; absent on older records. */
  evidenceSummary?: string;
  /** Read-only JSON Schema of ForemanAssessment, so the reviewer can build conforming output. */
  assessmentSchema?: Readonly<Record<string, unknown>>;
}
export type FailureClass =
  | 'plan-defect'
  | 'execution-defect'
  | 'acceptance-gap'
  | 'lead-review-miss'
  | 'environment-failure'
  | 'missing-user-decision';
export type ForemanDefectAttribution = 'hit' | 'miss' | 'false-positive' | 'not-applicable';
/** Durable offline classification of one defect against the review that preceded it. */
export interface ForemanAttributionRecord {
  schemaVersion: 1;
  id: string;
  taskId: TaskId;
  workOrderId?: WorkOrderId;
  candidateDigest?: Digest;
  failureClass: FailureClass;
  preventableAtPlanTime: boolean;
  attribution: ForemanDefectAttribution;
  confidence: number;
  evidence: readonly ArtifactRef[];
  summary?: string;
}
/**
 * One file range a Foreman review cites as the code it actually read.
 *
 * The path is repo-relative and the range is 1-based and inclusive on both ends, so the
 * citation names exact bytes rather than a whole file the reviewer may never have opened.
 * `digest` is filled by the Host after it verified the range against the frozen workspace:
 * it is the proof of which revision of those bytes the verdict was reached on, and the
 * reviewer may not supply it (the answer parser rejects it as an unknown field).
 */
export interface ForemanCitation {
  path: string;
  startLine: number;
  endLine: number;
  digest?: Digest;
}
/** One semantic gap the independent plan reviewer reports. */
export interface ForemanFinding {
  id: string;
  category:
    | 'requirement-coverage'
    | 'acceptance-gap'
    | 'decision-counterexample'
    | 'unresolved-assumption'
    | 'scope-contradiction'
    | 'material-ambiguity';
  severity: 'warning' | 'blocking-concern';
  requirementIndexes: number[];
  decisionIndexes: number[];
  message: string;
  suggestedCorrection: string;
  /** Required, non-empty, on a `blocking-concern`: the code that shows the problem. */
  evidence?: ForemanCitation[];
}
/** The reviewer's structured output for exactly one candidate digest. */
export interface ForemanAssessment {
  schemaVersion: 1;
  candidateDigest: string;
  verdict: 'ready' | 'concerns';
  /**
   * What the reviewer actually inspected. Required, non-empty, when the verdict is
   * `ready`: an approval that names no code is an assertion, not a review.
   */
  inspected?: ForemanCitation[];
  acceptanceAudit: {
    uncoveredRequirements: ForemanFinding[];
    weakOracles: ForemanFinding[];
    falseGreenScenarios: ForemanFinding[];
  };
  decisionChallenges: {
    unsupportedDecisions: ForemanFinding[];
    counterexamples: ForemanFinding[];
    unresolvedCriticalAssumptions: ForemanFinding[];
  };
  materialAmbiguities: ForemanFinding[];
}
/** The Lead's recorded answer to one finding: accept and revise, or override with a reason. */
export type ForemanDisposition =
  | { findingId: string; action: 'accepted'; changeSummary: string }
  | { findingId: string; action: 'overridden'; reason: string };
/** One plan review attempt, bound to the candidate digest and round it reviewed. */
export interface PlanReviewRecord {
  schemaVersion: 1;
  taskId: TaskId;
  workOrderId: WorkOrderId;
  candidateDigest: Digest;
  round: number;
  route: PhysicalRoute;
  requestedAt: string;
  completedAt: string;
  outcome: 'assessment' | 'unavailable';
  assessment?: ForemanAssessment;
  unavailableReason?: string;
  durationMs: number;
  dispositions?: readonly ForemanDisposition[];
}
export interface ExplorationSource {
  path: string;
  startLine: number;
  endLine: number;
}
/** File excerpts are captured by the Host, not accepted from model narration. */
export interface ExplorationReport {
  schemaVersion: 1;
  workOrderId: WorkOrderId;
  revision: number;
  status: WorkerReport['status'];
  summary: string;
  unresolved: readonly string[];
  snapshot: SnapshotId;
  sources: readonly (ExplorationSource & { fileDigest: string; excerpt: ArtifactRef })[];
}
export interface CoverageClaim {
  criterionId: string;
  state: 'satisfied' | 'not-satisfied' | 'not-verified';
  evidenceIds: readonly ArtifactId[];
  explanation: string;
}
export interface WorkerReport {
  schemaVersion: 1;
  workOrderId: WorkOrderId;
  revision: number;
  status: 'completed' | 'blocked' | 'needs-decision';
  summary: string;
  snapshot: SnapshotId;
  changeManifest: ArtifactRef;
  coverage: readonly CoverageClaim[];
  verification: readonly ArtifactRef[];
  unresolved: readonly string[];
  questions: readonly string[];
}
export type EvidenceKind = 'tool' | 'human-decision' | 'review-accept';
export interface ToolEvidence {
  schemaVersion: 1;
  taskId: TaskId;
  operationId: OperationId;
  actor: SessionId;
  nativeToolCallId: string;
  argvDigest: Digest;
  cwdDigest: Digest;
  inputSnapshot: SnapshotId;
  outputSnapshot?: SnapshotId;
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
  stdout: ArtifactRef;
  stderr: ArtifactRef;
  state: 'started' | 'completed' | 'cancelled' | 'outcome-unknown';
  kind?: 'tool' | 'human-decision' | 'review-accept';
}
export interface ContextCheckpoint {
  schemaVersion: 1;
  epochId: EpochId;
  taskId: TaskId;
  revision: number;
  goal: string;
  mandatoryConstraints: readonly Constraint[];
  snapshot: SnapshotId;
  decisions: readonly { text: string; source: SourceRef }[];
  coverage: readonly CoverageClaim[];
  pendingApprovalIds: readonly string[];
  openQuestions: readonly string[];
  evidence: readonly ArtifactRef[];
  sourceSurfaceSeqs: readonly number[]; // Surface order, NOT numeric sorting.
  digest: Digest;
}
export interface RoleContextPolicy {
  targetInputTokens: number;
  reserveOutputTokens: number;
  minSafetyTokens: number;
  safetyFraction: number;
  compactToFraction: number;
  evidenceReadTokens: number;
  maxToolVisibleTokens: number;
}
export interface PairProfile {
  schemaVersion: 1;
  id: string;
  version: string;
  digest: Digest;
  enabled: boolean;
  quality: 'experimental' | 'validated' | 'deprecated';
  /** Missing on frozen v1 sessions; only new selections use native model behavior. */
  interactionMode?: 'model-like';
  /** Frozen per selection. Absence preserves pre-enforcement sessions. */
  workflowPolicy?: 'enforced-v1' | 'enforced-v2' | 'enforced-v3';
  lead: PhysicalRoute;
  worker: PhysicalRoute;
  workerUpgradePath: readonly PhysicalRoute[];
  promptDigests: Readonly<Record<'lead' | 'worker' | 'compact', Digest>>;
  context: Readonly<Record<Role, RoleContextPolicy>>;
  /**
   * Per role: on, off, or 'auto' (armed once the route reports cache reads).
   * Unset: Lead auto, Worker off.
   */
  cacheKeepalive?: Readonly<Record<Role, boolean | 'auto'>>;
  /** Optional explicit summary route. Missing means the current role model. */
  compactor?: { readonly route: PhysicalRoute; readonly maxOutputTokens: number };
  /** Optional independent plan reviewer. Missing means plan review is off; present means every plan is reviewed. */
  foreman?: { readonly route: PhysicalRoute; readonly maxOutputTokens: number; readonly timeoutMs: number };
  dataPolicyId: string;
  evidenceCampaignIds: readonly string[];
}
export interface LogicalApproval {
  id: string;
  taskId: TaskId;
  revision: number;
  operationId: OperationId;
  nativeRequestId?: string;
  argsDigest: Digest;
  snapshot: SnapshotId;
  permissionPolicyDigest: Digest;
  state: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'consumed';
  decisionBy?: 'human' | 'preauthorized-policy';
  /** No expiresAt: pending human work does not expire automatically. */
}
export interface WriteLease {
  workspaceId: string;
  holder: SessionId;
  taskId: TaskId;
  generation: number;
  activeOperationIds: readonly OperationId[];
}
export interface TokenMeasurement {
  inputTokens: number;
  reservedOutputTokens: number;
  contextWindow: number;
  safetyTokens: number;
  quality: 'exact' | 'provider-estimated' | 'heuristic';
  requestDigest: Digest;
}
/** Mutually exclusive buckets. Null means unavailable, never zero. */
export type UsageApplicability = 'not_applicable' | 'unknown' | 'known';
export interface NormalizedUsage {
  uncachedInput: number | null;
  cacheRead: number | null;
  cacheReadStatus: UsageApplicability;
  cacheWrite: Readonly<Record<string, number | null>>;
  cacheWriteStatus: Readonly<Record<string, UsageApplicability>>;
  output: number | null;
  /** Informational subset; do not charge again if included in output. */
  reasoningOutputSubset: number | null;
  /** Separately billed reasoning. Charge at the reasoning or output rate. */
  reasoningSeparate: number | null;
  /** Reasoning tokens whose include-in-output contract is unknown. */
  reasoningUnspecified: number | null;
  reasoningBilling: ReasoningBilling;
  inputIncludesCacheRead: boolean | null;
}
export interface ReasoningBilling {
  kind: 'included' | 'separate' | 'unknown' | 'not_applicable';
  tokens: number | null;
}

export interface ReportSubject {
  taskId: TaskId;
  workOrderId: WorkOrderId;
  revision: number;
  reportId: string;
  reportDigest: Digest;
  snapshot: SnapshotId;
}
export interface ReviewTicket {
  id: string;
  requestId: string;
  generation: number;
  subject: ReportSubject;
  validationDigest: Digest;
  workOrderDigest: Digest;
}
export interface ReviewGate {
  taskId: TaskId;
  workOrderId: WorkOrderId;
  revision: number;
  reportDigest: Digest;
  snapshot: SnapshotId;
  reviewAttemptId: string;
  decision: 'accept' | 'rework' | 'needs-decision' | 'REVIEW_INCOMPLETE';
  terminalStatus: 'accepting' | 'incomplete' | 'rework' | 'needs-decision' | 'legacy-unbound';
}
export interface ReviewReadinessReceipt {
  subject: ReportSubject;
  receiptId: string;
  receiptDigest: Digest;
  verdict: 'review-ready';
}
export interface ReviewResultV2 {
  ticketId: string;
  requestId: string;
  generation: number;
  subject: ReportSubject;
  terminalEvidenceRef: string;
  decision: 'accept' | 'rework' | 'needs-decision' | 'REVIEW_INCOMPLETE';
  protocolValid: boolean;
}
export interface ReviewCompletedPayload {
  decision: 'accept' | 'rework' | 'needs-decision' | 'REVIEW_INCOMPLETE';
  /** Required for a new completion. Decision-only payloads are legacy-unbound. */
  binding?: ReviewResultV2;
}
export interface ControlState {
  mode: 'running' | 'paused' | 'stop-requested' | 'cancelled' | 'completed';
  pendingApprovalIds: readonly string[];
  budgetBlocked: boolean;
  recovering: boolean;
  outcomeUnknown: boolean;
}
export interface UsageAttempt {
  attemptId: string;
  taskId: TaskId;
  agentId: SessionId;
  role: Role;
  purpose: 'conversation' | 'compaction' | 'review' | 'routing' | 'foreman' | 'other';
  route: PhysicalRoute;
  epochId: EpochId;
  serviceTier?: string;
  rawUsage?: ArtifactRef;
  normalized: NormalizedUsage;
  priceCardDigest?: Digest;
  apiEquivalentUsd: UsdDecimal | null;
  actualBilledUsd: UsdDecimal | null;
  status: 'pending' | 'complete' | 'partial' | 'unknown';
}
export interface EventEnvelope<T extends string, P> {
  schemaVersion: 1;
  id: string;
  taskId: TaskId;
  seq: number;
  revision: number;
  type: T;
  createdAt: string;
  causeId: string;
  payload: P;
}
export type OutboxState =
  | 'prepared'
  | 'dispatched'
  | 'accepted'
  | 'claimed'
  | 'result-recorded'
  | 'delivered'
  | 'acknowledged';
export interface OutboxRow {
  operationId: OperationId;
  taskId: TaskId;
  kind: string;
  state: OutboxState;
  reservedChild?: SessionId;
  nativeMessageId?: string;
  resultDigest?: Digest;
  payloadRef?: string;
  requestId?: string;
  ticket?: ReviewTicket;
}
export type FusionEvent =
  | EventEnvelope<'task/created', { parent: SessionId; selection: RunSelection }>
  | EventEnvelope<'requirements/revised', { reason: string }>
  | EventEnvelope<'profile/frozen', { digest: Digest; profileId: string; version: string }>
  | EventEnvelope<'intent/chosen', { intent: ExecutionIntent }>
  | EventEnvelope<'plan-review/requested', { workOrderId: WorkOrderId; candidateDigest: Digest; round: number; route: PhysicalRoute; requestedAt?: string; retryOf?: WorkOrderId; commandId?: string }>
  | EventEnvelope<'plan-review/skip-authorized', { candidateDigest: Digest; round: number; failureWorkOrderId: WorkOrderId; commandId: string; reason: string }>
  | EventEnvelope<'plan-review/completed', { workOrderId: WorkOrderId; candidateDigest: Digest; round: number; assessment: ForemanAssessment; record: PlanReviewRecord }>
  | EventEnvelope<'plan-review/resolved', { workOrderId: WorkOrderId; candidateDigest: Digest; round: number; dispositions: readonly ForemanDisposition[]; revisedCandidateDigest?: Digest; resolvedAt?: string }>
  | EventEnvelope<'plan-review/unavailable', { workOrderId: WorkOrderId; candidateDigest: Digest; round: number; reason: string; record: PlanReviewRecord }>
  | EventEnvelope<'foreman-attribution/completed', { record: ForemanAttributionRecord }>
  | EventEnvelope<'work-order/prepared', { order: WorkOrder; reservedChild: SessionId }>
  | EventEnvelope<'work-order/acceptance-amended', { workOrderId: WorkOrderId; acceptance: readonly AcceptanceCriterion[]; reason: string }>
  | EventEnvelope<'work-order/scope-expanded', { workOrderId: WorkOrderId; allowedPaths: readonly string[]; added: readonly string[]; reason: string }>
  | EventEnvelope<'work-order/authority-granted', { workOrderId: WorkOrderId; authority: readonly AuthorityAction[]; added: readonly AuthorityAction[]; reason: string }>
  | EventEnvelope<'worker/rework-requested', { workOrderId: WorkOrderId; child: SessionId; ordinal: number; briefRevision: number }>
  | EventEnvelope<'child/accepted', { operationId: OperationId; child: SessionId; messageId: string }>
  | EventEnvelope<'child/claimed', { operationId: OperationId; child: SessionId }>
  | EventEnvelope<'exploration/recorded', { report: ExplorationReport }>
  | EventEnvelope<'report/submitted', { operationId: OperationId; report: WorkerReport }>
  | EventEnvelope<'report/validated', { operationId: OperationId; report: WorkerReport }>
  | EventEnvelope<'review/requested', { ticket: ReviewTicket }>
  | EventEnvelope<'review/completed', ReviewCompletedPayload>
  | EventEnvelope<'lease/acquired', { lease: WriteLease }>
  | EventEnvelope<'lease/released', { workspaceId: string; generation: number }>
  | EventEnvelope<'approval/pending', { approval: LogicalApproval }>
  | EventEnvelope<'approval/answered', { approvalId: string; state: 'approved' | 'rejected' | 'withdrawn' }>
  | EventEnvelope<'budget/blocked', { reason: string }>
  | EventEnvelope<'budget/unblocked', { authorizationId: string }>
  | EventEnvelope<'checkpoint/committed', { checkpoint: ContextCheckpoint }>
  | EventEnvelope<'recovery/needed', { reason: string }>
  | EventEnvelope<'recovery/reconciled', { snapshot: SnapshotId; evidenceRef: string }>
  | EventEnvelope<'effect/outcome-unknown', { operationId: OperationId; reason: string }>
  | EventEnvelope<'effects/reconciled', { snapshot: SnapshotId; evidenceRef: string; quiescent: true }>
  | EventEnvelope<'runtime/declared', { jobId: string; purpose: string; deadlineAt: number | null }>
  | EventEnvelope<'task/stop-requested', { intent: 'pause' | 'cancel' }>
  | EventEnvelope<'task/paused', { reason: string }>
  | EventEnvelope<'task/resumed', { reason: string }>
  | EventEnvelope<'task/completed', { snapshot: SnapshotId; verification: VerificationLevel }>
  | EventEnvelope<'task/cancelled', { reason: string }>;
/**
 * Terminal phases end a task; no further event moves it forward. Expressed as a
 * type here because this file declares no runtime values: import the set itself
 * from the package root (`TERMINAL_PHASES`) when you need to test membership.
 */
export type TerminalPhase = 'COMPLETED' | 'CANCELLED' | 'FAILED';
