import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import { TaskId, type Digest, type PairProfile, type PhysicalRoute, type Role } from '../contracts.js';
import { NativeRequestBudget } from '../host/native-budget.js';
import type { NativeUsageRecord } from '../host/native-usage.js';
import type { AuxiliaryRequest } from '../host/native-auxiliary.js';
import type { ResolvedProfile } from '../profile/resolve.js';
import { type BenchmarkOutputLimits } from './output-limits.js';
export type ForemanManifest = {
    condition: 'off';
} | {
    condition: 'on';
    route: PhysicalRoute;
    maxOutputTokens: number;
    timeoutMs: number;
};
/**
 * The Foreman condition one benchmark variant actually ran under.
 *
 * Only the `fusion` variant mounts a coordinator, and therefore only it can ever call the
 * reviewer: a solo Lead, solo Worker, self-review or naive variant has no plan-review seam at
 * all. Reporting the profile's reviewer settings there would claim an experiment arm that was
 * never run, so those variants record `off` regardless of what the profile holds. For `fusion`
 * the only two arms are a configured Foreman, which reviews every candidate plan, and none.
 */
export declare function projectForemanManifest(profile: PairProfile, variant?: 'lead_only' | 'worker_only' | 'worker_selfreview' | 'naive' | 'fusion'): ForemanManifest;
export interface ForemanGuardOwner {
    readonly binding: {
        readonly taskId: TaskId;
        readonly sessionId: string;
        readonly profile: {
            readonly digest: Digest;
        };
    };
    readonly role: Role;
}
export declare function validateForemanGuardRequest(request: {
    provider?: string;
    model?: string;
    maxTokens?: number;
    tools?: unknown[];
}, profile: PairProfile, tag?: AuxiliaryRequest, owner?: ForemanGuardOwner): void;
export interface NativeBenchmarkOptions {
    runId: string;
    variant: 'lead_only' | 'worker_only' | 'worker_selfreview' | 'naive' | 'fusion';
    dataKind: 'real' | 'synthetic';
    /** Version read by the trusted launcher from the loaded artifact's metadata. */
    engineVersion?: string;
    workspace: string;
    /** Fresh directory, outside the candidate's filesystem. Never reused. */
    output: string;
    prompt: string;
    profile: ResolvedProfile;
    /** Required for real runs: exact public model limits frozen before the attempt. */
    outputLimits?: BenchmarkOutputLimits;
    /** One campaign-wide ledger, so attempts cannot reset the approved limit. */
    budget: NativeRequestBudget;
    maxRequests: number;
    timeoutMs: number;
}
/**
 * Run one fresh attempt through the same native AgentLoop and FusionCoordinator
 * as the product. The caller composes public Host services and a sandboxed shell;
 * this function does not implement another LLM/tool loop or grade candidate code.
 */
export declare function runNativeBenchmark(ctx: Context, options: NativeBenchmarkOptions): Promise<{
    status: string;
    failure: string | null;
    endReason: import("@deepseek-ai/dsh-session").TurnEndReason | null;
    phases: {
        stage: "implementation" | "self_review";
        completed: boolean;
        nativeRequests: number;
        endReason: unknown;
    }[];
    deliveredSnapshot: import("../host/workspace.js").WorkspaceSnapshot;
    fusionState: import("../index.js").TaskState | null;
    usage: NativeUsageRecord[];
    actualBilledUsd: null;
    apiEquivalentUsd: null;
    upstreamHttpCalls: null;
    naiveDelegations?: import("./naive.js").NaiveDelegation[] | undefined;
    schemaVersion: number;
    runId: string;
    variant: "lead_only" | "worker_only" | "worker_selfreview" | "naive" | "fusion";
    dataKind: "synthetic" | "real";
    startedAt: string;
    endedAt: string;
    wallSeconds: number;
    parentSessionId: SessionId;
    workerSessionId: string | null;
    taskId: TaskId;
    nativeRequests: number;
    protocolComplete: boolean;
    artifactPass: null;
    workerParentSessionId: SessionId | null;
    workerSessions: {
        sessionId: SessionId;
        parentSessionId: SessionId | undefined;
        eventsFile: string;
    }[];
}>;
export { NativeRequestBudget };
