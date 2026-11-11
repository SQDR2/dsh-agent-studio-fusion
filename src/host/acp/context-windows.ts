/**
 * Context-window sizes an ACP agent reported, remembered across restarts.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const ONE_MILLION = 1_000_000

interface Logger {
  warn: (...args: unknown[]) => void
}

/**
 * Window implied by a model's own id, name or description. ACP has no field for it before
 * a turn runs, but agents spell 1M-context variants with a distinct "1m" token
 * (`claude-fable-5-1[1m]`, `Opus 4.7 (1M context)`); `\b` keeps "10m" from matching.
 */
export function inferContextWindow(...texts: readonly (string | undefined)[]): number | undefined {
  return texts.some(text => text !== undefined && /\b1m\b/i.test(text)) ? ONE_MILLION : undefined
}

function keyOf(route: string, model: string): string {
  return `${route}\u0000${model}`
}

/**
 * Context window sizes agents reported through `usage_update`, keyed by route and model.
 * DSH resolves a model's window before each request, so a size learned only in memory
 * leaves the first turn after every restart on the configured default.
 */
export class ContextWindows {
  private readonly sizes = new Map<string, number>()
  private saving: Promise<void> = Promise.resolve()

  constructor(private readonly file?: string, private readonly logger?: Logger) {
    if (file === undefined)
      return
    try {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>
      for (const [route, models] of Object.entries(stored)) {
        for (const [model, size] of Object.entries(models)) {
          if (typeof size === 'number' && size > 0)
            this.sizes.set(keyOf(route, model), size)
        }
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.logger?.warn('dsh-fusion: ignoring unreadable ACP context window cache', error)
    }
  }

  get(route: string, model: string): number | undefined {
    return this.sizes.get(keyOf(route, model))
  }

  set(route: string, model: string, size: number): void {
    const key = keyOf(route, model)
    if (this.sizes.get(key) === size)
      return
    this.sizes.set(key, size)
    const file = this.file
    if (file === undefined)
      return
    const snapshot: Record<string, Record<string, number>> = {}
    for (const [entry, value] of this.sizes) {
      const [entryRoute, entryModel] = entry.split('\u0000') as [string, string]
      ;(snapshot[entryRoute] ??= {})[entryModel] = value
    }
    this.saving = this.saving
      .then(async () => {
        mkdirSync(dirname(file), { recursive: true })
        await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`)
      })
      .catch((error: unknown) => {
        this.logger?.warn('dsh-fusion: could not save the ACP context window cache', error)
      })
  }

  /** Settles once every size set so far is on disk. */
  flush(): Promise<void> {
    return this.saving
  }
}
