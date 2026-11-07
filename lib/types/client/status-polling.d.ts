import type { FusionStatus } from '../status.js';
interface Snapshot {
    sessionId: string;
    status?: FusionStatus;
    failed: boolean;
}
/**
 * One in-flight read per mounted session; collapsed hints still discover new attention states.
 * `live` asks for the fast cadence whenever the task is running, for a view whose whole
 * purpose is the current stage (the role and permission of the model working now).
 */
export declare function useFusionStatus(sessionId: string, expandedTask: string | undefined, attentionOnly?: boolean, live?: boolean): Snapshot | undefined;
export {};
