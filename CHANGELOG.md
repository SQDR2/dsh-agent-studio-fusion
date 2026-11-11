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

### Runtime
- **A Worker can report while a background process it declared is still running**, instead of stopping it first, and
  the next handoff of the same work order is told what was running. `WorkOrder.preserveRuntime` (opt-in per delegation)
  plus the Worker-only `fusion_declare_runtime` tool record the job's purpose, working directory, a digest of its
  command (never the command text, which can carry a token) and a deadline; `NativeEffects.retain` moves the effect
  row from `dispatch-started` to `retained`, so it no longer blocks `fusion_submit_result` while keeping the
  `processId`/`startedAt` identity that forbids adoption. An undeclared running job still blocks the report, and the
  refusal now names the tool.
- **This does not keep a server alive across handoffs, and the Host cannot make it so from here.** A Worker's jobs are
  owned by its Agent scope (`tool-bash` registers `owner: exec.agent.id`), and `jobs-local` cancels every job of an
  owner when that scope is disposed (`disposeOwned`), which is what a settled handoff does. Measured on the real Host:
  the declared job settled `killed`, `detail: "signal: SIGTERM"`, within the same handoff; the Worker Agent was already
  gone (`ctx.agents.get(acceptedChild) === undefined`) when the Lead reworked; and `ctx.jobs.get` later threw
  `unknown job`. Real retention needs either job-ownership transfer in `@deepseek-ai/dsh-jobs` or a Host-owned
  launcher, and a launcher would open a second process path that bypasses `tool-bash` approval and the per-session
  sandbox mode — the plugin never widens a sandbox mode, so that half is deliberately not built. Evidence:
  `docs/DEVIN-LOCAL-FUSION.md` §9.
- **Recovery never adopts a process it did not start.** A `retained` row written by a previous Host process is
  reported by `NativeEffects.strandedRetained` (process id and start time are the only identity), appears as
  `recovery/needed` at install, and `assertInspection` refuses to continue until that process is gone. Completion
  (`accept`), pause, takeover, the deadline and Host shutdown all stop declared runtimes through the existing
  `#stopJobs`.
- The Lead's fixed tool catalog is unchanged: `fusion_declare_runtime` is offered only inside the Worker's
  implementation order, so the Lead's cached prompt prefix does not move.
- Tests: `native-tests/coordinator.spec.ts` "retained runtime across handoffs" — a declared job lets the report land
  (journal `retained.purpose`/`deadlineAt`, a `runtime-handle` with a 64-hex `commandDigest` and final state `ended`,
  the next Worker request carrying "Processes the previous handoff declared"), and an undeclared job is refused with a
  message naming the declaration.

### Safety
- **The Sidekick can no longer commit, push, tag, publish, release, open a pull request or trigger CI unless the work
  order grants that exact action.** The write lease bounds *files* (`allowedPaths`); it never bounded what leaves the
  workspace, so a delegated task could `git commit` / `git push` and the Lead's review happened afterwards. Devin draws
  the same line for its sidekick ("does not own commits, pushes, pull requests or CI"); this is the Host-side half.
  `src/host/authority.ts` reads a shell command's text — through `sudo`/`env`/`xargs`/`time`/…, `VAR=value` prefixes,
  `git -C <dir>`-style value-taking globals, `bash -c "…"` and `$(…)` — and names the action; quoted literal data
  (`grep -r 'git push' docs`) is not a command and is left alone. `src/host/coordinator.ts` refuses an ungranted one
  with `FUSION_WORKER_AUTHORITY_DENIED` and tells the Worker to report it as pending, so the task still finishes.
  A new optional `authority: AuthorityAction[]` on the frozen `WorkOrder` (`contracts/fusion.ts`, `src/contracts.ts`)
  is how the Lead grants one — only for what the user actually asked for — and `fusion_rework` cannot widen it.
  Deliberately a command-text guard, not a sandbox: a command assembled at runtime (`python -c`) or run through
  `run_code` stays outside it, which is why the Worker prompt states the rule too.
- Tests: `tests/authority.spec.ts` (7 cases) covers read-only commands staying allowed, the seven action families,
  launchers/assignments/segments/nested shells/command substitution, quoted data not being mistaken for a command, and
  a grant allowing exactly the granted action. `native-tests/coordinator.spec.ts` "Sidekick authority boundary" (2
  cases) drives a real Worker: an ungranted `git commit` and `git push` are refused while the work order still
  completes and verifies, and an action granted in the work order runs.

### Prompts
- **Delegation economy, aligned with the Devin rules that explain its 3.4× wall-time advantage** (measured on the same
  model pair in `benchmark/rebench/results-devin-r1`: 4/4 resolved at $2.73 in 20.1 min vs 3/4 at $4.81 in 6.0 min).
  `prompts/lead.md` / `prompts/model-lead.md` now say to hand over the *shape* once an edit is settled — exact file,
  location and a fenced snippet — instead of only stating "what must be true", with the explicit reason Devin gives:
  never leave alternatives for a model to pick, because it guesses and a wrong guess costs a rework round. Open design
  questions are settled before an implementation brief. Review is batched: finish the whole review, then send every
  defect, gap and edge case as one consolidated rework brief. A user message that arrives mid-handoff is acted on
  immediately with `fusion_rework` rather than waited out.
- `prompts/lead.md` / `prompts/model-lead.md` also gain the non-delegable authoring rule: the exact text of a query
  against a shared or production data system (read-only included — the risk is a wrong number delivered as fact),
  prompt/rubric/grader/eval-harness text, and scoring/threshold/sampling/pipeline configuration are the Lead's to
  write. Tests do not catch a plausible wrong number.
- `prompts/worker.md` / `prompts/model-worker.md` gain check damping: while planned edits remain, do not stop between
  them to run `git status`, `git diff`, lint, typecheck or tests; after the last edit run one consolidated pass with the
  narrowest command, never re-run a command whose inputs did not change, and after a fix re-run only what it could
  affect. They also state the publish boundary and the "report it as pending" resolution.
- Tests: `tests/prompts.spec.ts` (7 cases) pins these rules — authority boundary, non-delegable authoring, fenced
  snippet with no alternatives, consolidated rework, mid-handoff user message, check damping — in both the Chinese and
  the English variant, so an edit to one variant cannot silently drop a rule from the other.

### Documentation
- `docs/DEVIN-LOCAL-FUSION.md` records the Devin Fusion evidence (binary offsets, static prompt text, `sessions.db`
  records), the dsh-fusion comparison, the efficiency evidence that motivates the prompt changes, and the fixed A/B
  protocol (metrics, repetitions, admission thresholds) that a later round must use before any speed claim is made.

### Fixes
- **A skill the user invokes can now actually reach the Lead.** The Host publishes the session skill catalog and
  injects a `/<name>` invocation's body as instructions, but `skill` was missing from the Lead's read-tool ceiling, so
  the body arrived as an instruction to call a tool the Lead did not have. `/grill-me` reached the Lead as "Call the
  Skill tool with 'grilling'" and stopped there: `grilling`'s rules — in particular that finding repository facts is
  the Lead's job — never loaded, so the Lead interrogated the user from the task text alone instead of the code
  (session-2a7a61bd-fb83-4697-ae44-86934c0e4556). That session's recorded Lead request advertises exactly 13 tools —
  `bash`, the `fusion_*` family, `glob`, `grep`, `job_output`, `read` — and no `skill`. `skill` is now a read tool in
  `src/host/read-tools.ts`, next to
  `read`/`grep`/`glob`: loading one returns instructions and never writes, so it is offered in every
  enforced-workflow Lead catalog and stays callable while a Worker holds the write lease. Both Lead prompts
  (`prompts/lead.md`, `prompts/model-lead.md`) now also say to load a matching or user-invoked skill before acting —
  including when a loaded skill names another one to load — and to find repository facts before putting a question to
  the user.
- Tests: `tests/read-tools.spec.ts` covers the ceiling membership, the `str_replace_editor view` carve-out and the
  Lead-table projection. The host regression in `native-tests/coordinator.spec.ts` registers the Host's global
  `skill` loader, turns a `/grill-me`-shaped message into a `skill {name: 'grilling'}` call, and asserts that every
  Lead request advertises `skill` and that the call returns the skill body without an error. Both ceilings covered by
  that case — `enforced-v3` and the legacy one — fail before this change (the request lists `bash`,
  `fusion_delegate`, … and no `skill`) and pass after it.

### Not claimed
- `session-2a7a61bd-fb83-4697-ae44-86934c0e4556` was not replayed end to end. The evidence is the unit test plus the
  host integration suite, which exercises the Host's real request assembly, tool registration and ceiling projection.
- The authority guard was not measured on a real delegation, and it is a command-text guard, not a sandbox: a command
  assembled at runtime (`python -c`, a script piped on stdin) or run through `run_code` is outside it. It also does not
  ask the user whether they wanted the action; the grant is the Lead's judgement, recorded in the work order.
- The prompt changes were **not** A/B measured. No new model call was made, so this release claims no tool-call, wall
  time or cost improvement — only that the rules are present in both variants and pinned by tests.
  `docs/DEVIN-LOCAL-FUSION.md` §7.4 fixes the protocol and admission thresholds a later round must meet first.
- Preserving a Worker's background processes **across handoffs** is not achievable from the plugin: the Host cancels a
  job when its owner Agent's scope is disposed, which is exactly what a settled handoff does. The shipped
  `preserveRuntime` covers one handoff (report lands while the job runs, the next brief is told what it was) and never
  claims more. See `docs/DEVIN-LOCAL-FUSION.md` §9 for the measurement and the two Host-side options.
- The declared runtime's `strandedRetained` recovery path is covered by unit-level reasoning and the existing
  inspection gate, not by a host test that restarts the Host process with a live retained job.

### Validation
- `pnpm test`: 503 tests in 66 files pass (14 of them new: 7 in `tests/authority.spec.ts`, 7 in
  `tests/prompts.spec.ts`). `pnpm typecheck` is clean, and `pnpm build` regenerates `lib/` with the expected
  `lib/dsh-fusion.js` change plus the new `lib/types/host/authority.d.ts` and the `lib/types/host/read-tools.d.ts`
  from the previous entry.
- `pnpm test:host` against the pinned Harness via `DSHX_HARNESS`: 282 of 283 pass. The one skip is the Windows ACL
  confinement suite, which only runs on Windows; the platform-neutral coordinator suite is 239 of 239 — the two new
  "Sidekick authority boundary" cases and the two new "retained runtime across handoffs" cases.

## 0.3.8 — 2026-11-09

### Fixes
- **Acceptance check receipts now carry their real closing snapshot.** `runNativeChecks` recorded only
  `inputSnapshot`, so `src/evidence/receipts.ts` rejected every completed check as `CHECK_SNAPSHOT_MISMATCH`: no task
  with an acceptance command could reach `verified`, and the Lead could never accept it. The producer now takes the
  batch's closing snapshot after every command in it finished, confirms the source did not change, and writes it into
  each completed receipt; `runBaselineChecks` does the same per command. Covered by a host regression that asserts the
  persisted pair, which is the only place this defect was observable.
- `WORKER_TOOLS_UNREACHABLE` is now route-aware. Only the antigravity/agy bridge route, which Fusion actually wires,
  is told to check `mcpBridge` / `permissionMode` / the `agy_tool` allowlist. Every other route (an ACP agent such as
  `dsh-tauri-acp`, whose `session/new` carries no MCP servers) is told the adapter itself must forward Host tools, that
  no Fusion setting can do it, and that workspace work needs a direct-call route. Zero tool calls stays a
  route/adapter mismatch — never a provider outage, quota limit or model capability.
- The verdict now carries the Worker's own bounded last words as `workerSaid` (`text` ≤ 2000 characters, `truncated`,
  and an explicit unverified-prose note), persisted with the order mode so `fusion_wait` re-reports identical evidence
  instead of the Lead telling the user the Sidekick never replied (session-6113b527).
- Per-order evidence: the tool-call count and the quoted message are now scoped to the current work order via its
  `worker-request:<childId>:<turn>:<step>` rows, so a persistent Worker's earlier tool calls can no longer mask a
  current order that dispatched none.

### Added
- A strictly bounded text-report protocol for `mode: 'text'` assignments whose route cannot call Host tools at all:
  one ```` ```json ```` block with `fusionTextReport: 1`, the frozen `workOrderId` / `revision`, the current
  `briefRevision` (and `operationId` when present), `status`, `summary` and `unresolved`. Another order, another
  revision or brief, extra fields, several blocks, an unclosed block, non-JSON or plain prose are refused with a
  recorded reason, and only the captured request's complete message of the current brief may ever be adopted (rework
  keeps the frozen order revision, so a stale block cannot answer again; an older step's valid block is never a
  fallback, and an interrupted captured request adopts nothing). An accepted report goes through the
  existing validation, review ticket and Lead acceptance path, and the review reply marks it
  `submittedVia: 'text-report'` so it is never presented as a tool-verified submission. Native
  `fusion_submit_result` stays preferred, and `implement` / `explore` orders still require real Host tool calls.
- The protocol is discoverable in the text-order brief, in the single repair instruction and in `prompts/worker.md` +
  `prompts/model-worker.md`; a valid pending text report also skips the turn-stopping repair generation.
- `docs/WORKER-TOOLS-UNREACHABLE.md` gained the ACP half of the story: the `dsh-tauri-acp` `mcpServers: []` root cause,
  what the protocol does and does not allow, and the difference between route metadata (`provider`/`model`) and a
  Worker's own claim about the model it runs.
- Tests: `tests/text-report.spec.ts` (protocol parsing, binding, caps, discovery text), route-aware wording and bounded
  quoting in `tests/worker-terminal.spec.ts`, and host-level cases in `native-tests/coordinator.spec.ts` (bound text
  report accepted without a repair generation, prose-only route quoting + `fusion_wait` consistency, wrong-revision
  rejection, per-order evidence, rework refusing the previous brief's report, a fresh report under the new brief,
  a stale `briefRevision` named in the refusal, an interrupted captured request not falling back to an older step's
  report, workspace order refusing a bound text block, and the check-receipt
  snapshot regression).

### Not claimed
- This is not ACP Sidekick support. An ACP route still cannot read, run or edit anything through Fusion; the missing
  MCP bridge observed in `dsh-tauri-acp` lives outside this repository. Fusion does not assume every ACP adapter is
  built that way.
- End-to-end verification against a live ACP route was not reproduced here; the coverage is unit tests plus the host
  integration suite, which now runs green (see below).

### Validation
- `pnpm test`: 487 tests in 63 files pass (the earlier Node 24 dangling-symlink `EEXIST` cases are fixed in the tests
  with `unlinkSync`; their assertions are unchanged). `pnpm typecheck` is clean, and `pnpm build` regenerates `lib/`.
- `native-tests/coordinator.spec.ts` against the pinned Harness (`DSHX_HARNESS`): 233 of 233 tests pass, including the
  new bound-text-report cases, the interrupted-request case (an older step's valid block is never adopted), the
  per-order evidence case and the check-receipt snapshot regression. The whole file is green on this machine once the
  pinned Harness is supplied via `DSHX_HARNESS`.

## 0.3.7 — 2026-11-09

### Changes

- **An agy Sidekick now shows its steps inside the parent conversation.** A bridge route (antigravity) reports every
  completed agy step as a real `tool/call` on its own transport, `agy_tool`, but the inline projection only listed the
  Host's built-in tools. Both the live collector and the historical replay therefore dropped those events, so a session
  whose Sidekick ran on an agy model looked idle — the operations were only visible in a separate task panel that
  required `dsh-composer-plus` or `dsh-better-sidebar`. The projection now accepts the registered route transports
  (and the exact Code Mode `run_code` mirror wrapper, parsed from the recorded code and never evaluated), so the same
  `fusion_explore` / `fusion_delegate` card lists the real steps with no extra plugin installed.
  Each row names the operation the route actually ran — `run_command` with its `CommandLine`/`Command` and `Cwd`,
  `view_file`, `write_to_file`, `replace_file_content`, MCP shapes — and shows its recorded output and failure state.
  An unknown inner tool falls back to its readable name and raw arguments; malformed arguments stay readable instead
  of crashing the card. Exit codes are read only in the producing tool's own format, so a `view_file` result that
  merely quotes an exit line is not marked failed. Write and edit steps show their real path and output but never a
  diff synthesized from tool input.
- **A Worker delivered before this fix still replays.** Such a task kept its durable activity link while storing no
  activity rows at all, and the historical reader treated any link as "already cached", so cold history stayed blank
  forever. It now falls back to the accepted message ids when the store really holds no rows, keeping the parent/child
  ownership check, writing nothing and activating nothing; a genuine cache hit, including an exhausted cursor, is
  unchanged.

### Validation

- `tests/agy-activity.spec.ts`: 17 tests over the projection predicate, the wrapper parser, argument unwrapping and
  the rendered rows (shell command/cwd/exit code, file path and output with no fabricated diff, unknown tool,
  malformed arguments, `pwsh` and `bash` cards unchanged).
- `native-tests/coordinator.spec.ts -t agy`: 3 tests — live collection with deduplication and no re-run, historical
  replay, and recovery of a legacy link-only task.
- `pnpm test`: 462 tests in 61 files pass; the only failures are the two pre-existing symlink `EEXIST` cases in
  `tests/change-evidence.spec.ts` and `tests/native-boundaries.spec.ts`, which also fail on the untouched branch.
  `pnpm typecheck` and `pnpm build` are clean.
- Not claimed: the cards appear when the adapter closes a step, so a running step is not shown live; and no browser or
  live-provider check was run — the results above are unit, host-fixture and build evidence.

## 0.3.6 — 2026-11-09

### Changes

- **A timed-out Lead no longer strands its conversation.** When a Lead request failed, `NativeModelControl` recorded a
  durable `waits.lead` pause (`TIMEOUT` in session-8ead78f7). Every later turn was then rejected before any request, so
  the loop ended it as `blocked` with nothing in the conversation — pressing "continue" looked like the session
  instantly ending, and the only apparent way forward was a new session. A human message is now the local continuation
  control: an ordinary user message, and an empty "continue", lift the Lead's pause so the same conversation runs again.
  Only quota and credential stops (`QUOTA`, `ACCOUNT_QUOTA`, `INVALID_CREDENTIAL`) keep the pause, because a retry
  cannot fix them; a Sidekick pause stays behind the bounded `leadRecover` path so a delegation cannot silently retry.
  Synthetic wakes are unaffected: a Sidekick settlement or a goal round still carries content and never lifts a pause.
- **A gated step now says why.** A gate that rejects the pre-step (a paused role, a closing runtime, an unfinished
  recovery, a missing scope install) never reaches the model, so the turn ended with no trace in the conversation. The
  Host now writes one durable bilingual notice into the Lead's session per gate state, naming the paused role, the
  reason, and the controls that lift it ("继续一次" / "Continue once", or simply another message). Repeated attempts on
  the same state stay silent; a new gate state speaks once. A gated Sidekick transcript is untouched: the Lead already
  learns about it from the delegation result.

### Validation

- `pnpm typecheck` and `pnpm test`: 455 tests in 61 files pass locally (Node 22.23.2), including the new
  `tests/user-continuation.spec.ts`, which drives the real `NativeModelControl` listener over a SQLite ledger and the
  real `NativeFusionScopes` pre-step gate.
- Not claimed: the fix was not exercised against a live provider against a real timeout in a running Host; the gate and
  the pause lift are covered at the unit/integration level with the durable ledger.

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
