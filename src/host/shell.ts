/**
 * The native shell tool the Host mounts on this platform. cordis.patch.yml
 * disables tool-bash on win32 and mounts tool-pwsh instead; elsewhere the
 * bash tool is the native shell. Safety gates must apply to whichever shell
 * tool issued the call, so checks use {@link isShellTool}, while defaults
 * and probes use {@link nativeShellTool} — the tool that actually exists.
 */
export const nativeShellTool: 'bash' | 'pwsh' = process.platform === 'win32' ? 'pwsh' : 'bash'

export const isShellTool = (name: string): name is 'bash' | 'pwsh' => name === 'bash' || name === 'pwsh'

/** Command text the prompt layer names for the platform's native shell. */
export const nativeShellDescription = process.platform === 'win32' ? 'pwsh' : 'bash'

/**
 * Windows shells this Host can actually spawn for a read-only probe, most
 * preferred first.
 *
 * The native shell *tool* is always `pwsh`: the Harness mounts it and it is what
 * a Worker's commands run in. The *executable* is a separate question, and
 * Windows answers it in two ways:
 *
 * - `pwsh` is PowerShell 7. The README requires it, and DSH mounts `tool-pwsh`
 *   only when it can be started.
 * - `powershell` is Windows PowerShell 5.1, present on every Windows
 *   installation since 7. A machine without PowerShell 7 still runs DSH and
 *   still runs Fusion's read-only probes; it just cannot take the `pwsh` name.
 *
 * Probing only `pwsh` made {@link probeMissingPrograms} throw ENOENT and report
 * "inconclusive" on such a machine, which silently disabled the pre-delegation
 * check that names a missing interpreter instead of failing the task later.
 * The probe script is deliberately written to the 5.1 subset (`Get-Command`,
 * `Write-Output`, no `??`, no ternaries), so both shells answer identically.
 */
export const probeShells: readonly string[] = process.platform === 'win32' ? ['pwsh', 'powershell'] : ['bash']

/**
 * Environment variable names that must not reach a probe child process: the
 * Host's own configuration and anything credential-shaped.
 */
export const probeEnvironmentDrop = (key: string, value: string | undefined): boolean =>
  value === undefined || /KEY|PASSWORD|SECRET|TOKEN/i.test(key) || key.toUpperCase().startsWith('DSH_')
