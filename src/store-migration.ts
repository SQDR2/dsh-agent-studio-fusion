import { cpSync, existsSync, mkdirSync, renameSync, rmSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

/** Files SQLite may keep open beside the database itself. */
const SQLITE_SIDECARS = ['-wal', '-shm', '-journal'] as const

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
export function copyLegacyStateFile(legacy: string, next: string, filename = 'state.sqlite'): boolean {
  const source = join(legacy, filename), target = join(next, filename)
  if (existsSync(target) || !existsSync(source)) return false
  try {
    mkdirSync(next, { recursive: true })
    cpSync(source, target)
    for (const suffix of SQLITE_SIDECARS) {
      if (existsSync(`${source}${suffix}`)) cpSync(`${source}${suffix}`, `${target}${suffix}`)
    }
  } catch {
    for (const suffix of ['', ...SQLITE_SIDECARS]) rmSync(`${target}${suffix}`, { force: true })
    return false
  }
  for (const suffix of ['', ...SQLITE_SIDECARS]) rmSync(`${source}${suffix}`, { force: true })
  try {
    rmdirSync(legacy)
  } catch {
    // Another file lives there; the copied database is complete either way.
  }
  return true
}

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
export function adoptLegacyStateDirectory(legacy: string, next: string, filename = 'state.sqlite'): boolean {
  if (existsSync(next) || !existsSync(legacy)) return false
  try {
    renameSync(legacy, next)
    return true
  } catch {
    // Cross-device or a locked directory: copy the database files instead.
  }
  return copyLegacyStateFile(legacy, next, filename)
}
