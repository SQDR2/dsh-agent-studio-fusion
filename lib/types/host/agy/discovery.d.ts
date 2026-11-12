export declare function defaultConversationsDir(): string;
/**
 * Conversations directory for one run's HOME. Secondary pool accounts run
 * under an isolated HOME, so the fallback discovery must watch THEIR
 * conversations dir — snapshotting the system HOME silently never saw those
 * conversation databases (agy-db.ts fixed the same class of bug for its DB
 * readers; this aligns discovery with it).
 */
export declare function conversationsDirFor(accountHome?: string): string;
export interface DirSnapshot {
    dir: string;
    /** name -> mtimeMs */
    files: Map<string, number>;
}
export declare function snapshotConversations(dir?: string): DirSnapshot;
export interface DiffOutcome {
    conversationId: string | null;
    /** more than one new db appeared; picked newest by mtime. */
    ambiguous: boolean;
}
export declare function diffConversations(before: DirSnapshot, dir?: string): DiffOutcome;
