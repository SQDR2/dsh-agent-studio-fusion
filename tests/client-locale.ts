import { vi } from 'vitest'

/**
 * Pin the UI language for a client test. Without a bound `ctx.locale`, `useLang`
 * falls back to `navigator.language`, which is the machine's locale: assertions on
 * rendered copy then pass or fail depending on where the suite runs. Stub the
 * navigator for the test and let `vi.unstubAllGlobals()` restore it.
 */
export function pinLanguage(language: 'zh-CN' | 'en-US'): void {
  vi.stubGlobal('navigator', { ...globalThis.navigator, language, languages: [language] })
}
