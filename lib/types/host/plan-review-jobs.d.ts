/**
 * Plan reviews that outlive the Lead's tool call.
 *
 * A review used to run inside `fusion_delegate`, so the Lead's whole turn waited for it and a
 * wall clock had to decide when to give up. That is the wrong shape for a code audit: the
 * reviewer is doing work, and the user can see the session is busy, so the review should end
 * on its own verdict rather than on the Lead's patience.
 *
 * This registry is the missing lifecycle. A dispatched review owns an `AbortController` and
 * a slot keyed by task, so:
 *
 * - the verdict can be recorded after the tool call that asked for it has already returned;
 * - the task knows a review is still running, and a second candidate cannot start a competing
 *   one;
 * - a stop (task stop, reconciliation) has one handle to abort instead of a detached promise
 *   nobody owns;
 * - a repeated `fusion_delegate` for the same candidate is answered with "already running"
 *   instead of starting the audit twice.
 *
 * The registry lives on the plugin's context rather than on one coordinator instance: an HMR
 * replacement constructs a fresh coordinator over the SAME Host, and the review that has to be
 * finished or cancelled is the one the previous instance started. A per-instance map would
 * strand it, which is exactly the failure the receipts map in `native-worker.ts` exists to
 * avoid.
 *
 * It holds nothing durable. A pending review is durable in the ledger (`pendingPlanReview`),
 * and after a Host restart the next `fusion_resume_plan` re-dispatches it from the saved plan
 * input.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TaskId } from '../contracts.js';
export interface PlanReviewJob {
    readonly taskId: TaskId;
    readonly workOrderId: string;
    readonly round: number;
    readonly controller: AbortController;
}
/** The registry this Host shares with every coordinator it constructs. */
export declare function planReviewJobs(ctx: Context): PlanReviewJobs;
export declare class PlanReviewJobs {
    #private;
    get(taskId: TaskId): PlanReviewJob | undefined;
    /**
     * Reserve the slot before the review starts.
     *
     * Returns false when this task already has a running review: the caller must not start a
     * second one, because two reviews of two candidates would both record a verdict for the
     * same pending round.
     */
    start(job: PlanReviewJob): boolean;
    /** Release only the job that is still recorded; a superseded job must not free its slot. */
    finish(job: PlanReviewJob): void;
    /** Abort the running review for one task. Returns false when nothing was running. */
    cancel(taskId: TaskId, reason: string): boolean;
    /** Abort every running review; used when the Host is closing. */
    cancelAll(reason: string): void;
}
