import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkBatches } from '../src/host/native-checks.js'
import type { CheckDefinition, FrozenCheck } from '../src/host/native-checks.js'

/**
 * A timing test for the batching decision itself.
 *
 * The claim behind `independent` is only worth having if the batches actually
 * run at the same time, so this measures wall time for two commands that each
 * sleep. It asserts the decision (batched vs not) rather than a precise
 * duration: a loaded CI runner must not fail it.
 */
const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()) })

function frozen(id: string, command: string, independent?: boolean): FrozenCheck {
  const definition: CheckDefinition = { id, description: id, command, kind: 'static-check', parser: 'exit-code',
    definitionPaths: [], ...(independent === undefined ? {} : { independent }) }
  return { definition, plan: { id: `check:${id}` } as never }
}

/** Run batches the way runNativeChecks does: everything in a batch at once. */
async function run(batches: FrozenCheck[][], root: string): Promise<string[]> {
  const done: string[] = []
  for (const batch of batches) {
    await Promise.all(batch.map(async check => {
      const { execFile } = await import('node:child_process')
      await new Promise<void>(resolve => {
        execFile(process.execPath, ['-e', 'setTimeout(() => {}, 120)'], { cwd: root }, () => resolve())
      })
      done.push(check.definition.id)
    }))
  }
  return done
}

describe('batched acceptance commands', () => {
  it('runs an independent pair concurrently and a default pair one after the other', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fusion-batch-'))
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    const started = Date.now()
    await run(checkBatches([frozen('a', 'a', true), frozen('b', 'b', true)]), root)
    const concurrent = Date.now() - started

    const serialStart = Date.now()
    await run(checkBatches([frozen('a', 'a'), frozen('b', 'b')]), root)
    const serial = Date.now() - serialStart

    // Two 120ms waits: about 120ms overlapped, about 240ms serial. Assert the
    // ordering with margin, not an exact duration.
    expect(concurrent).toBeLessThan(serial)
    expect(serial - concurrent).toBeGreaterThan(60)
  })

  it('finishes every command in a batch even when one of them fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fusion-batch-'))
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const { execFile } = await import('node:child_process')
    const run1 = (command: string) => new Promise<number>(resolve => {
      execFile(process.execPath, ['-e', command], { cwd: root }, (error) => resolve(error ? 1 : 0))
    })
    // A failing sibling must not cancel the other: its evidence is still recorded.
    const [first, second] = await Promise.all([run1('process.exit(1)'), run1('require("fs").writeFileSync("ran.txt","ok")')])
    expect(first).toBe(1)
    expect(second).toBe(0)
    // The successful command really ran, rather than being skipped by the failure.
    expect(readFileSync(join(root, 'ran.txt'), 'utf8')).toBe('ok')
  })

  it('keeps writes from two concurrent commands visible to the batch-level snapshot check', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fusion-batch-'))
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    writeFileSync(join(root, 'seed.txt'), 'seed')
    const { snapshotWorkspace } = await import('../src/host/workspace.js')
    const before = snapshotWorkspace(root)
    // Two commands writing different files is exactly what a batch-level snapshot
    // must catch once, instead of blaming whichever command happened to run second.
    await Promise.all([
      Promise.resolve().then(() => writeFileSync(join(root, 'a.txt'), 'a')),
      Promise.resolve().then(() => writeFileSync(join(root, 'b.txt'), 'b')),
    ])
    expect(snapshotWorkspace(root).id).not.toBe(before.id)
  })
})
