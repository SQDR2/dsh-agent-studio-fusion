# Changelog

Release notes for `@sqdr2/dsh-fusion`. Newest first.

0.3.0 is the first release of this fork. Everything below it is upstream
[`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion), kept here because the upstream repository
is the only other place those notes exist.

Entry format: what changed, then what was actually validated. "Not claimed" lines mark what a release did *not* test —
read them before assuming a platform is covered.

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

First release under the name `@sqdr2/dsh-fusion`, forked from `dsh-model-fusion` at 0.2.9. Everything upstream does is
still here; the changes below are the fork's.

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

## 0.2.11 — 2026-11-03

Supports DeepSeek Harness 0.2.1-rc.5.

- Turns whose command is mixed with prose stay open on 0.2.1 instead of closing early, and explanation-only questions
  that merely mention "patch" or "implement" complete as answers.
- A filtered scope is rejected as empty instead of being reported as satisfied, and planning-only work can no longer be
  claimed as completion.
- Fusion tools are installed before `refreshTools`, so they are present on the first turn (#20).
- Exploration may complete on an empty scope when the Host verifies there were zero files (#19).
- Cache keepalive detects a route change and refuses a stale ping (#22).

## 0.2.10 — 2026-11-03

Widened the supported Host range to DeepSeek Harness 0.2.1-rc.5 (peers moved to `>=0.2.0-rc.2 <0.2.2`), with the Host
linking scripts, `scripts/build.mjs` and `tsconfig.json` adjusted for it. The rest of the release is CI work: the OIDC
publish workflow was repaired and the build made to accept TypeScript 5.9 narrowing.

## 0.2.9 — 2026-10-30

Fusion now supports DeepSeek Harness 0.2.0-rc.2 and 0.2.1-rc.2 in one package.

- Model menus use the Host's theme colors, so their labels remain readable in dark mode.
- Fusion accepts the input modalities supported by the configured Lead, including images when that Lead supports them.
- Missing or null usage counters remain unknown instead of aborting the turn with `USAGE_MERGE_CONFLICT`.
- Fusion restores its permitted tools after another plugin replaces the assembled tool table. A missing required Fusion
  tool stops the request with `FUSION_TOOL_TABLE_INCOMPLETE`.
- Workspace write leases apply only to agents owned by Fusion. Ordinary sessions in the same folder are no longer blocked
  by another Fusion task's lease.
- Read-only reports validate the files they cite. Unrelated file changes or unsupported file types no longer prevent an
  otherwise valid answer from finishing.
- A settled Sidekick without a report returns `WORKFLOW_INCOMPLETE`. Recovery controls explain when a model switch is
  refused, and the user's sandbox mode propagates to a resident Sidekick.
- The Sidekick's tool allowlist is enforced when a tool executes, including tools another plugin registers directly on
  the Sidekick.

Includes PRs #16, #17 and #18, incorporating contributions from PRs #2, #7 and #14.

**Validation:** type checking, all 326 unit tests, a fresh build and the DSHX static plugin checks pass; the rebuilt
`lib/` matches the merged candidate byte for byte. The merged candidate previously passed 256 native Host tests on each
supported Host version, with one Windows-specific test skipped on macOS. No new model calls were made for this release
preparation.

**Open reports at the time:** [#15](https://github.com/aa2246740/dsh-model-fusion/issues/15) incorrect quota display,
[#19](https://github.com/aa2246740/dsh-model-fusion/issues/19) empty-folder investigation blocked awaiting feedback,
[#20](https://github.com/aa2246740/dsh-model-fusion/issues/20) missing Fusion tools on the first turn,
[#21](https://github.com/aa2246740/dsh-model-fusion/issues/21) keepalive after a model or effort change.

## 0.2.8 — 2026-10-14

Large usage histories no longer require a full document scan for every status request. An incremental SQLite index
preserves the existing status totals, supports cancellable asynchronous backfill, and resumes unfinished backfill on a
later request. Status components for the same session share polling within a page, back off while collapsed, and pause
while hidden or unmounted.

Fusion also supplies its frozen session routes to Compact Saviour through the optional `compactionRoutes` v1 service.
With Compact Saviour 0.2.8, capacity planning and summary generation use the same physical model, effort and output
limit. Model changes, cancellation and owner unload invalidate an old plan before it can commit a summary.

**Validation:** 287 unit tests, 241 native Host tests and 10 cross-plugin Host tests pass on macOS; one Windows-specific
test skipped. Type checking, build, DSHX checks and archive validation passed. The original reporter's ~4 GB OOM and
full abnormal compaction chain were **not** reproduced — this release addresses the confirmed status-scan bottleneck and
the compaction routing mismatch, and does not claim every symptom of issue #11 is resolved.

## 0.2.7 — 2026-10-07

Supports DeepSeek Harness **0.2.0-rc.2**. Sidekick workspace paths, baseline-ready test parsers and command program
probes:

- The leased project root and every Sidekick path are matched by filesystem identity, not string spelling: macOS
  `/tmp/x` for `/private/tmp/x`, symlinked checkouts, and directories *below* the project root are accepted; paths
  outside the root stay refused. Relative `workdir` resolves inside the workspace, and absolute `file_path` values for
  write/edit normalize to workspace-relative before the lease checks them.
- `baseline: "no-new-failures"` now works with unittest, vitest, jest, tap, go (verbose) and cargo besides pytest. A
  baseline is still rejected whenever the output cannot name every failure its summary counts: a failure without a name,
  or two under one name, would let a candidate trade a frozen failure for a new one. Mocha stays unsupported (its default
  report cannot name failures); the error names the concrete fix. pytest 9 `SUBFAILED` subtests count and list
  correctly.
- Command program probes no longer look up a quoted word in command position: `"$PY" -m unittest`, `FOO="a b" pytest`.
  Quoted text is replaced by NUL, which no program name contains; assignments, wrappers, heredocs and PATH-overriding
  commands behave as before.

**Validation:** 265 unit tests and 239 Host tests pass, 1 Windows-only test skipped. A real-model acceptance ran a
unittest baseline freeze, a `/tmp`-alias and relative-subdirectory workdir, and an absolute-path edit. No new Windows or
Linux runtime acceptance claimed.

## 0.2.6 — 2026-10-01

Supports DeepSeek Harness **0.2.0-rc.2**. Cheaper cache keepalive, measured on the ChatGPT subscription route
(gpt-6-astra, about 20k tokens of context):

- Each ping now resends the Lead's previous request with "Reply OK" appended instead of "continue". The model answers
  with 5 output tokens, no reasoning and no tool call (16 of 16 trials). With "continue" it called tools every time; the
  median ping produced 463 output tokens.
- The cache was still there after 10 idle minutes and gone after 15, and every ping restarts that clock. The ChatGPT
  subscription route therefore defaults to one ping every 8 minutes (was 285 seconds).
- The interval is shortened only when 3 of the last 5 pings at that interval missed. Before, two scattered random
  evictions were enough. Intervals learned under the old rule are ignored.
- The settings page shows the output tokens spent on pings.

Replayed over the real waits in the session logs, pings dropped from 126 to 57 and keepalive cost fell by about 78%.
Validation was on macOS arm64 with DSH 0.2.0-rc.2; no new Windows or Linux runtime acceptance claimed.

## 0.2.5 — 2026-09-30

Enable public npm publication and provide pinned npm installation commands for official DSH 0.2.0-rc.2. Runtime code is
unchanged from the preceding GitHub release.

## 0.2.4 — 2026-09-30

Supports DeepSeek Harness **0.2.0-rc.2**.

Fix the installation instructions that still selected the older DSH 0.1.7-compatible plugin tag. An
installation-documentation correction: runtime bundles are unchanged from the previous RC2-compatible release, and DSH
peers remain `>=0.2.0-rc.1 <0.2.1`.

## 0.2.3 — 2026-09-29

DeepSeek Harness compatibility: built and tested against DSH `0.2.0-rc.2`
(`639ed015397290b3745d163aafe02ffee4aa3f84`). Updated the development SDK and compatibility checks for RC2; existing
RC1-compatible public plugin interfaces remain supported by the declared peer range.

Validation was performed on macOS arm64. This release does not claim new Windows or Linux runtime acceptance.
