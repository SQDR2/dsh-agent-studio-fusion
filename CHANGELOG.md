# Changelog

Release notes for `@sqdr2/dsh-fusion`. Newest first.

## Origin

This package is a fork of [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion). 0.3.0 is the
first release published under this name, and it branches from upstream 0.2.9. Upstream 0.2.10 and 0.2.11 landed after
that point and are **not** included here.

Earlier versions — `dsh-model-fusion` 0.2.0 through 0.2.11, and the pre-0.3.0 tags in this repository's history — were
not published as `@sqdr2/dsh-fusion`, so they are not listed here. Their notes live in the upstream repository, under its
own tags and releases.

Entry format: what changed, then what was actually validated. "Not claimed" lines mark what a release did *not* test —
read them before assuming a platform is covered.

## Unreleased

### Changes

- Fusion is no longer limited to one saved pair. The sidebar panel now manages a list of combos (add, rename, delete),
  and **each combo is its own entry in the native model menu** (`Fusion · <name>`), so several conversations can run
  different Lead/Sidekick pairs at the same time.
- Each combo advertises its own Lead's input modalities and freezes its own profile, so a conversation keeps the pair it
  selected even after the list is edited, reordered or a combo is deleted. Picking another combo inside a conversation
  drains the current task and starts a new one, exactly like leaving Fusion.
- Up to 6 combos. The first combo keeps the historical model id `auto`, and a pre-combo `settings:profile` is migrated
  into it (named "自动") on read, so durable selections, frozen bindings and deploy-time profile files keep working. The
  first combo is still mirrored into `settings:profile` for an older tab or a downgrade.
- An existing tab running the previous bundle can still save: it sends one pair and edits the first combo, leaving the
  others alone.
- The switch-notice filter now recognizes every combo id, including the bare `auto → pair-xxxxxxxx` form the native menu
  emits when two combos of this provider replace each other.

### Build

- `pnpm build` no longer requires a harness checkout with `tools/dshx`. It still uses that harness-owned builder when
  `DSHX_HARNESS` provides it, and otherwise emits the same two artifacts with a local `esbuild` pass (now a
  devDependency): `lib/dsh-fusion.js` as plain ESM with every package external, `lib/client.js` as the CommonJS body the
  Harness module loader expects.

### Validation

- `pnpm test` (52 files, 389 tests), `tsc -p tsconfig.json --noEmit`, and the native Host suite
  (`DSHX_HARNESS=… npx vitest run --config vitest.host.config.mts`: 263 passed, 1 skipped).
- Rebuilt `lib/` and loaded both artifacts in Node: the Host module exports `apply`/`Config`/`name`, and the client
  bundle registers under `@sqdr2/dsh-fusion` and still exports `apply`/`inject`/`name`/`FUSION_PANEL_ID`/`FusionPanelIcon`.
- New `tests/pairs.spec.ts` (migration, id assignment, name/limit validation, compare-and-swap, per-combo profile
  identity) and `tests/fusion-combos.spec.ts` (list/rename/add/delete and whole-list save payload).

## 0.3.2 — 2026-11-05

Verification release. No runtime behaviour changed from 0.3.0, and the package is identical to it apart from the version
field.

0.3.1 was meant to be this release, but its CI run failed before publishing: `tests/status-index.spec.ts` timed out at
5000ms while finishing in a fraction of a second locally. The fixture built 600 rows with one autocommit each, which a
CI runner's disk cannot absorb inside a limit meant for unit tests. Those fixtures now use a single transaction, and the
two tests that migrate and backfill a real database declare a 60s budget.

## 0.3.1 — 2026-11-05

Verification release. No runtime behaviour changed from 0.3.0, and the package is byte-identical to it apart from the
version field.

0.3.0 was published by hand with a granular token, before this repository could publish from CI: Actions are disabled by
default on forks, and a trusted publisher can only be added to a package that already exists. Both are now in place, so
0.3.1 exists to prove the OIDC path end to end — the tag-push workflow builds, tests and publishes without any stored
token, and the result carries a provenance attestation naming the commit it was built from.

## 0.3.0 — 2026-11-05

First release under the name `@sqdr2/dsh-fusion`, branching from upstream `dsh-model-fusion` 0.2.9. Everything 0.2.9
does is still here; the changes below are the fork's.

The package was renamed, so install `@sqdr2/dsh-fusion` once — an installed `dsh-model-fusion` is not upgraded in place.
The plugin id stays `dsh-fusion`, so the rename moves code only, not data.

### Changes

- The Fusion entry moved from **Settings → Fusion** to its own left-sidebar panel, and the panel body scrolls inside the
  main slot instead of clipping the form and history table on a short window.
- A role on a bridge route (`antigravity`, i.e. `dsh-agy-worker` / `dsh-agy-link`) can now reach the Host tools. That
  route may only report a step as `agy_tool`, which the role ceiling never carried, so a delegation degraded to prose and
  the Host reported `WORKER_TOOLS_UNREACHABLE`. The transport is unioned into the ceiling when this Host registers it,
  for the Lead as well as the Sidekick. Full diagnosis: [docs/WORKER-TOOLS-UNREACHABLE.md](docs/WORKER-TOOLS-UNREACHABLE.md).
- A bridged Sidekick can now bind its brief and report back. Such a route runs the call in its own loop under a
  bridge-local id, so `fusion_submit_result` was refused as "Worker tool requires a complete native model request" and
  the task stalled. A bridged call is accepted for the message that emitted the transport; the native path is unchanged
  and still preferred.
- A task whose Sidekick route cannot reach the tools at all has an exit: the verdict is recorded on the runtime record,
  `fusion_wait` re-reports it, and `fusion_delegate` may replace the dead order instead of leaving the task in
  `WORKER_RUNNING` with no way out.
- A frozen scope no longer deadlocks a task. A glob such as `allowedPaths: ['lib/types/**']` matched nothing, widening
  was refused because the files it wanted to record already differed, and the scope could not be cleared. Globs match,
  widening is compared against the delegation base, and the scope can be cleared explicitly.
- History records can be deleted again. Deletion now asks the coordinator, which is the only authority that sees live
  Agents, tool calls, jobs and write leases, so a replaced process no longer leaves an undeletable `running` task and a
  live task is no longer deleted out from under itself. A 409 names the resource that held it.
- Usage, the task list, cache keepalive and history are each a collapsible box, collapsed by default, so the model pair
  stays above the fold.

### Compatibility after the rename

- Message source kinds are read under both spellings (`plugin:dsh-fusion`, `plugin:dsh-model-fusion`) and written only
  under the new one. Recorded history is never rewritten.
- A session that selected Fusion before the rename stored `dsh-model-fusion/auto`; it is rewritten to `dsh-fusion/auto`
  when the plugin installs its selection, so the next turn dispatches under a registered provider.
- `$DSH_HOME/plugins/dsh-model-fusion/` is migrated to `$DSH_HOME/plugins/dsh-fusion/` on first start, with a copy
  fallback across filesystems that removes only the files it copied.
- Durable write leases are adopted the same way, and a lock written under the old name still blocks a new writer rather
  than being taken over.
- The panel's HTTP routes are now `/api/fusion`; `/api/model-fusion` stays registered for a browser tab still holding the
  previous client bundle.

### Validation

Type checking passes, all 379 unit tests pass, and `lib/` was rebuilt from the tagged source. The native Host suite passes
263 tests with one Windows-only test skipped, on the pinned Host checkout. No model calls were made for this release, and
the plugin is not installed or activated in a running Host by this preparation.

Install with `dsh plugin --profile web add @sqdr2/dsh-fusion`, or `github:SQDR2/dsh-fusion` from the repository, which
ships the built `lib/`. See [INSTALL.md](INSTALL.md) / [INSTALL.zh.md](INSTALL.zh.md).
