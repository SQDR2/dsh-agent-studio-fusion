/**
 * Copy a database and its open sidecar files into a new directory.
 *
 * This is the fallback for an installation whose old and new plugin
 * directories sit on different filesystems, where a directory move cannot
 * work. Only the files this plugin owns are copied and removed; anything else
 * a user left in the directory stays where it is.
 *
 * @param legacy - directory the previous name used.
 * @param next - directory the current name uses.
 * @param filename - database file name inside both directories.
 * @returns whether the database was copied.
 */
export declare function copyLegacyStateFile(legacy: string, next: string, filename?: string): boolean;
/**
 * Carry a plugin-owned directory over to the name this release uses.
 *
 * A rename must keep the state it already has: the Fusion ledger holds every
 * task, brief and artifact, so an upgrade that starts an empty store beside
 * the old one silently loses the user's work. A directory move is tried first
 * so a live database is never copied while another process has it open; a
 * cross-device installation falls back to {@link copyLegacyStateFile}.
 *
 * @param legacy - directory the previous name used.
 * @param next - directory the current name uses.
 * @param filename - database file name inside both directories.
 * @returns whether a legacy directory was adopted.
 */
export declare function adoptLegacyStateDirectory(legacy: string, next: string, filename?: string): boolean;
