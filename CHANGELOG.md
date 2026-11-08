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

## 0.3.5 — 2026-11-08

### Changes

- Every message that sent the user to **Settings → Fusion** now points at the sidebar panel, which is where that entry
  has lived since 0.3.0. Thirteen strings were affected: the "configure Fusion first" refusal, the model-menu
  description, the quota and budget notices (with their English copies), the unreachable-route explanation, and the
  composer hint's three states. The old wording named a page that no longer exists, so the one instruction a blocked
  user got was unfollowable.
- `contracts/fusion.ts` — the published `./contracts` subpath — is level with `src/contracts.ts` again. It had fallen
  behind by `WorkOrder.mode` (the field that decides whether a task may write at all), `PairProfile.interactionMode`
  and `workflowPolicy`, the `'auto'` cache-keepalive mode, twelve exported types (`ExplorationReport`, `ReviewResultV2`,
  `OutboxRow` and others) and 22 of the 30 `FusionEvent` kinds. Nothing imports this file, which is why the drift went
  unnoticed; a new parity test reads both files as text and fails on any future divergence.
- Cost is no longer a hard-coded `null`. `usage/pricing.ts` already held a ledger pricer that nothing called; the status
  panel, the history view and `/fusion status` now report what a task cost, what the same tokens would have cost on the
  Lead, and the difference. A model with no rate is reported as **unpriced** rather than priced at zero, and the number
  of requests the figure covers travels with it. `actualBilledUsd` stays `null` on purpose: DSH exposes no per-request
  billed amount, and subscription routes are not billed per token, so the panel says "estimate" and "unknown" instead of
  presenting a conversion as a charge. Rates are seeded from the list prices this project's own benchmark published and
  can be corrected per model from the panel.
- Acceptance commands can now overlap. A check the Lead marks `independent` runs beside one other check instead of
  after it, which shortens the wait after every delivery. The default stays serial: the Host cannot see whether two
  commands share a cache directory, and two runs of the same test framework that share one produce a failure that is not
  about the code. The single-writer lease and the Lead-orchestration lock are deliberately unchanged — the change
  manifest attributes every diff to one work order, so a second concurrent writer would make the scope and
  per-requirement evidence unverifiable. The per-command before/after snapshot moved to batch granularity, because under
  concurrency a sibling's cache write would otherwise fail an innocent command.
- `probeMissingPrograms` no longer assumes PowerShell 7. It spawned `pwsh` by name, so a Windows machine with only
  Windows PowerShell 5.1 (present on every Windows since 7) got `ENOENT`, the probe returned "inconclusive", and the
  pre-delegation check that names a missing interpreter silently stopped running. It now tries `pwsh` and then
  `powershell`; the probe script was already written to the 5.1 subset, so both answer identically.

### Validation

- `pnpm test` (60 files, 447 tests: 446 passed, 1 skipped, 0 failed) and `tsc -p tsconfig.json --noEmit`. The suite's
  previous baseline was 399 passed / 1 skipped / 1 failed, the failure being `tests/check-programs.spec.ts` — that is
  the case this release fixes, and it now passes on a host without PowerShell 7.
- New tests: `public-contracts.spec.ts` (parity of the published contract file, confirmed to fail when a field is
  removed from it), `probe-shells.spec.ts` (the shell fallback and the probe environment filter), `cost.spec.ts` and
  `cost-projection.spec.ts` (pricing arithmetic, unpriced handling, the saving, and the money reaching both read models,
  including a page total that must be the clean string `0.45`), and `check-batches.spec.ts` with
  `check-batches-timing.spec.ts` (the serial default, the bounded overlap, and a measured wall-time difference proving
  the batches really run concurrently).
- `tests/native-boundaries.spec.ts` asserted the old `设置` wording; it now asserts that the refusal names the Fusion
  panel.
- **Not claimed:** the native Host suite was not run. It needs `DSHX_HARNESS` pointing at a pinned Harness checkout,
  which this machine does not have.
- **Not claimed:** `lib/` was not rebuilt in this repository. Building on Windows rewrites every committed `.d.ts` from
  LF to CRLF, so the artifacts are left to CI, which builds from this tag before publishing.

## 0.3.4 — 2026-11-07

### Changes

- A combo that names a model the catalog no longer offers now says **which** route and **which** combo went stale.
  Reading a saved combo deliberately tolerates a retired route so the row stays visible and editable, but saving the
  list rejects it — and the refusal read only `lead 模型已不可用，请刷新后重选`, naming neither the route nor which combo
  of several. After a provider is renamed the model itself usually still exists under the new provider id, so the
  message left nothing to act on; and when the user had just edited the other role, it read like a complaint about the
  role they had just changed. The Host now names the route (`lead 模型已不可用：aihub-openai/gpt-6.1-sol。请为该角色重新
  选择模型`), `validatePairs` passes the combo name through so a multi-row save says which row failed, and the page
  checks the same condition before sending: the save names the combo, the role and the route, the combo list marks the
  affected row, and the role's picker keeps the dropped model listed and disabled (`已不可用：provider/model`) instead
  of silently falling back to the `选择已连接的模型` placeholder.

### Validation

- `pnpm test` (54 files, 401 tests: 399 passed, 1 skipped, 1 failed) and `tsc -p tsconfig.json --noEmit`. The one
  failing case is `tests/check-programs.spec.ts`, whose probe returns `undefined` on this Windows host before and after
  the change, so it is not counted as a regression. The native Host suite was not re-run: it needs a harness checkout
  (`DSHX_HARNESS`), which this machine does not have.
- New `tests/settings-stale-route.spec.ts` covers the route naming, the combo naming through `validatePairs`, and
  `missingRoutes` ordering; a new `tests/fusion-combos.spec.ts` case covers the row marker and the save refusal. Both
  were confirmed to fail against the previous source.
- Rebuilt `lib/` from the merged source and loaded both artifacts in Node: the Host module still exports
  `apply`/`Config`/`name`, and the client bundle registers under `@sqdr2/dsh-fusion` and still exports
  `apply`/`inject`/`name`/`FUSION_PANEL_ID`/`FusionPanelIcon`. The client bundle inlines only `missingRoutes`; it pulls
  in no `node:` module.

## 0.3.3 — 2026-11-07

### Changes

- The combo list selects from the whole row, and no longer paints a black pill inside it. Only the name and route text
  was a button, so the row's padding and the empty space beside the text ignored clicks; and the generic
  `.fusion-settings button` fill (`--dsw-alias-button-primary-fill`, which is `#0f1115` in the light theme) outranked the
  row's `background:none`, so the one clickable strip rendered as a black capsule. The row is now `padding:0` with the
  button spanning its full width up to the Delete button (89% of the row in a headless-Chrome measurement), the button
  keeps `background:none`, and Delete keeps its own hit area and stops its click from selecting. A radio-style marker,
  a hover surface and a brand-tinted selected state carry the selection instead of the fill.
- The composer names the permission of the model working now. Fusion pins the conversation (Lead) session to
  `read-only`, and that pair matches no configured preset, so the native permission control read `Custom` for the whole
  task. A Fusion chip in the composer tool row shows `Lead · Read Only` / `Sidekick · Full access` and follows the role
  that is running; `FusionStatus.task.permissions` carries the per-role modes (`lead`, `worker`) and `active` role, read
  from the recorded role intent, the in-flight request and the phase. The native control keeps its slot, its selection
  state and its meaning: it still sets the Sidekick's mode.
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

- `pnpm test` (53 files, 397 tests: 395 passed, 1 skipped, 1 failed), `tsc -p tsconfig.json --noEmit`. The native Host
  suite was last run at 263 passed / 1 skipped and was not re-run for this change: nothing outside the client bundle
  moved. The one failing case is `tests/check-programs.spec.ts`, whose probe returns `undefined` on this Windows host
  both before and after the change, so it is not counted as a regression.
- Rebuilt `lib/` and loaded both artifacts in Node: the Host module exports `apply`/`Config`/`name`, and the client
  bundle registers under `@sqdr2/dsh-fusion` and still exports `apply`/`inject`/`name`/`FUSION_PANEL_ID`/`FusionPanelIcon`.
- New `tests/pairs.spec.ts` (migration, id assignment, name/limit validation, compare-and-swap, per-combo profile
  identity) and `tests/fusion-combos.spec.ts` (list/rename/add/delete and whole-list save payload).
- The combo row hit area: a new `tests/fusion-combos.spec.ts` case asserts the row carries no padding, the selection
  button owns it (`flex:1 1 auto`, `padding:11px 12px`, `background:none`), the row switches selection from the row body,
  and Delete removes its own row without changing which combo is selected. The same markup and CSS were rendered in
  headless Chrome and hit-tested with `elementFromPoint`: the left edge, the marker, the text and the empty space right
  of it all resolve to the selection button, the right edge resolves to Delete, and the selection button covers 89% of
  the row width.
- The permission chip: new `tests/status.spec.ts` cases (role modes, the takeover exception and the released
  conversation) and `tests/fusion-permission.spec.ts` (both roles, the Custom explanation, silence outside a
  role-separated task, the fast poll, and the additive registration that never takes the native permission slot).

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
