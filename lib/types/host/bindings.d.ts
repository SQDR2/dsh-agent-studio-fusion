import type { Digest, PairProfile, TaskId } from '../contracts.js';
import type { PromptBundle, ResolvedProfile } from '../profile/resolve.js';
import type { SqliteFusionStore } from '../task/sqlite-store.js';
export interface SessionBinding {
    readonly schemaVersion: 1;
    readonly sessionId: string;
    readonly taskId: TaskId;
    readonly selected: boolean;
    /** One native continuable Worker for this selection, across completed tasks. */
    readonly workerId?: string;
    readonly profile: PairProfile;
    readonly prompts: PromptBundle;
}
/**
 * The part of a frozen profile a running session may never change, hashed without the reviewer.
 *
 * The Lead route is pinned to the user's own model choice, and the Sidekick route owns a
 * persistent Worker session whose model cannot be swapped under it; both are part of the
 * identity every task, checkpoint, keepalive row and usage record in the store is bound to,
 * so a rollover that moved either would silently relabel work that already ran.
 *
 * The reviewer is different in kind: it holds no session and is called per candidate with an
 * explicit route that the review record itself names. A combo may therefore name a different
 * reviewer for the next task without rewriting the identity of the last one.
 */
export declare function bindingIdentity(profile: PairProfile): Digest;
/**
 * The frozen profile with the reviewer a combo names now, or undefined when it already names it.
 *
 * Re-deriving is what keeps the digest honest: the task record, the keepalive rows and the
 * usage rows of the successor all name a profile whose body really contains that reviewer,
 * instead of a document whose digest was left pointing at the old one.
 */
export declare function revisedReviewerProfile(profile: PairProfile, prompts: PromptBundle, foreman: PairProfile['foreman']): PairProfile | undefined;
export declare function readBinding(value: unknown, sessionId: string): SessionBinding;
/** Selection is durable and scoped by the native Lead identity, never a global default. */
export declare class BindingRepository {
    private readonly store;
    constructor(store: SqliteFusionStore);
    read(sessionId: string): {
        revision: number;
        binding: SessionBinding;
    } | undefined;
    select(sessionId: string, id: TaskId, resolved: ResolvedProfile): SessionBinding;
    clear(sessionId: string): void;
    /** Reserve identity before native dispatch; an existing selection cannot swap workers. */
    assignWorker(sessionId: string, expectedTask: TaskId, workerId: string): void;
    /**
     * A new native user turn starts a new task while preserving the frozen pair.
     *
     * `profile` is only for the one role a running selection may re-freeze (the reviewer); the
     * Lead and Sidekick routes stay exactly as they were, and `readBinding` below re-derives the
     * document so a profile that does not read back never reaches the store.
     */
    rollover(sessionId: string, expectedTask: TaskId, nextTask: TaskId, profile?: PairProfile): SessionBinding;
    selected(): readonly SessionBinding[];
}
