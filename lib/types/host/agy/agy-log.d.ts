import type { ManagedAccount } from './pool-types.js';
/** Same home resolution quota.ts uses for per-account credential access. */
export declare function agyHomeDirFor(account: ManagedAccount | undefined): string;
export declare function agyLogDir(homeDir: string): string;
/** Names of the cli-*.log files present right now (cheap readdir). */
export declare function snapshotAgyLogs(homeDir: string): Set<string>;
/**
 * Concatenated text of the log files THIS run created (present now, absent
 * from the pre-spawn snapshot), newest first. Returns '' when the run wrote no
 * readable log — callers must treat that as "no evidence", never as proof
 * either way.
 */
export declare function readAgyRunLogText(homeDir: string, before: ReadonlySet<string>): string;
