/**
 * Workspace write mutual exclusion for agents Fusion owns.
 *
 * This is the only concurrency rule left between the Lead and its Sidekick: whichever role does
 * not hold the lease is refused an effectful call until the holder finishes. It is a boundary,
 * not a capability cap — both roles run in the user's own sandbox mode, and reads and searches
 * pass through either way.
 *
 * Ordinary sessions are not governed: a foreign lease does not make them read-only.
 * `exempt` covers read tools, Fusion's own control tools and `run_code`. `run_code` is exempt as
 * a wrapper, not as a permission: Code Mode addresses every tool through it, so refusing the
 * wrapper would refuse the reads inside it too, and the lease cannot see into the program it
 * runs. The cost is that a Lead in Code Mode can still write while the Sidekick holds the lease;
 * that window is bounded by the prompt and by the fact that Code Mode never replaces the native
 * catalog (where `write`/`edit` and the shell are guarded individually).
 * The caller passes the lease for this call's cwd only, so another directory is isolated.
 */
export function workspaceWriterDenial(input: {
  fusionOwned: boolean
  exempt: boolean
  cwd?: string
  leaseHolder?: string
  agentId: string
}): string | undefined {
  if (!input.fusionOwned || input.exempt) return undefined
  if (!input.cwd || !input.leaseHolder || input.leaseHolder === input.agentId) return undefined
  return `FUSION_LEAD_WRITE_CONFLICT: workspace writer is ${input.leaseHolder} right now, and Fusion keeps one writer per workspace. `
    + 'Read and search freely, wait for its report, or take over through the documented fusion_takeover path before writing.'
}
