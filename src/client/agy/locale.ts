/**
 * Locale plumbing for the built-in AGY console.
 *
 * Ported from dsh-agy-worker (`src/client/index.ts`), MIT License,
 * Copyright (c) 2026 dsh-agy-worker contributors. See docs/ATTRIBUTION-AGY.md.
 *
 * Fusion's client entry already follows DSH's `ctx.locale` for its own copy. This
 * module gives the ported console the same service without making it a hard
 * dependency: when no locale service was bound, the console falls back to the
 * browser language over its own dictionaries — which is what the standalone
 * plugin did on a host without `dsh-client-locale`.
 */
import { useEffect, useState } from 'react'
import { NS, en, zh, type AgyLocaleKey } from './locales.js'

/** The slice of DSH's client locale service this console uses. */
export interface AgyLocaleSource {
  /** Bind the `agy-worker` namespace to a `(key, params) => string` translator. */
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
  /** Contribute one language's dictionary under a namespace. */
  register(namespace: string, language: string, dictionary: Record<string, string>): () => void
  /** Add a language the Host catalog does not own yet. */
  addLanguage(language: { id: string; label: string; fallback: string }): () => void
  /** Subscribe to language/dictionary changes. */
  subscribe(listener: () => void): () => void
  /** Current catalog snapshot, when the service exposes one. */
  getSnapshot?(): { locales?: readonly { id: string }[] }
}

let bound: AgyLocaleSource | undefined
const listeners = new Set<() => void>()
const notify = (): void => { for (const listener of [...listeners]) listener() }

/** Bind the Host locale service; returns the disposer the client entry owns. */
export function bindAgyLocale(source: AgyLocaleSource): () => void {
  bound = source
  notify()
  return () => {
    if (bound !== source) return
    bound = undefined
    notify()
  }
}

const activeLanguage = (): 'zh' | 'en' =>
  (typeof navigator === 'undefined' ? 'en' : navigator.language).toLowerCase().startsWith('zh') ? 'zh' : 'en'

/** The fallback translator: the console's own dictionaries, no Host service. */
function fallbackTranslate(key: AgyLocaleKey, params?: Record<string, unknown>): string {
  const dictionary = (activeLanguage() === 'zh' ? zh : en) as Record<string, string>
  const template = dictionary[key] ?? (en as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]))
}

/** The console's translator: Host locale when bound, browser language otherwise. */
export function useAgyTranslation(): (key: AgyLocaleKey, params?: Record<string, unknown>) => string {
  const [, rerender] = useState(0)
  useEffect(() => {
    const listener = () => rerender(revision => revision + 1)
    listeners.add(listener)
    const unsubscribe = bound?.subscribe(listener)
    return () => {
      listeners.delete(listener)
      unsubscribe?.()
    }
  }, [])
  if (bound === undefined) return fallbackTranslate
  const translate = bound.bind(NS)
  return (key: AgyLocaleKey, params?: Record<string, unknown>) => {
    const text = translate(key, params)
    return text === key ? fallbackTranslate(key, params) : text
  }
}
