# Changelog

Release notes for `@sqdr2/dsh-agent-studio-fusion` (published as `@sqdr2/dsh-fusion` up to 0.3.9). Newest first.

## Origin

This package is a fork of [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion). 0.3.0 is the
first release published under this fork, and it branches from upstream 0.2.9. Upstream 0.2.10 and 0.2.11 landed after
that point and are **not** included here.

**The name changed at 1.0.0.** Versions 0.3.0 through 0.3.9 were published as `@sqdr2/dsh-fusion`. From 1.0.0 the
package is `@sqdr2/dsh-agent-studio-fusion` and the plugin id is `dsh-agent-studio-fusion`. The 0.4.x line was never
published: it exists only in this repository's history, and 1.0.0 is its first release. Upgrading from a
`@sqdr2/dsh-fusion` install migrates the state directory automatically; see [`INSTALL.md`](INSTALL.md).

Earlier versions — `dsh-model-fusion` 0.2.0 through 0.2.11, and the pre-0.3.0 tags in this repository's history — were
not published as `@sqdr2/dsh-fusion`, so they are not listed here. Their notes live in the upstream repository, under its
own tags and releases.

Entry format: what changed, then what was actually validated. "Not claimed" lines mark what a release did *not* test —
read them before assuming a platform is covered.

## 1.5.0 — 2026-11-20

### 工长审查改为后台执行：结论回到 Lead，而不是按时间掐断

- **审查不再占住 Lead 的 turn。** `fusion_delegate` 记录候选计划与 `plan-review/requested`
  后，把审查交给后台任务并立即返回"已派发"；工长审完写回 `plan-review/completed`
  或 `plan-review/unavailable`，再用 `agent.send(…, 'next-turn')` 把结论作为通知唤醒 Lead。
  Lead 收到后调用 `fusion_resume_plan` 复用同一份定稿计划：`ready` 直接派 Sidekick，
  `concerns` 修订后进入下一轮。`block: true` 保留原来的同步语义（脚本与测试用）。
- **取消了任务级总时长。** 组合的 `timeoutMs` 现在是**可选**字段，留空即不设上限：审查按
  完成的工具调用续命（两分钟起始窗口 + 每次 30 秒），直到它自己给出结论、静默超时、
  达到工具调用上限，或被停止。这正是 `session-20b3fa52` 需要的形状——那次审查 42 次调用、
  540 秒模型时间、工具只占 26 秒，被 600 000 ms 上限掐断时仍在取证，结论全部作废。
- **到点不再交白卷。** 工具调用上限从 60 提到 120；达到上限，或配置的 ceiling 只剩
  四分之一（不超过三分钟）时，循环改用**不带工具**的请求要求工长用已读到的证据交卷，
  引文照旧由 Host 校验。只有"被要求交卷后还要工具"才报不收敛。
- **重启可续。** 有待审请求但没有运行中的任务（Host 重启）时，同一候选的
  `fusion_resume_plan` / `fusion_delegate` 会复用已记录的那一轮重新派发，而不是再写一条
  `plan-review/requested`；不同候选才记为 `interrupted plan review`。任务停止会中止运行中的审查，
  并由结算路径写成显式不可用。
- **状态可见。** `fusion_read_state` 的任务事实新增 `planReview.pending` / `planReview.latest`
  （轮次、线路、请求时间、最近结论），Fusion 设置里的超时字段改为可留空。

验证：`pnpm typecheck`；`pnpm exec vitest run` 860 通过（新增
`tests/plan-review-jobs.spec.ts` 5 例：一任务一审查、只释放自己那一份、cancel 语义、关闭时全部取消、
按 Host 上下文共享注册表；`tests/plan-review.spec.ts` 新增"无 ceiling 时靠续命跑完"、改写
"到上限改为要求交卷""为结论保留四分之一 ceiling"两例，并更新 `FOREMAN_MAX_TOOL_CALLS = 120`）。
未验证：没有在真实模型上跑一次完整后台审查（本轮改动靠单元用例覆盖结算、续派与预算路径），
也没有把审查放进独立子会话（见 `docs/FOREMAN-BACKGROUND-REVIEW.zh.md` 的实施记录）。

## 1.4.0 — 2026-11-19

### A review's clock now follows its work, not the other way round

- **A Foreman that was steadily working was killed by a clock that could not tell it apart
  from a dead route.** In session-28dd82b6 the reviewer streamed sixteen turns and twenty-one
  tool calls at ~115 tokens/s and was ended at exactly 300 000 ms with no verdict: 276 s of
  that budget was model time and 23 s was tool time, so nothing was stuck — the fixed ceiling
  simply priced "reading the repository" the same as "not answering". The review now starts
  with a two-minute window (`FOREMAN_BASE_BUDGET_MS`) and every completed tool call buys it
  another thirty seconds (`FOREMAN_TOOL_CALL_BUDGET_MS`), up to the ceiling the combo
  configures. The setting still bounds the longest the Lead is ever made to wait; it no longer
  decides how much of the repository a review may read before it runs out.
- **One command can no longer outlive the review that started it.** The Foreman's shell schema
  carries `command` and `description` only, so a review command had no limit of its own and
  only the review's clock could end it — an accidental filesystem-wide `find` (measured at
  52.5 s for the one that ran) or a command waiting on input ran until the whole review was
  killed, taking the completed turns with it. Each command is now bounded by
  `FOREMAN_COMMAND_TIMEOUT_MS` (two minutes), the limit is the Host's rather than a parameter
  the model may raise, and the result says which limit stopped it.
- **A quiet route and a slow one are reported differently.** A review that stops answering
  mid-way — having already produced output — is no longer described as a route that "never
  started answering": the reason names how many tool calls it had completed and says that
  retrying is more likely to help than a longer timeout. A review that reaches its ceiling
  while still streaming now names the ceiling and the tool-call count, which is what tells "a
  slow route" apart from "a brief that sent the reviewer somewhere the workspace cannot
  answer".
- **The worst case is bounded twice.** `FOREMAN_MAX_TOOL_CALLS` rose from 40 to 60: a review
  that reads the files a finding depends on makes a dozen calls before it writes anything, and
  the review in the case above had made twenty-one when it was killed. At the measured
  14.2 s per call, the sixty-call guard and the ten-minute default now bound a review from
  opposite directions instead of the clock always winning.
- **New reviewers start where the work is, not where it failed.** `FOREMAN_TIMEOUT_MS.max` is
  fifteen minutes and `FOREMAN_DEFAULT_TIMEOUT_MS` is 600 000 ms; enabling the reviewer in the
  panel seeds 16 384 output tokens instead of 8 192, because thinking counts as output on a
  `high` route and two stored reviews had aborted at exactly the 8 192 cap with `max-tokens`.

Validated: `pnpm typecheck`; `pnpm exec vitest run` 854 passed, including five new cases in
`tests/plan-review.spec.ts` (a review kept alive past its base window by a completed tool
call, a review ended at its ceiling while still calling tools, the clock's extend/ceiling and
deadline-abort behaviour, the base window sitting inside the configurable ceiling, and a
command stopped by its own limit rather than by the review) and two updated assertions
(`FOREMAN_MAX_TOOL_CALLS`, the seeded output limit); `DSHX_HARNESS=… pnpm test:host` 333
passed, 1 skipped (the Windows ACL case). Not claimed: the renewal was not replayed against a
live provider — no review longer than the old five-minute ceiling was run end to end, so the
case that motivated it is covered by the unit cases rather than by a real model.

## 1.3.0 — 2026-11-19

### The Lead runs with your permissions; the Foreman audits the code, not the plan text

- **The Lead is no longer forced into a read-only sandbox.** It used to be pinned to
  `read-only` whenever it did not hold the write lease, which made the expensive reviewer
  unable to run the check it was reviewing and contradicted the prompt telling it to verify
  its own judgement. Both roles now run in the mode the user picked, and the one remaining
  rule is the concurrency boundary: exactly one writer per workspace, so a Lead write while
  the Sidekick holds the lease is refused with `FUSION_LEAD_WRITE_CONFLICT` (reads and
  searches keep working). `FUSION_LEAD_READ_ONLY` and `leadShellProblem` are gone, and the
  Lead's enforced-v3 catalog now carries `write`, `edit` and `job_kill`. Discipline is the
  prompt's job: model-lead.md and lead.md were rewritten to say the Lead owns the outcome,
  delegates by default, and must never leave a half-edited workspace.
- **The Foreman now reviews against the real repository.** It gets `read`/`grep`/`glob`
  plus the Host's own shell, so it can open the files a finding depends on and run the
  command an acceptance claim names. "Audit only, never modify" is now a prompt clause
  (`FOREMAN_SYSTEM_PROMPT`) rather than a second sandbox.
- **Every verdict is bound to code.** A `blocking-concern` must cite a
  `path:startLine-endLine` range and a `ready` verdict must list the ranges it inspected;
  the Host opens each cited file, checks the range exists, and discards the whole assessment
  as unavailable when one citation does not resolve. Verified citations carry the digest of
  the bytes that were read.
- **A blocking concern can no longer be overridden.** Accepting it is the only way past it,
  which sends the revision through another round; only `warning` findings may be overridden
  with a reason. A review that cannot produce a verdict now stops the dispatch instead of
  letting the plan through unaudited: the user chooses `/fusion foreman-retry`,
  `/fusion foreman-model <provider/model>` or `/fusion foreman-skip <reason>`, and the
  decision is bound to that exact failed candidate and round.
- **Three review rounds, derived from one constant.** `FOREMAN_MAX_REVIEW_ROUNDS` is now the
  single source for the gate, the coordinator and the reducer, which had kept a hard-coded
  "1 or 2" that refused the third round the gate was willing to run.
- **A review cannot run away.** One review may make at most 40 tool calls
  (`FOREMAN_MAX_TOOL_CALLS`); past that it is reported unavailable with the reason instead of
  consuming its whole timeout without converging.
- **Entry gates:** `fusion_plan_discussion(open|finalize)` keeps an interactive skill's
  discussion open until it is really finished (a `/grill-me` invocation opens it
  automatically), `/fusion allow-explore <scope>` authorizes one bounded read-only survey
  that is neither reviewed nor dispatched, and `fusion_finish_direct` refuses to close a task
  with a discussion or a review still pending.

Validated: `pnpm typecheck`; `pnpm exec vitest run` 847 passed; `DSHX_HARNESS=… pnpm test:host`
333 passed, 1 skipped (the Windows ACL case). Not claimed: no live conversation was run
against this build, so the five end-to-end scenarios in
[`docs/PLAN-LEAD-FOREMAN-V2.md`](docs/PLAN-LEAD-FOREMAN-V2.md) §S6 are covered by the native
Host suite rather than by a real model.

## 1.2.3 — 2026-11-18

### A Foreman review that never started is no longer reported as a generic timeout

- **A configured Foreman could burn its whole budget on a route that never answered, and the
  gate then read that as approval.** One implement candidate on a `reasoningEffort: high`
  route was ended by a single flat `TimeoutError` after 120 006 ms having produced no stream
  at all (one usage snapshot, zero input and output tokens), so the plan reached the Sidekick
  unaudited with only a transcript notice to say so. The review now runs under two budgets:
  a stall budget for the wait before the first chunk, and the configured total. A route that
  said nothing is reported as silent — naming the route and how many attempts it consumed —
  instead of as one undifferentiated timeout, and silence is the one case worth a retry,
  taken out of the configured budget rather than added to it.
- **A stall can no longer hang the delegation.** The deadline is now observed by the code
  that owns the budget, by racing the stream against it, rather than only signalled to the
  adapter: an adapter that ignores its abort no longer leaves the review pending for ever.
- **A new reviewer starts at five minutes, not two.** `FOREMAN_DEFAULT_TIMEOUT_MS` is
  300 000 ms; enabling the reviewer in the panel seeds it. A reasoning reviewer spends tens
  of seconds before its first token on a two-word request, and a candidate plan is far
  larger, so two minutes sat one queue stall away from discarding the review.
- **`foremanDispositions` rejected for a reason the Lead can act on.** The sentence
  "Unexpected foremanDispositions: no unresolved Foreman concerns exist for this task." cost
  a whole delegation round in the session that prompted this: the error now names the finding
  ids that belong to no live review and says to resubmit without dispositions.

### A conversation no longer dies when a plugin reload outlives its Fusion scope

- **A module reload during a running turn left the conversation permanently unusable, and the
  refusal named neither the cause nor a way out.** In session-8d577e34 a reload disposed the
  generation that owned the scope 1.9 s into the first model request (the turn was cancelled
  as "Fusion runtime is unloading"); the next generation restored the session's combo but
  never installed a scope, because `agent/created` — the only edge that installs one for a
  resumed session — had already passed for that live Agent. The next turn ran on the Host's
  own prompt and tool table, and was refused four milliseconds after it started with
  "Fusion Agent scope is not ready; execution is blocked". Nothing said that `/fusion resume`
  existed, and the recorded install failure sat in memory unread: `assertReady` answers the
  readiness question before any gate that would have reported it.
- **The scope is now rebuilt at the running reservation.** A turn whose Agent has a binding
  but no ready scope of this generation gets one before prompt assembly reads the role, from
  the persisted binding, and the frozen physical route is pinned at the same point — the
  documented place to select a route, since step preparation reads it before any waterfall.
  An Agent whose stale entry cannot be detached keeps it, and says so.
- **Every scope refusal now carries the cause and the repair.** The message appends the
  recorded install error when there is one and names both `/fusion resume` and switching away
  from the combo and back.

Validated: full unit suite 832 passed (5 new cases in `tests/plan-review.spec.ts` covering a
silent route, the retry that silence earns, a responsive-but-slow review staying inside its
total budget, the streaming-deadline wording, and caller cancellation staying out of the
retry path; `tests/fusion-combos.spec.ts` now asserts the new default). Two new cases in
`native-tests/coordinator.spec.ts` drop a live Agent's scope the way a reload does and assert
that the next turn gets the same Fusion tool table back with the frozen route pinned, and that
an install that still fails produces a turn error naming the failure and `/fusion resume`.
Not claimed: no live review was run against a real slow route — the two-budget split is
exercised against a fake stream, and the five-minute default is a value change, not a
measurement of any one gateway. The scope repair is exercised against a detach that stands in
for a reload, not against a real HMR recompose of this plugin inside `dsh web`.

## 1.2.2 — 2026-11-18

### The Fusion API mounts even when the web server starts after this plugin

- **On `dsh web` the panel's own `/api/fusion` route could be missing for the whole process,
  with no error on the terminal.** 1.2.1 dropped `webServer` from `inject` (correctly — a
  headless Host never provides it) and registered the routes through one
  `ctx.get('webServer')` read at load time. `dsh web` can activate `webServer` *after* this
  plugin's entry, and `ctx.get` then answers `undefined`: the registration was skipped and
  never retried. Requests fell through to the Host's `/api` transport prefix (401
  `unauthorized`, or its own 404 for an admitted browser session), so the settings page showed
  only “无法读取 Fusion 设置” / “Cannot read Fusion settings” while the Host logged nothing.
  The routes — the pre-rename `/api/model-fusion` path included — now mount through a reactive
  `ctx.inject(['webServer'])` sub-fiber that starts when the service appears and is torn down
  with it; a headless composition still installs no route, and the plugin still activates
  without a web server. The ACP Sidekick bridge had the same one-shot read and was losing
  `/api/fusion/acp-mcp` the same way; both now mount through `installExactRoutes`
  (`src/host/http.ts`), whose disposer removes its routes synchronously so a caller can mount
  the same path again immediately.
- **The settings page now says why a read failed.** A non-2xx reply was replaced by the
  generic sentence above, discarding the Host's `{ error }` body. The reason (or the HTTP
  status when the body carries none) is now appended, so a stale revision, a missing
  credential and an unanswered route no longer look identical.

Validated: `pnpm typecheck` clean; unit suite 827 passed (82 files), including
`tests/http-routes.spec.ts` (routes mount only once `webServer` appears; the disposer removes
them synchronously so the same path can be mounted again right away; the helper stays dormant
in a composition that never provides the service). Host suite 326 passed, 1 skipped, against
`DSHX_HARNESS=/home/zlw/github/deepseek-harness` on dsh 0.2.2-rc.2, including the real
`WebServer` cases in `native-tests/acp-bridge-route.spec.ts` (a disposed bridge frees exactly
its path) and `native-tests/agy-routes.spec.ts`. Live check: a `dsh web` instance started from
this checkout answered `200` with the settings document on `/api/fusion?view=settings` and on
the legacy path, where the previously running process on the same profile answered `401` for
both and `401` for the ACP bridge route. Not claimed: the load-order race itself is not
reproduced by a test (it depends on Host entry ordering); the regression test proves
registration waits for the service, and the live check proves the fixed build serves the
route.

## 1.2.1 — 2026-11-17

### The plugin activates in a headless composition that has no web Host

- **`inject` listed `webServer` and `sessionController`, so a composition without an HTTP
  server never activated the plugin at all.** `dsh headless`, the SDK and ACP profiles, and
  multica-style stdio hosts have neither service; Cordis refused the entry, which took the
  Fusion model menu, the sidebar and `/fusion` down with it — and also the built-in agy
  capability hosted by this same plugin, even though the agy side has always tolerated a
  missing web server (see [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md)). Both services
  are now resolved with `ctx.get(...)`, and every use degrades instead of failing:
  - The Fusion API routes (and the pre-rename legacy path) register only when a web server
    exists; with none, the plugin installs no route and still activates.
  - The model catalog falls back to `llm.listProviders()` / `llm.listModels()`, and
    `?view=catalog` answers `{ groups: [] }` instead of throwing.
  - `/fusion off` re-selects the Lead model only when a session controller exists.
  - Recovering a historical task falls back to `ctx.agents.get(...)`, then reports
    `Agent <id> not found` rather than dereferencing a service that is not there.
  - The ACP Sidekick bridge installs no route without a web server, and `hostOrigin()` reads
    it through `ctx.get`.

### One unreadable binding no longer hides every other selection

- **A binding frozen by an earlier version failed the whole `selected()` scan.** `readBinding`
  rejects a row whose `profile` no longer re-serializes to the same digest — which is exactly
  what happens when a profile gained a field since the row was written — and `selected()`
  mapped over every stored id, so a single stale row took the entire selection list with it.
  Each row is now read in its own `try`/`catch`: the unreadable one is skipped and the rest
  still resolve.

Validated: `pnpm typecheck` clean; unit suite 824 passed (81 files); host suite 326 passed,
1 skipped, against `DSHX_HARNESS=/home/zlw/github/deepseek-harness` on dsh 0.2.2-rc.2. Not
claimed: no headless Host was booted for this release, so "activates without a web server" is
established by the `inject` list and the degraded code paths, not by a running headless
process; and the 1.2.0 Foreman work this release merged over is covered only by the two
suites above, not by a new test of the combination.

## 1.2.0 — 2026-11-17

### Saving a combo no longer jumps the settings page back to the first one

- **The page reset the selection to row 1 after every successful save.** `save()` re-read
  the list from the Host and called `setActive(0)`, so a user who had edited the third combo
  was dropped onto the first one: the row on screen changed and the row they had just saved
  was no longer visible, which reads as "the save replaced my combo". The selection now
  follows the saved combo by id — the Host keeps the submitted order and reuses the ids it
  already knew — and falls back to the same position when a row was saved for the first time
  and received its id in the reply.

Validated: unit suite 821 passed (2 new cases in `tests/fusion-combos.spec.ts`: editing the
second combo keeps it selected with what was saved, and a newly added combo stays selected
once the Host issues its id — both fail if the selection is reset to 0). Not claimed: no
manual click-through of the settings page in a live browser; the case boundary is the
component's own fetch round trip.

### A configured Foreman now reviews every plan, with no policy to skip it

- **A configured reviewer could stay silent for an entire task.** The Foreman had three
  policies — `shadow` (audit, never block), `gate` (block on concerns) and `risk-gated`
  (block only when a deterministic trigger fired). Under `risk-gated`, an exploration order
  can never trigger: `#requirements` returns nothing for `explore`, `fusion_explore` passes
  no `allowedPaths`, grants no `authority`, offers no `uncertainties` parameter, and the
  empty-acceptance rule only applies to `implement`. Every reason was therefore impossible,
  and the only work order that existed during the survey was never audited. `session-0a8d7fbf`
  showed the consequence: the combo had a Foreman configured, the Lead dispatched a
  read-only `fusion_explore`, and no review happened at all — indistinguishable from a
  broken reviewer, with nothing recorded to say it had been skipped. `session-3bbd03e1` had
  `gate` on the same install, which is why the feature looked intermittent.
- **`policy` is gone. A configured Foreman reviews every candidate plan.** Explore, text and
  implement orders all go through the same gate: round 1 always reviews, concerns block the
  dispatch until every finding is accepted or overridden, and a revised candidate owes its
  own round-2 review. Skipping a candidate costs one model call, which is the price of the
  reviewer; a user who does not want it turns the Foreman off.
- **The setting is removed everywhere it was selectable or reported**: the profile type
  (`PairProfile.foreman.policy`), the settings page dropdown and its "Shadow / full gate /
  risk-gated" summary, the status and history projections, `PlanReviewRecord.policy`,
  `triggerDecision` on `plan-review/requested`, and `planReviewRisk` itself. The benchmark
  manifest records `on`/`off` because those are the only two arms left.
- **An existing combo keeps its Foreman.** A stored profile still carrying `policy` is read
  and silently upgraded rather than rejected: `foremanChoice` tolerates the retired key and
  drops it, so the next save writes the unconditional shape instead of switching plan review
  off as a side effect of an unknown field.
- **The prompt covers candidates that have no acceptance checks.** A reviewer asked to audit
  an explore order used to see empty `acceptance` and could only invent checks to complain
  about; it is now told to audit whether the goal, brief and constraints can answer the
  user's question and to leave the acceptance-audit arrays empty.
- **The fail-open notice no longer talks about policies.** A review that cannot finish is
  still recorded as `unavailable` and still lets the task continue, and the transcript
  notice now says only that the gate did not apply.

- **A frozen profile keeps the reviewer policy it was saved with, because its digest cannot
  move.** `readBinding` re-parses the stored profile with the current code and refuses the
  document when the result hashes differently, and every task record, checkpoint, keepalive
  row and model-control document in the store is bound to the digest that was recorded when
  the combo was frozen. Dropping `foreman.policy` moved that digest for every profile frozen
  while the reviewer still had one, so `BindingRepository.selected()` — which reads *every*
  binding at startup — threw `Frozen Fusion profile or prompt digest changed` and the plugin
  refused to activate ("1 entry did not activate"), leaving those sessions with no way to be
  opened and migrated. `completeProfile` now re-attaches a `foreman.policy` that the stored
  document carries, so a frozen profile hashes to exactly what it was frozen with. Nothing
  reads the key: `PairProfile` does not declare it, the reviewer reviews every plan
  regardless, and a combo created now has no policy at all.

Validated: unit suite 824 passed (1 new case in `tests/foreman-choice.spec.ts`: a stored
Foreman carrying `policy: 'risk-gated'` still yields a configured reviewer and drops the key;
3 in `tests/host-bindings.spec.ts`: a legacy binding with `policy` reads and keeps both its
digest and the key, a rollover rewrites it without moving either, a freshly frozen combo has
no key, and a tampered lead route is still rejected; 7 `planReviewRisk` cases and the
shadow-mode assertions replaced); host coordinator suite 326 passed (2 new cases: an
exploration candidate is reviewed like any other plan, and concerns from a configured Foreman
block the dispatch with no shadow bypass). Checked against the live store: all 52 stored
bindings read, and each still re-derives to itself and to its recorded digest. Not claimed:
the explore review was not replayed against a live provider, and the plugin was not
re-activated on a second Host — the case boundary is the Host gate, the recorded
`plan-review/requested` event, and `readBinding`/`selected()`, which is the call the boot
failure came from.

### A publication the user asked for after delegation can now be granted

- **A work order frozen without `authority` could never publish, and nothing could fix it.**
  `session-3bbd03e1` split "merge origin/main and push" into stages: the first order
  (fetch and read-only investigation) was delegated with `authority: []`, and the user only
  said "提交推送" once the merge was verified. Then all three routes were closed — a second
  `fusion_delegate` with the grant was refused (`A Worker already owns this task`), the
  Lead's own `git commit` failed at the OS layer (the Lead session is read-only, so
  `index.lock` could not be created), and `fusion_rework` had no way to grant. The Worker's
  `git commit` was refused with `FUSION_WORKER_AUTHORITY_DENIED` on every attempt, and the
  task could only end unfinished.
- **The Lead can now grant an action to the current work order through `fusion_rework
  authority`.** The grant is additive (a second grant widens, nothing takes an action back),
  repeatable, refused for any other work order, and recorded as a `work-order/authority-granted`
  event plus an `authority-grant:<taskId>:<uuid>` document carrying before/added/reason/cause,
  so a replay reproduces the exact authority the Worker ran under. The frozen publication
  prohibition is a shared constant and is removed from `forbiddenActions` when the order starts
  granting. Unlike `addAllowedPaths` and `checks`, a grant does not wait for a Worker report:
  the user often asks for the commit only after reading that report, and the grant is not a
  file scope.
- **The refusal now names the remedy.** `FUSION_WORKER_AUTHORITY_DENIED` tells the Worker that
  the Lead can grant the action with `fusion_rework authority` and that the identical command
  then runs, instead of leaving both roles with no next step. All four prompts say the same:
  the Lead must not run git itself or open a second order, and the Worker must re-run the exact
  command after the grant rather than working around the guard.

Validated: unit suite 825 passed (1 new case in `tests/reducer.spec.ts`: a grant only ever
adds, drops nothing, is refused for another work order, and removes the frozen prohibition);
host coordinator suite 268 passed (1 new "Sidekick authority boundary" case drives a real
Worker: `git commit` refused before the grant, `fusion_rework authority` from the Lead, then the
same command allowed and `work-order/authority-granted` in the event log). Not claimed: the
grant was not replayed against a live GitHub/GitLab push in this repository; the case boundary
is the Host guard and the recorded order.

### A review that cannot finish now says so, and gets room to finish

- **Thirty seconds was too short, and the overrun was silent.** A live `gate` combo's review timed
  out against Gemini 3.8 and the task dispatched as if the plan had passed, because every policy
  read `unavailable` as approval. New Foremen now start at 8192 output tokens and 120 seconds, up
  from 4096 and 30. The token budget had no room for a review that finds many problems, and an
  overrun discarded the assessment whole rather than keeping what it produced.
- **The prompt bounds its own output.** It asks for at most 8 findings, most material first
  (`FOREMAN_MAX_FINDINGS`), so an assessment fits its budget by construction instead of relying on
  the cap to cut it off.
- **A candidate with no verdict is announced in the conversation.** One notice per candidate and
  round, keyed by both so a replay stays silent: it names the reason, says the plan was never
  independently audited, and says the task continued under the fail-open policy. The status panel
  already carried the reason, but there a skipped review looked exactly like a passed one.
- **Fail-open is unchanged**: a review that cannot run still does not block the task. What changed
  is that the conversation records that no audit happened.

Validated: unit suite 824 passed (the settings defaults are asserted in
`tests/fusion-combos.spec.ts` — `maxOutputTokens: 8192`, `timeoutMs: 120000` — and
`tests/plan-review.spec.ts` asserts the prompt asks for no more findings than
`FOREMAN_MAX_FINDINGS`); host coordinator suite green (the fail-open case in
`native-tests/coordinator.spec.ts` now also requires exactly one `notice`-form message carrying
the reason and the fail-open sentence). Not claimed: no live provider timed out during the
change — the case boundary is an injected `unavailable` outcome and a thrown exception, not a
real 120-second ceiling.

### Picking a model by hand leaves Fusion, and the chip survives a pinned turn

- **An explicit pick was read as Fusion's own note to itself.** Fusion recognised its pin by
  comparing the recorded route with the route it last wrote, and `gz/gpt-6.1-sol` /
  `gz/deepseek-v4.1-flash` are also ordinary models to pick by hand: choosing one left the task
  undrained and the combo re-stated over the pick, which is how a DeepSeek session turned back
  into a Fusion task. The guard is now scoped to Fusion's own append, so a later event that
  happens to name the same route stays a user choice; restart recovery survives, but only until
  this process has observed a real selection.
- **The composer names the combo while the pin is in force.** A step on 0.2.2 reads its route
  before any listener runs, so a pinned turn legitimately records the pair's Lead. The inline
  label now names the bound combo for the trigger and the menu's current value, while option rows
  and every unbound session keep the catalog's own name and badge.
- **The role and permission chip no longer disappears for the whole turn.** It read the
  composer's selection, which a pin replaces, so it vanished for exactly the turn it is wanted
  in; it now follows the durable task and names the active role, its model and its mode beside
  the native `Custom` control.
- **Known limit, unchanged:** a switch onto one of the pair's own routes can still read as the
  combo for one poll (2 s while a stage runs, 15 s while it waits). Only the Host knows a
  selection was a user choice, and the client keeps no second copy of it.

Validated: unit suite 824 passed (`tests/route-pin.spec.ts` drains on a hand-picked Lead or
Sidekick route while Fusion's own pin keeps the turn, and stops reading a frozen route as Fusion
once a real choice was seen; `tests/fusion-permission.spec.ts` names the bound combo on the
trigger and in the menu value, keeps option rows on their own model, and keeps the chip visible
while the pin is in force). Not claimed: no live 0.2.2 click-through — the case boundary is the
recorded selection event and the rendered slots.

### A combo can name a Foreman that audits the plan before the Sidekick runs

- **A third, optional route on the pair: `foreman`.** It audits the candidate work order in a
  separate context — no agent, no tool table, no write lease — after the order and its checks
  exist and before `work-order/prepared` and the dispatch, so it reviews exactly what the
  Sidekick is about to receive. A missing `foreman` means off, with no separate flag, and it is
  frozen with the profile like the other roles.
- **What it audits:** whether every hard requirement is covered, whether green checks can still
  be a false pass, whether a Lead decision has a counterexample, whether an unverified assumption
  is treated as fact, whether brief, constraints, allowed paths and acceptance contradict each
  other, and whether a requirement is materially ambiguous. Deterministic checks (fields,
  verbatim requirements, path legality, parsers, authority) stay in the Host, which lints the
  candidate before any model call.
- **Concerns block the dispatch** until the Lead answers every finding: accept and revise — the
  revised candidate owes its own round-2 review — or override with a reason that is recorded. An
  override covers only the candidate that was reviewed, so overriding while quietly changing the
  plan is refused, and a round-1 acceptance is not an approval of whatever candidate arrives
  later.
- **Every failure mode fails open** (timeout, quota, unavailable route, unparseable output) and is
  recorded as `unavailable`, while the Host's own validation still fails closed.
- **The settings page carries it per combo**: a switch, a required model (the same model as the
  Lead or Sidekick is allowed, and only warned about), reasoning effort, output ceiling and
  timeout, each validated as it is typed. A saved Foreman survives the read that follows a save;
  the combo reader rebuilt each role one by one and silently dropped it there, which read as "I
  enabled it and it disappeared".
- **It is attributed and reported**: calls carry the `foreman` usage purpose with their own tokens
  and cost, the history panel shows each task's review outcome and findings, and review rounds are
  deliberately not counted as Sidekick rework rounds.

Validated: unit suite 824 passed (`tests/plan-review.spec.ts` covers the candidate digest, the
deterministic lint, strict assessment parsing and the gate decision; `tests/foreman-choice.spec.ts`
the profile shape; `tests/status-index.spec.ts` the per-task review rows and metrics;
`tests/fusion-combos.spec.ts` and `tests/fusion-settings-layout.spec.ts` the settings switch and its
validation; `tests/benchmark-foreman.spec.ts` the on/off arm). Not claimed: the reviewer was not
compared against a held-out defect corpus, so its hit rate on real plans is unmeasured.

## 1.1.2 — 2026-11-16

### A combo switch no longer dies on the route it is leaving

- **The first step after a switch could still carry the virtual route, and the Host's switch
  compaction priced it.** Switching to "6.1 --> V4.1 Flash" mid-conversation ran one step with
  `dsh-fusion/pair-77828c13` as the step's selection — the drain that installs the new task's
  scope is asynchronous, so the running reservation had nothing to pin — and the Host's
  automatic compaction on a model switch then asked that virtual route for its window:
  `Cannot switch to dsh-fusion/pair-77828c13: context compaction failed: no context capacity …
  configure contextWindow on that adapter model` (session-7f326880, turn 2). Two changes:
  exact-route resolution now answers with the Lead's `context` and `defaultMaxTokens` — the
  window the pair's requests actually land in — and `agent/pre-step` re-pins the frozen route
  after the scope is ready, so the next step is back on the pair even when this one captured
  the virtual selection.
- **A pin a restarted Host no longer remembers was read as the user leaving Fusion.** The map
  that recognises Fusion's own appends lives in the Host process. After the restart, the newest
  recorded selection was still the pair's Lead, so the next turn was treated as a model switch
  — it drained the task and then refused every request with `先停止当前 Fusion 任务，
  再切换模型。` (session-7f326880, turn 3). A route that is exactly the frozen Lead or Sidekick
  route is now recognised as Fusion's own: the turn is allowed, and the combo is re-stated at
  the running reservation instead of draining.
- **The switch notice after a combo change stays.** `model changed: gpt-5.6-sol → gpt-6.1-sol`
  is truthful — those turns were another model's — and only the pseudo notice that compared the
  virtual menu route with the pinned one is suppressed.

Validated: unit suite 691 passed (4 new cases: two for a restarted Host's pin, two for the
catalog's capacity answer, both red on 1.1.1's source); host suite 303 passed / 1 skipped
against a `0.2.2-rc.2` checkout. Not claimed: the combo switch itself was not replayed against a
live provider in this release; the fixed paths are covered by the unit cases and by the existing
host workflow cases, which still pass unchanged.

## 1.1.1 — 2026-11-16

### The model menu keeps the combo, not the pair's Lead

- **A pinned turn never gave the user's selection back.** On a 0.2.2 Host, Fusion records the
  pair's Lead route as the step's `model/selection` before the loop fixes that step, because a
  proposal that differs from the captured route throws. That pin is also the newest recorded
  selection, and the composer reads `modelSelection.next` (`pending ?? lastUsed`), so a session
  opened on a Fusion combo displayed the Lead from its first turn on and never went back:
  session-7f326880 picked the combo "6.1 --> Gemini 3.8" and the composer showed
  `gz/gpt-5.6-sol` for the whole task. `restoreNativeIntent` existed for exactly this hand-back
  but nothing called it, and `consumeNativePin`/`consumedNativePin` were never read. The restore
  now runs on the Agent's `running` → `idle` transition, and the unused pair is gone.
- **The hand-back cannot run from `turn/end` itself.** A Session refuses to append while another
  append is being published (`session append cannot reenter while another append is being
  published`), so the restore waits for the status transition that ends the turn. A turn that is
  still running keeps showing the pair's Lead: the Host fixes a step's route before any listener
  can run, and every step of that turn dispatches with it.

Validated: unit suite 687 passed, including 3 new cases in `tests/route-pin.spec.ts` that are red
on 1.1.0's source; host suite 303 passed / 1 skipped against a `0.2.2-rc.2` checkout
(`DSHX_HARNESS=<checkout> pnpm test:host`), including the updated native-selection case that now
asserts the newest recorded selection names the combo once the turn settles. Not claimed: the
composer was not driven through a browser in this release; the projection's `next` was verified
from the recorded events it reads.

## 1.1.0 — 2026-11-15

### A stopped task no longer locks the conversation

- **A gate that had nothing behind it opened itself.** The start-up check armed "interrupted work"
  for any trace it found and then never let go. Two of those traces were bookkeeping, not work:
  `runtime.background` (which only says the last handoff did not block the Lead's turn) and an
  `accepted` outbox row (which stays forever after the Worker's turn ends). A session whose Sidekick
  had stopped on a provider error was therefore gated on the next start, and from then on **every**
  message ended in four milliseconds with nothing in it — `turn/end blocked`, the model never called
  (session-6fdb5c73). Both traces now count only while the task could still have work, and a start
  that finds nothing unfinished records what it checked and opens the gate itself. A real
  interruption still sets it: a live lease, a prepared dispatch, an uncertain check, a pending
  approval, an unfinished compaction, a recorded native effect, or a handoff the Host did not see
  end. A pause the Host recorded *while* a handoff was live never opens by itself.
- **An inspecting Lead answers instead of going dark.** While a task waits on human inspection,
  a turn the user starts afterwards now runs in read-only mode: the Lead reads the ledger, the
  files and a confined shell, and says what it sees. Delegation, writes, submission and commands
  stay refused, and the **first** such refusal ends the turn, so a model cannot turn the refusal
  into a retry loop (measured: seven requests where the turn used to send none). A deliberate pause
  keeps its old contract — the Fusion panel and `/fusion resume` are the way forward, and a turn
  that was already running when the gate armed still stops.
- **The blocked-turn notice names the command that works.** It used to recommend the recovery
  panel's "Continue once", which that panel disables in exactly this state, and "send another
  message", which hits the same gate. It now names `/fusion recover <inspection note>` (with
  `--effects-stopped` when commands are unfinished) and `/fusion resume`, and says plainly which
  actions do nothing until then.
- **`README` gained a "Commands and states" section** (both languages): the `/fusion` command table,
  and the three ways a task stops — model pause, interrupted work awaiting a check, completed — with
  what continues each one. Last release documented installation and the task loop but never the
  commands, so a stopped task looked like a broken one.

Validated: unit suite 683 passed / 1 skipped; host suite 286 passed / 9 skipped / 9 failed against the
pinned `0.2.1-rc.2` checkout, where the nine are the PowerShell-7-dependent cases that fail
identically on the unmodified source (this machine has only Windows PowerShell 5.1). The new native
test drives a recovering task: the read executes and its content reaches the transcript, the
delegation is refused naming `/fusion recover`, the gate stays closed, and the turn stops after
exactly two requests. Two further host-suite cases that were already failing on `main` are fixed
here: the start-up check opening a gate the Host had set mid-handoff, and `gates replacement during a
background rework`. Not claimed: the read-only turn was not exercised against a live Antigravity
route.

## 1.0.2 — 2026-11-13

### DeepSeek Assistant 0.2.2
- **Fusion runs on DSH 0.2.2 again, and still on 0.2.1.** Upgrading the Host from 0.2.1-rc.5 to 0.2.2 aborted every
  Fusion turn with `scope.tools.presentAs is not a function` (117 of 301 host-suite cases failed). 0.2.2 replaced the
  per-agent *presentation mode* with a per-scope *executor*, and six further API changes followed from it. Each is now
  absorbed behind a runtime contract probe rather than a version string:
  - `presentAs()` → `setExecutor()`: Fusion registers a `RestrictedExecutor` over
    `@deepseek-ai/dsh-tool-executor-native` whose `describe()` filters the table to the role ceiling. This is the only
    point that can narrow a table on 0.2.2 — `tools.restrict()` never applies to the viewing scope's own
    registrations, and the tools a role ceiling narrows are exactly that (Fusion's capabilities, a preset's
    `write`/`edit`). The registration is **one per Agent and never released early**: a second `setExecutor` throws, and
    disposing it leaves the selection *unavailable* rather than restoring the deployment's.
  - `system-prompt/assemble` no longer carries `tools`, so the tool-table projection that 0.2.1 relied on is skipped
    and the request table comes from the executor.
  - `tools.execute()` takes a raw batch on 0.2.2; `executeSingleTool` builds the one-call batch and re-attaches the
    batch-level deferred context, which a single-call caller would otherwise silently lose.
  - A batch has no nested-dispatch concept, so a Fusion-dispatched acceptance check records itself as its own root.
    `rootCallIdOf` answers the enclosing identity from a correlation Fusion keeps around dispatch, which is what
    approvals, effects and review receipts key on.
  - `agent/request` now rejects a proposal that changes the route fixed during step preparation. The frozen physical
    route is pinned at the running reservation (and re-pinned after the virtual selection is recorded), and the user's
    own choice is restored on detach rather than on every turn end.
  - `drainChildren`/`drainContinuableChildren` are gone and `startActivation` returns a receipt. The receipt is retained
    per child on the plugin context — not on one transport instance, so a coordinator replacement can still release its
    predecessor's child — and released by cancelling first and awaiting quiescence. `drainDescendants` is never used: it
    permanently records the Lead as a closing subagent-tree root, which would refuse every later delegation.
- **The supported range is now a union, `>=0.2.1-rc.5 <0.2.2-0 || >=0.2.2-rc.2 <0.3.0-0`.** The previous
  `>=0.2.1-rc.5 <0.3.0-0` passed DSH's own gate (which uses `includePrerelease`) but failed `scripts/link-host.mjs` and
  the peer checks, because plain semver rejects a prerelease unless a comparator carries a prerelease on the same
  major.minor.patch. A single span cannot cover two minor lines of prereleases.
- Validated against both checkouts: the host suite is **300 passed / 1 skipped** on `0.2.2-rc.2` (was 42 passed / 258
  failed before this release) and unchanged on `0.2.1-rc.5`, and the unit suite is 558 passed. Both branches of the new
  seam are covered by `tests/tool-seam.spec.ts`, which pins the 0.2.1 shape, the 0.2.2 shape, the batch argument
  encoding, the deferred-context re-attachment and the `rootCallIdOf` correlation.
- Not claimed: `0.2.2-rc.1` is untested and deliberately outside the range — it is the only release where the receipt
  contract exists without the flattened activation spec, and nothing here was validated against it.

## 1.0.1 — 2026-11-13

### ACP
- **A configured ACP route is no longer replaced by a phantom provider named `get`, and its model list is no longer
  empty.** `acp.agents` is declared volatile so the Host publishes a live-editable settings form, which makes a parsed
  Config carry a `{ get() }` reference at that key instead of the profile map. `agentsOf()` read it with
  `Object.entries`, so the reference's only own key — the `get` method — became the route id: the adapter registered a
  provider literally named `get` whose profile was `undefined`, and the configured route never reached the catalog.
  The failure surfaced in the model picker as `get failed to load: Cannot read properties of undefined (reading
  'length')` (from `profile.models.length` in `listModels`) with the real route missing entirely — every ACP agent,
  Devin included, therefore offered no models. `agentsOf()` now unwraps the reference before reading, and still accepts
  a plain map for callers that pass raw settings. `AcpConfig` documents the trap so the declared type is not mistaken
  for the runtime value.
- Validated against the real agent: a Devin route (`devin acp`) configured only through `acp.agents` now lists
  `SWE-2 Flash Medium` and `SWE-1.6 Slow` plus the `default` fallback, and `resolveModel` returns context window and
  reasoning metadata for them. Regression tests in `tests/acp-import.spec.ts` fail on the previous code and pass on
  this one; the full suite is 648 passed, the host suite 300 passed / 1 skipped.
- Not claimed: that fix covers reading the route map only. Any other consumer that reads `config.acp.agents` with
  `Object.entries` would hit the same reference; `lib/types` is rebuilt to ship this one already unwrapped.

## 1.0.0 — 2026-11-13

### Naming and upgrade
- **The package is now `@sqdr2/dsh-agent-studio-fusion`, plugin id `dsh-agent-studio-fusion`.** 1.0.0 is the first
  release of that name and the first release after 0.3.9; the 0.4.x and 0.5.x numbers existed only in this
  repository. `@sqdr2/dsh-fusion` stays on npm at 0.3.9 and is not updated again.
- What the rename does **not** touch: the `dsh-fusion` provider route, the `auto`/`pair-*` model ids, the `/api/fusion`
  path and the `Fusion · <name>` model-menu label. An existing conversation keeps its combo.
- What moves: the state directory becomes `$DSH_HOME/plugins/dsh-agent-studio-fusion/`. `dsh-fusion`,
  `dsh-model-fusion` and `dsh-agent-studio` directories are adopted on first start
  (`src/dsh-agent-studio-fusion.ts`), along with the whole ledger inside them.
- Message sources are now written as `plugin:dsh-agent-studio-fusion`. The three older kinds stay readable through
  `isFusionSourceKind`, so context restored into a session started under an older name is still matched.
- `docs/MIGRATION-AGY.md` and `docs/MIGRATION-ACP.md` now use the current row id in their copy-paste blocks; they had
  still named `- id: dsh-fusion` / `name: '@sqdr2/dsh-fusion'`, which the loader no longer matches.
- **Publishing the new name needs staging.** A bypass-2FA granular token cannot create a name that does not exist yet: it
  answers `E404 Not Found - PUT` (not 401), on npm 11 and 12 alike. The first release of a name is uploaded with
  `npm stage publish` and approved in the browser with 2FA (`RELEASING.md`, `RELEASING.zh.md`). CI's `publish.yml` then
  finds the version already on npm and exits successfully without publishing, so the tag run is a build-and-test gate,
  not the publisher, until a trusted publisher is added for this name.

### Client
- **The Fusion panel becomes the combined studio page**, titled `DSH Agent Studio With Fusion` (one constant,
  `src/client/studio-brand.ts`). The sidebar row keeps its short label `Fusion` and the panel id stays `fusion`; the
  provider route and model ids are unchanged (see the Naming section above for what did move), and no Harness-wide
  branding slot is claimed — `sidebar.brand.mark` / `sidebar.brand.name` are deliberately left to the official brand
  plugin.
- The page has three labelled section buttons — **Fusion combos** (default), **Antigravity**, **ACP routes** — as a
  `<nav>` of plain buttons with `aria-pressed` and `aria-controls`, not `role="tab"`: no roving tabindex or arrow-key
  focus management is implemented, so the page does not claim tab semantics. All three regions are always in the
  document (so every `aria-controls` resolves) and are toggled with `hidden`; only their contents mount on demand.
- **Section state preservation is deliberate and asymmetric.** The Fusion region is hidden, never unmounted, so unsaved
  combo edits and the selected row survive a round trip through another section. The Antigravity console *is* mounted
  only while selected, because it starts a 3s status poll and reads the account pool on mount. Regression coverage:
  `tests/fusion-brand.spec.ts`.
- The pairing explanation moved out of the page header into the Fusion section, and the header now describes the
  combined workspace in one bilingual sentence.
- **New ACP section** (`src/client/AcpSettingsGuide.tsx`): an honest setup guide. It shows a minimal valid plugin entry
  (`id`/`name` plus `acp.agents`), and states the real field rules: `command` is required and an absolute path is only
  *more reliable* (a PATH command works — the route is spawned directly), `args` may be empty, and `models` may be
  omitted entirely, in which case `discoverModels` asks the agent and the `default` model is the fallback. It also notes
  the restart requirement, that configured routes then appear in the native and Fusion model selectors, and that an
  existing `dsh-tauri-acp` must be disabled first. It offers **no** route list, model discovery, live status or save
  control — the upstream configuration editor is still not ported, and
  [`docs/ATTRIBUTION-ACP.md`](docs/ATTRIBUTION-ACP.md) now says so explicitly.
- `assets/icon.svg` is shipped (relative, in-package, under the 256 KiB cap) and declared as `icon` plus a `./icon`
  export, so the Plugins page shows the Fusion convergence mark instead of default artwork.
- The package description now leads with the product name: `DSH Agent Studio With Fusion: one plugin for DeepSeek
  Assistant, …`. No version bump.

### Docs
- [`docs/MIGRATION-ACP.md`](docs/MIGRATION-ACP.md) (Chinese + English): manual disable/remove of `dsh-tauri-acp`, the
  move into `acp.agents`, the restart requirement, and what is and is not preserved. It claims no release history (this
  ACP integration is still unreleased) and states exactly one **verified** conflict — one provider route name registered
  twice is refused with `DUPLICATE_ADAPTER`. Fusion's own `/api/fusion/acp-mcp` bridge is described as Fusion-specific
  hardening, not as something inherited from upstream.
- [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md): console location updated to the new **Antigravity** section, and the
  account-pool row now says the copy is needed when the two resolved roots differ — whichever of `DSH_HOME` /
  `DSH_STATE_DIR` was relocated.
- `README.md`, `README.en.md`, `INSTALL.md`, `INSTALL.zh.md`: new titles and openings describing one integrated plugin,
  and no remaining claim that `dsh-agy-worker` or `dsh-tauri-acp` has to be installed separately.

### Validation
- `pnpm typecheck` clean on Node 24.13.0.
- `pnpm test` 646 passed in 75 files, including `tests/fusion-brand.spec.ts` (page structure, draft preservation, lazy mounting, plus a
  package-icon/metadata check and a client-`apply` check that exactly one `main`/`sidebar.panellist` entry is registered,
  labelled `Fusion`, with no `sidebar.brand.*` claim) and the adapted `tests/fusion-settings-agy.spec.ts`.
- `DSHX_HARNESS=… pnpm test:host` 300 passed, 1 skipped, including `native-tests/agy-process.spec.ts`. The literal
  `plugin:dsh-fusion` source-kind assertions in `native-tests/coordinator.spec.ts` and `native-tests/context.spec.ts`
  were still pinning the pre-rename kind, so 15 of those cases failed against the renamed producer; they now use
  `isFusionSourceKind`, the same guard the runtime reads with.
- `pnpm build` regenerates `lib/`.
- **Offline only.** `native-tests/agy-process.spec.ts` drives the real adapter against the fixture child at
  `native-tests/fixtures/fake-agy.mjs` and replays the recorded step through the production `agy_tool` mirror — with
  every home, state dir and conversations dir redirected into a temp tree, no network, no Google login and no paid
  model call. It is **not** a Fusion-worker end-to-end test: no Lead, no work order, no coordinator. No live install,
  Host restart, profile edit or real `agy` run happened in this stage either, and the GUI on this machine still serves
  the previously published artifacts, so nothing here claims a live deployment or a screenshot.

## 0.4.0 — 2026-11-12

### Runtime
- **The complete Antigravity (agy CLI) capability is now built in**, ported from
  [`SQDR2/dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker) 0.6.3 (`ab49704`) under its MIT license
  ([`docs/ATTRIBUTION-AGY.md`](docs/ATTRIBUTION-AGY.md)). One plugin identity: `installAgy(ctx, config.agy)` replaces the
  upstream entry `apply()` and returns the disposer that unwinds every effect, so a disabled `agy` block (or an unloaded
  plugin) rolls the whole capability back. `cordis.patch.yml` still inserts only `dsh-fusion`.
- Kept verbatim from upstream: the `antigravity` provider route, the `/agy` command family, `agy_ask` and the `agy_tool`
  mirror (with its `tools/pre-execute` bypass), the full `/plugins/agy-worker/*` HTTP surface (status, auth, pool,
  config, qr, media, assets, mermaid), the account pool and per-account credential isolation, quota polling and weekly
  warmup, media staging and TTL sweep, the doctor report, and the reverse MCP bridge (`src/host/agy/bridge.mjs`, shipped
  as `lib/bridge.mjs`). `src/host/route-transport.ts` is untouched: it already maps `antigravity` → `agy_tool`.
- Config moved into a `agy` subconfig on this plugin's entry; the layering is unchanged (`DSH_AGY_*` env > runtime
  overrides file > the `agy` block > defaults). `qrcode` and `undici` became runtime dependencies because the build keeps
  bare specifiers external, and `@types/qrcode` joined the dev dependencies.
- `enabled` is an **install-time** switch, exactly as upstream had it: `enabled: false` mounts no `antigravity` route and
  no background capability (quota polling, warmup, MCP bridge, media sweep), while `/agy` and the
  `/plugins/agy-worker/*` management routes stay mounted for inspection. Neither `/agy` nor `POST /config` accepts
  `enabled` as a settable key, so re-enabling means changing the block and restarting the Host.
- The `installAgy` disposer now also tears down the two reactive sub-fibers (`tools`, `webServer`) it creates, so
  one call removes the `agy_tool` registration and every `/plugins/agy-worker/*` route — a regression this release's
  native test pins.
- State: the **work-state path is unchanged** (`$DSH_HOME/agy-worker/` for overrides, session bindings, media cache and
  warmup history), while the **account pool moved** to `$DSH_HOME/agy-accounts/pool.json` (upstream resolved it from
  `DSH_STATE_DIR`, falling back to `~/.dsh`). Nothing migrates user state automatically, edits a profile or uninstalls the
  old package; the one manual copy — needed only when `DSH_STATE_DIR` and `DSH_HOME` name different roots — is in
  [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md).

### Client
- **FusionSettings is still the only primary panel and the only sidebar entry.** The Antigravity console is a collapsible
  section at the bottom of that page (`isModal: false`); the standalone plugin's own `main`, `sidebar.panellist`,
  `plugins.bundle.config`, `plugins.row.config` and session-header registrations, its settings-nav icon injector and its
  page-wide mermaid / reasoning / images / decisions / scroll scanners were deliberately not ported.
- Exactly two keyed `tool.call.toolview` views are registered, as upstream had them: `agy_tool` and `run_code`. The
  `run_code` view recognizes the generated mirror wrapper through `mirrorStepInvocation` — the same strict two-line parser
  Fusion's own activity projection uses — and renders every other Code Mode program as the ordinary code card, so
  `constraints` on plain code rendering hold. Fusion's own activity cards are unchanged.
- The console's custom properties are declared on `.agy-console` instead of `:root`/`body` (and its overlay marker is
  `agy-console-modal-open`), so the Antigravity palette cannot repaint Fusion's pages.

### Docs
- [`docs/ATTRIBUTION-AGY.md`](docs/ATTRIBUTION-AGY.md) carries the upstream MIT text, the
  `dsh-agy-link → dsh-agy-worker → this package` chain, what was ported, what changed, and the bundled
  `mermaid.min.js` licenses. [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md) documents the mandatory manual
  disable/remove of the old package (duplicate route / provider / command / toolview hard-fail) and the manual account
  copy, in Chinese and English. `INSTALL.md`, `INSTALL.zh.md`, `README.md`, `README.en.md` and
  [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) are updated.

### Validation
- `pnpm typecheck` clean on Node 24.13.0.
- `pnpm test` 605 passed in 72 files, including new `tests/agy-host-config.spec.ts`, `tests/agy-state-paths.spec.ts`,
  `tests/agy-toolview.spec.ts`, `tests/agy-routes.spec.ts` and `tests/fusion-settings-agy.spec.ts`. The AGY cases run on a
  throwaway `$DSH_HOME`, so no case can create or rewrite a user's real `agy-worker` state.
- `DSHX_HARNESS=… pnpm test:host` 293 passed, 1 skipped, including the new `native-tests/agy-routes.spec.ts` (5 cases:
  provider/command/route registration against the real registries, the `/status` payload over real HTTP, the `agy_tool`
  mirror in the real tool runtime, full disposer teardown, and the `enabled: false` behaviour).
- `pnpm build` emits `lib/dsh-fusion.js`, `lib/client.js`, `lib/bridge.mjs` and `lib/assets/mermaid.min.js`.
  The vendored `assets/mermaid.min.js` is byte-identical to upstream (`cmp`-verified) and keeps its own bundled-license
  banner; the 3.4 MiB size tradeoff and how it is packaged are recorded in
  [`docs/ATTRIBUTION-AGY.md`](docs/ATTRIBUTION-AGY.md#size-tradeoff-accepted-decision).
- **Not claimed:** no live `agy` binary run, no real Google login, no real Worker turn on the `antigravity` route — the
  port is verified structurally (registration/unwinding, config layering, path resolution, tool-card projection) and by
  the existing suites. Windows and macOS were not exercised for this release.

## 0.3.9 — 2026-11-11

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
- **Measured, and the brief-shape rule was narrowed because of the measurement.** A pilot
  (`benchmark/rebench/results-p5/REPORT.md`) ran the same committed code and the same Fusion pair over four tasks, varying
  only `prompts/`: arm A the pre-change prompts, arm B the rules below. Arm B was clearly faster — wall time 1559 s → 869 s
  median (−44%), worker tool calls 84 → 54.5 (−35%) — and resolved **less**: 3/4 → 2/4, losing
  `ucfopen__canvasapi-716` on one FAIL_TO_PASS test with all 60 PASS_TO_PASS still passing (an incomplete fix, not a
  regression). Cost did not move (−1%) and rework rounds rose (1 → 2), so under the plan's own admission thresholds
  (`docs/DEVIN-LOCAL-FUSION.md` §7.4) the change cannot merge unchanged. The rule the data implicates is now narrower in
  both Lead variants: a fenced snippet is advice about one settled spot, explicitly *not* the boundary of the change, and
  the Worker still reads the surrounding code and covers the cases next to it. `tests/prompts.spec.ts` pins that scope.
  Check damping, consolidated rework and mid-handoff steering stay: nothing in the pilot points at them, and the next
  round (arm C) tests them without the wide snippet rule.
- **Delegation economy, aligned with the Devin rules that explain its 3.4× wall-time advantage** (measured on the same
  model pair in `benchmark/rebench/results-devin-r1`: 4/4 resolved at $2.73 in 20.1 min vs 3/4 at $4.81 in 6.0 min).
  `prompts/lead.md` / `prompts/model-lead.md` say to hand over the *shape* once an edit is settled — exact file,
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
- The prompt changes **were** A/B measured once (see the measurement entry above), and that measurement is n=1 per cell over
  four public tasks: it cannot rank the two arms statistically and is reported as an observation. The narrowed snippet
  rule has **not** been re-measured; the next round (arm C) is what would show whether the loss is gone.
  `deepseek-v4.1-flash` has no list price in `plan-phase5.json`, so every cost figure is a lead-only lower bound.
- Preserving a Worker's background processes **across handoffs** is not achievable from the plugin: the Host cancels a
  job when its owner Agent's scope is disposed, which is exactly what a settled handoff does. The shipped
  `preserveRuntime` covers one handoff (report lands while the job runs, the next brief is told what it was) and never
  claims more. See `docs/DEVIN-LOCAL-FUSION.md` §9 for the measurement and the two Host-side options.
- The declared runtime's `strandedRetained` recovery path is covered by unit-level reasoning and the existing
  inspection gate, not by a host test that restarts the Host process with a live retained job.

### Validation
- `pnpm test`: 504 tests in 66 files pass (15 of them new: 7 in `tests/authority.spec.ts`, 8 in
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
