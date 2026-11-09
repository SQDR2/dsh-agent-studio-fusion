import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
/** Plugin-owned presentation record; never appended to a native Session. */
export interface FusionActivity {
    schemaVersion: 1;
    taskId: string;
    childSessionId: string;
    parentCallId: string;
    turn: number;
    step: number;
    anchorSeq: number;
    source: SessionEvent<'tool/call'> | SessionEvent<'tool/result'>;
}
/** Namespaced display identity; the unchanged native identity remains in source. */
export declare function activityCallId(activity: FusionActivity): string;
export interface FusionActivityPage {
    events: FusionActivity[];
    cursor: number;
    more: boolean;
    done: boolean;
}
/** A recorded agy step replayed through a bridge route's transport. */
export interface MirrorStep {
    run: string;
    step: number;
    tool: string;
}
/** Recover the recorded step cursor and real tool from a generated mirror wrapper. */
export declare function mirrorStepInvocation(code: string): MirrorStep | undefined;
/**
 * Whether one child tool event is real Worker activity this plugin presents in
 * the parent conversation. Answering this needs the recorded arguments only to
 * recognize the bounded Code Mode wrapper; nothing is executed or replayed.
 */
export declare function presentsActivity(name: string, rawArguments: string): boolean;
