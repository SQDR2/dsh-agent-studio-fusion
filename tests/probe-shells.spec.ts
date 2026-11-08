import { describe, expect, it } from 'vitest'
import { probeEnvironmentDrop, probeShells } from '../src/host/shell.js'

/**
 * Windows exposes its shell under two names and a machine may have only one.
 * `pwsh` is PowerShell 7 (the README's requirement, and what the Harness mounts
 * as `tool-pwsh`); `powershell` is the 5.1 install present on every Windows
 * since 7. Probing only `pwsh` made the pre-delegation program check throw
 * ENOENT and report "inconclusive" on a machine without PowerShell 7, which
 * silently turned the check off instead of reporting the missing interpreter.
 */
describe('probe shells', () => {
  it('offers the PowerShell 7 name first and the always-present 5.1 fallback second on Windows', () => {
    if (process.platform !== 'win32') return
    expect(probeShells).toEqual(['pwsh', 'powershell'])
  })

  it('uses only bash off Windows', () => {
    if (process.platform === 'win32') return
    expect(probeShells).toEqual(['bash'])
  })

  it('never offers an empty or duplicated shell name', () => {
    // The probe loop treats "no shell answered" as inconclusive, so a blank entry
    // would silently burn the only attempt that could have answered.
    expect(probeShells.length).toBeGreaterThan(0)
    expect(probeShells.every(shell => shell.trim().length > 0)).toBe(true)
    expect(new Set(probeShells).size).toBe(probeShells.length)
  })
})

describe('probe environment filtering', () => {
  it('drops unset values so a child process never receives the string "undefined"', () => {
    expect(probeEnvironmentDrop('ANY_NAME', undefined)).toBe(true)
  })

  it('drops credential-shaped names in any case', () => {
    for (const key of ['OPENAI_API_KEY', 'api_key', 'GITHUB_TOKEN', 'db_PASSWORD', 'client_secret']) {
      expect(probeEnvironmentDrop(key, 'value')).toBe(true)
    }
  })

  it('drops the Host configuration namespace', () => {
    expect(probeEnvironmentDrop('DSH_HOME', '/home/user/.dsh')).toBe(true)
    expect(probeEnvironmentDrop('dsh_harness', 'x')).toBe(true)
  })

  it('keeps ordinary variables the shell itself needs to resolve a program', () => {
    // PATH is the point of the probe: dropping it would make every program look missing.
    for (const key of ['PATH', 'PATHEXT', 'HOME', 'USERPROFILE', 'SystemRoot', 'LANG']) {
      expect(probeEnvironmentDrop(key, 'value')).toBe(false)
    }
  })
})
