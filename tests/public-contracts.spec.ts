import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `contracts/fusion.ts` is a published entry point (`package.json` maps
 * `"./contracts"` to it) and is not imported by any source file, so nothing in
 * the build notices when it falls behind `src/contracts.ts`. It drifted exactly
 * that way: `WorkOrder.mode`, `PairProfile.interactionMode`/`workflowPolicy`,
 * the `'auto'` cache mode and 12 exported types were missing, and the
 * `FusionEvent` union stopped at 8 of the 30 event kinds.
 *
 * These assertions read both files as text. That is deliberately shallow: it
 * catches the drift that actually happened (a member added on one side only)
 * without needing the two files to share an import graph, which they cannot
 * because the public copy declares no runtime values.
 */
const root = join(import.meta.dirname, '..')
const source = readFileSync(join(root, 'src/contracts.ts'), 'utf8')
const published = readFileSync(join(root, 'contracts/fusion.ts'), 'utf8')

/** Exported type and interface names, which must match one for one. */
function exportedNames(text: string): string[] {
  return [...text.matchAll(/^export (?:interface|type) (\w+)/gm)].map(match => match[1]!).sort()
}

/** Every event kind the union enumerates, in declaration order. */
function eventKinds(text: string): string[] {
  return [...text.matchAll(/EventEnvelope<'([^']+)'/g)].map(match => match[1]!)
}

/** Member names of one `interface` block, read up to its closing brace. */
function interfaceMembers(text: string, name: string): string[] {
  const start = text.indexOf(`export interface ${name} {`)
  if (start < 0) return []
  const end = text.indexOf('\n}', start)
  const body = text.slice(start, end < 0 ? undefined : end)
  return [...body.matchAll(/^\s{2}(\w+)(\??):/gm)].map(match => `${match[1]}${match[2]}`).sort()
}

describe('the published contracts entry point matches the source contracts', () => {
  it('exports the same type and interface names', () => {
    // `TerminalPhase` is the one intentional addition: the source exports a
    // runtime `TERMINAL_PHASES` set, which a declaration-only file cannot.
    expect(exportedNames(published).filter(name => name !== 'TerminalPhase'))
      .toEqual(exportedNames(source))
  })

  it('enumerates every FusionEvent kind, in the same order', () => {
    expect(eventKinds(published)).toEqual(eventKinds(source))
    // A union that stops early is the failure this guards: assert the count so
    // a future addition to the source cannot pass by adding nothing.
    expect(eventKinds(published).length).toBeGreaterThanOrEqual(30)
  })

  it('keeps WorkOrder mode, which decides whether a task may write at all', () => {
    expect(interfaceMembers(published, 'WorkOrder')).toEqual(interfaceMembers(source, 'WorkOrder'))
    expect(published).toContain("mode?: 'explore' | 'implement' | 'text'")
  })

  it('keeps the PairProfile fields that select enforced behaviour', () => {
    expect(interfaceMembers(published, 'PairProfile')).toEqual(interfaceMembers(source, 'PairProfile'))
    expect(published).toContain("interactionMode?: 'model-like'")
    expect(published).toContain("workflowPolicy?: 'enforced-v1' | 'enforced-v2' | 'enforced-v3'")
  })

  it('keeps the automatic cache mode, not just on and off', () => {
    // A `Record<Role, boolean>` here would tell consumers that 'auto' — the
    // mode that arms keepalive only after a measured cache hit — cannot exist.
    expect(published).toContain("cacheKeepalive?: Readonly<Record<Role, boolean | 'auto'>>")
  })

  it('declares no runtime values, so nothing it exports is undefined at run time', () => {
    // The file is a type surface. A `const` or `declare const` would either emit
    // nothing (undefined for consumers) or break the package's "types only" contract.
    expect(published).not.toMatch(/^export (?:declare )?(?:const|let|var|function|class) /m)
  })
})
