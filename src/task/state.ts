import type {
  ControlState,
  Digest,
  ExecutionIntent,
  ExplorationReport,
  ForemanAttributionRecord,
  ForemanDisposition,
  FusionEvent,
  LogicalApproval,
  OutboxRow,
  Phase,
  PhysicalRoute,
  PlanReviewRecord,
  ReviewGate,
  ReviewReadinessReceipt,
  ReviewResultV2,
  ReviewTicket,
  RunSelection,
  SessionId,
  SnapshotId,
  TaskId,
  VerificationLevel,
  WorkOrder,
  WorkOrderId,
  WorkerReport,
  WriteLease,
} from '../contracts.js'

export interface AcceptedReview {
  readonly ticket: ReviewTicket
  readonly resultDigest: Digest
}

export interface TaskState {
  readonly schemaVersion: 1
  readonly taskId: TaskId
  readonly revision: number
  readonly seq: number
  readonly phase: Phase
  readonly parent: SessionId
  readonly selection: RunSelection
  readonly profileDigest?: Digest
  readonly intent?: ExecutionIntent
  readonly reservedChild?: SessionId
  readonly acceptedChild?: SessionId
  readonly acceptedMessageId?: string
  readonly currentWorkOrder?: WorkOrder
  readonly exploration?: ExplorationReport
  readonly candidateReport?: WorkerReport
  readonly validatedReport?: WorkerReport
  readonly validatedReceipt?: ReviewReadinessReceipt
  readonly activeReviewTicket?: ReviewTicket
  readonly reviewResult?: ReviewResultV2
  readonly reviewResultDigest?: Digest
  readonly acceptedReview?: AcceptedReview
  readonly reviewGeneration: number
  readonly ignoredReviewResults: readonly ReviewResultV2[]
  readonly staleValidations: readonly { readonly reportDigest: Digest; readonly reason: string }[]
  /** Candidate if unvalidated, otherwise the validated report. Compatibility projection. */
  readonly lastReport?: WorkerReport
  readonly reviewGate?: ReviewGate
  readonly verification: VerificationLevel
  readonly pendingApprovalIds: readonly string[]
  readonly pendingApprovals: Readonly<Record<string, LogicalApproval>>
  readonly control: ControlState
  readonly outcomeUnknown: boolean
  readonly resumePhase?: Phase
  readonly lease?: WriteLease
  readonly lastSnapshot?: SnapshotId
  readonly appliedEventIds: readonly string[]
  readonly planReviews?: readonly PlanReviewRecord[]
  readonly latestPlanReview?: PlanReviewRecord
  readonly planReviewSkips?: readonly Extract<FusionEvent, { type: 'plan-review/skip-authorized' }>['payload'][]
  readonly planReviewResolutions?: readonly {
    readonly workOrderId: WorkOrderId
    readonly candidateDigest: Digest
    readonly round: number
    readonly dispositions: readonly ForemanDisposition[]
    /** The revised candidate an accepted disposition produced; absent when every finding was overridden. */
    readonly revisedCandidateDigest?: Digest
    readonly resolvedAt?: string
  }[]
  readonly foremanAttributions?: readonly ForemanAttributionRecord[]
  /** Lead-authored rework handoffs, in order; the authority for the rework-round metric. */
  readonly workerReworks?: readonly {
    readonly workOrderId: WorkOrderId
    readonly child: SessionId
    readonly ordinal: number
    readonly briefRevision: number
    readonly requestedAt: string
  }[]
  readonly pendingPlanReview?: {
    readonly workOrderId: WorkOrderId
    readonly candidateDigest: Digest
    readonly round: number
    readonly route: PhysicalRoute
    readonly requestedAt: string
    readonly fallbackUsed?: true
  }
}

export interface PersistedTask {
  readonly state: TaskState
  readonly events: readonly FusionEvent[]
  readonly outbox: readonly OutboxRow[]
}
