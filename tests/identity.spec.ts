import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FUSION_MODEL, FUSION_PROVIDER, FUSION_SELECTION_LABELS, LEGACY_FUSION_PROVIDER, LEGACY_PLUGIN_NAME, PACKAGE_NAME,
  PLUGIN_NAME,
  isCurrentFusionSelection, isFusionProvider, isFusionSelection,
} from '../src/identity.js'
import { FUSION_SOURCE_KIND, FUSION_SOURCE_KINDS, isFusionSourceKind } from '../src/message-source.js'
import { adoptLegacyLeaseRoot, leasePath } from '../src/execution/write-lease.js'
import { adoptLegacyStateDirectory, copyLegacyStateFile as adoptLegacyStateFile } from '../src/store-migration.js'

const root = join(import.meta.dirname, '..')

describe('installed plugin identity', () => {
  it('publishes the renamed package without touching the manifest contract', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(manifest.name).toBe(PACKAGE_NAME)
    // The registry identity and the runtime identity are separate on purpose:
    // moving into a scope must not move the state directory or the patch row.
    expect(PLUGIN_NAME).toBe('dsh-fusion')
    expect(manifest.name).not.toBe(PLUGIN_NAME)
    // Entry points move with the package name; both halves must resolve.
    expect(manifest.exports['.'].import).toBe('./lib/dsh-fusion.js')
    expect(manifest.exports['.'].types).toBe('./lib/types/dsh-fusion.d.ts')
    expect(manifest.repository.url).toContain('dsh-fusion')
  })

  it('registers the bundle patch and dev-server entry under the same id', () => {
    const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    // The row id is the runtime identity; `name` is the specifier pnpm installed,
    // which is the package name and therefore scoped.
    expect(patch).toContain('- id: dsh-fusion')
    expect(patch).toContain(`name: '${PACKAGE_NAME}'`)
    expect(patch).not.toMatch(/^\s*name: dsh-model-fusion$/m)
    const dshx = readFileSync(join(root, 'dshx.yml'), 'utf8')
    expect(dshx).toContain('id: dsh-fusion')
    expect(dshx).toContain('entry: src/dsh-fusion.ts')
    expect(dshx).toContain('lib/dsh-fusion.js')
  })

  it('keeps the old package name only where an upgrade has to read it', () => {
    const legacy = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(legacy.name).not.toBe(LEGACY_PLUGIN_NAME)
    expect(JSON.stringify(legacy)).not.toContain(LEGACY_PLUGIN_NAME)
  })
})

describe('pre-rename compatibility', () => {
  it('reads the previous provider route as this plugin and writes only the current one', () => {
    expect(FUSION_PROVIDER).toBe('dsh-fusion')
    expect(isFusionProvider(FUSION_PROVIDER)).toBe(true)
    expect(isFusionProvider(LEGACY_FUSION_PROVIDER)).toBe(true)
    expect(isFusionProvider('openai-completions')).toBe(false)
    expect(isFusionSelection({ provider: LEGACY_FUSION_PROVIDER, model: FUSION_MODEL })).toBe(true)
    // A legacy route is readable but no longer the intent to record.
    expect(isCurrentFusionSelection({ provider: LEGACY_FUSION_PROVIDER, model: FUSION_MODEL })).toBe(false)
    expect(isCurrentFusionSelection({ provider: FUSION_PROVIDER, model: FUSION_MODEL })).toBe(true)
  })

  it('suppresses the native switch notice under either spelling', () => {
    expect(FUSION_SELECTION_LABELS).toContain('dsh-fusion/auto')
    expect(FUSION_SELECTION_LABELS).toContain('dsh-model-fusion/auto')
    expect(FUSION_SELECTION_LABELS).toHaveLength(2)
  })

  it('reads both producer kinds so an existing session keeps its context', () => {
    expect(FUSION_SOURCE_KIND).toBe('plugin:dsh-fusion')
    expect(isFusionSourceKind('plugin:dsh-fusion')).toBe(true)
    expect(isFusionSourceKind('plugin:dsh-model-fusion')).toBe(true)
    expect(isFusionSourceKind('user')).toBe(false)
    expect(isFusionSourceKind(undefined)).toBe(false)
    expect(FUSION_SOURCE_KINDS).toHaveLength(2)
  })

  it('keeps the previous HTTP path answerable for a tab holding the old bundle', () => {
    const host = readFileSync(join(root, 'src/dsh-fusion.ts'), 'utf8')
    expect(host).toContain('FUSION_API_PATH, handler: apiHandler')
    expect(host).toContain('LEGACY_FUSION_API_PATH, handler: apiHandler')
  })

  it('carries the existing ledger over instead of starting an empty store', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'fusion-legacy-store-'))
    const legacy = join(workspace, 'dsh-model-fusion'), current = join(workspace, 'dsh-fusion')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'state.sqlite'), 'ledger')
    writeFileSync(join(legacy, 'state.sqlite-wal'), 'wal')
    expect(adoptLegacyStateDirectory(legacy, current)).toBe(true)
    expect(readFileSync(join(current, 'state.sqlite'), 'utf8')).toBe('ledger')
    expect(readFileSync(join(current, 'state.sqlite-wal'), 'utf8')).toBe('wal')
    expect(existsSync(legacy)).toBe(false)
    // An existing ledger always wins: a downgrade-then-upgrade keeps new rows.
    writeFileSync(join(current, 'state.sqlite'), 'newer')
    expect(adoptLegacyStateDirectory(legacy, current)).toBe(false)
    expect(readFileSync(join(current, 'state.sqlite'), 'utf8')).toBe('newer')
  })

  it('leaves a foreign file in the old directory alone', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'fusion-foreign-store-'))
    const legacy = join(workspace, 'dsh-model-fusion'), current = join(workspace, 'dsh-fusion')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'state.sqlite'), 'ledger')
    writeFileSync(join(legacy, 'notes.txt'), 'user file')
    // The copy path removes what it copied, never a file this plugin did not write.
    expect(adoptLegacyStateFile(legacy, current)).toBe(true)
    expect(readFileSync(join(current, 'state.sqlite'), 'utf8')).toBe('ledger')
    expect(readFileSync(join(legacy, 'notes.txt'), 'utf8')).toBe('user file')
  })

  it('adopts a durable write lease written before the rename', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'fusion-legacy-lease-'))
    const legacy = join(workspace, 'legacy'), current = join(workspace, 'current')
    // The registry outlives a process: a lock written under the old name still
    // names a holder, so an upgrade must carry it over rather than start empty.
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'held.lock'), '{"holder":"session-a"}')
    expect(adoptLegacyLeaseRoot(current, legacy)).toBe(true)
    expect(readFileSync(join(current, 'held.lock'), 'utf8')).toBe('{"holder":"session-a"}')
    expect(existsSync(legacy)).toBe(false)
    // Adopting twice is a no-op: the current registry already exists.
    expect(adoptLegacyLeaseRoot(current, legacy)).toBe(false)
    expect(leasePath('/tmp/workspace', current)).toMatch(/current[\\/][0-9a-f]{24}\.lock$/)
  })
})
