# Fusion × Antigravity: the side that reports back can finally reach its tools

Investigation behind the corresponding bullet in [CHANGELOG.md](../CHANGELOG.md) 0.3.0. Kept separate from the release
notes because it documents a diagnosis, not a feature.

Session `session-e9722abb-dc4f-4e45-883b-0a883d9c22ba` delegated to a Worker on the `antigravity` route
(`gemini-3.8-flash`) and the whole task ended as prose: `WORKER_TOOLS_UNREACHABLE`.

## What actually happened

`dsh-agy-link` reports a step with `agy_tool`, because `agy` runs the bridged call in its own loop and the adapter only
replays the recorded result. Fusion built each role's ceiling from its own `fusion_*` tools plus `workerTools`, so
`agy_tool` was never advertised, the adapter had no tool-call block it was allowed to emit, and the Worker answered in
text. The Host's diagnosis was correct; the ceiling was wrong. The same wall waits for a Lead on that route: it could not
call `fusion_delegate` either.

## Fix

- Fusion now adds a bridge route's own transport to that role's ceiling (`src/host/route-transport.ts`): `antigravity` →
  `agy_tool`. It is added only when this Host actually registers that tool, and never duplicated if you listed it by hand.
- Both roles get it: the Worker in implement and explore mode, the Lead in every narrowed catalog (enforced and
  role-separated). A text delegation and a completed task keep their exact empty ceiling.
- The transport rides both dispatch paths: 0.2.0 `toolFilter` and the 0.2.1 scope restriction.
- It is presentation, not authority: the replay is exempt from the ceiling check, the read-only and stale-brief gates, the
  write lease, and effect tracking — the real call already ran inside the bridge, where the agent-scope guard applies
  first.
- The `WORKER_TOOLS_UNREACHABLE` text now names what to check on the route side (`mcpBridge on`, `permissionMode skip`,
  `fusion_submit_result` allowlisted) instead of implying the ceiling is still the caller's job.

## Requirements on the bridge route (unchanged)

`mcpBridge: true` (default since dsh-agy-link 0.4.101), `permissionMode: 'skip'` (default), and an allowlist that admits
`fusion_submit_result`.

## Validation

- `pnpm typecheck` clean; `pnpm test` 336 passed (the two pre-existing environment failures, `check-programs` and
  `recovery-panel` locale, fail identically on the untouched tree).
- New: `tests/route-transport.spec.ts` and a host-level case in `native-tests/coordinator.spec.ts` that puts the Worker
  on `antigravity` with `agy_tool` registered and asserts the delegation completes with a report. The host case needs
  `DSHX_HARNESS`; the pinned checkout was not present on the machine at the time, so it was written but not run there.
- The host bundle was rebuilt locally with the Vite already in `node_modules` because `scripts/build.mjs` requires that
  checkout. Re-run `pnpm build` when it is available.

## Post-merge note

Counts and the bundle filename above are as recorded at the time (`lib/dsh-model-fusion.js`). The package was renamed in
0.3.0: the bundle is now `lib/dsh-fusion.js` and the suite has grown since. The diagnosis and the fix have not changed.
