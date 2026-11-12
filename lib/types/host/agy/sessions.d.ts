export interface SessionBinding {
    conversationId: string;
    /** DSH message count at bind/update time (digest watermark). */
    lastMessageCount: number;
    updatedAt: number;
    model?: string;
    /**
     * Attachment ids already forwarded to this agy conversation. Images ride
     * as staged files referenced from the prompt; without this watermark every
     * tool-hop continuation re-attached the whole history's screenshots.
     * Capped (see `SENT_IMAGE_IDS_MAX`) — order is oldest-first.
     */
    sentImageIds?: string[];
    /**
     * The last turn on this conversation was cut mid-flight (Stop button, steer
     * preemption, idle watchdog). agy's server-side turn has no finalized reply,
     * so the next prompt carries an explicit "do not continue that unfinished
     * work" boundary — without it the model answers the interrupted question
     * instead of the newest user message.
     */
    interrupted?: boolean;
}
/** Keep the binding file small; the oldest ids are dropped first. */
export declare const SENT_IMAGE_IDS_MAX = 64;
export declare class SessionStore {
    private readonly file;
    private data;
    /** Keys written by THIS process since the last persist. */
    private readonly dirty;
    /** Keys deleted by THIS process since the last persist. */
    private readonly removed;
    constructor(file: string);
    private load;
    get(key: string): SessionBinding | undefined;
    set(key: string, b: SessionBinding): void;
    delete(key: string): void;
    clear(): void;
    all(): Readonly<Record<string, SessionBinding>>;
    /**
     * Purge bindings associated with accounts that no longer exist in the pool.
     * Prevents deleted account ids from lingering in sessions.json.
     */
    cleanupStaleAccounts(validAccountIds: Set<string>): void;
    /**
     * Atomic write: tmp file + rename, MERGING with whatever another host
     * process wrote in the meantime (web + headless share this file). Only the
     * keys this process touched are overwritten and only the keys it deleted are
     * dropped, so a concurrent writer's bindings survive instead of being
     * clobbered — which used to cost a session its agy conversation (fresh
     * digest-only prompt, or a binding pointing at the wrong conversation).
     */
    private persist;
}
