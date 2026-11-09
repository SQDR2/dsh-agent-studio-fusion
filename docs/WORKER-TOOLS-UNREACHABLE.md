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

## The other half: routes with no Host tool bridge at all (ACP, session-6113b527)

The section above is the *bridge* case: the route can call Host tools, Fusion just failed to advertise the transport
that carries them. Session `session-6113b527-2688-4ff2-b179-2745f683a636` was the opposite case, and Fusion reported it
badly in three separate ways.

**What happened.** The Worker route was `devin / swe-2-flash-medium`, served by the third-party `dsh-tauri-acp`
provider. Its own bundle hardcodes `mcpServers: []` in `session/new` (`node_modules/dsh-tauri-acp/dist/index.js`) and
never reads `request.tools`, so no Fusion tool can ever be called on that route — no setting in this plugin changes
that. The question was a text-only one ("which model are you actually running?"). The Worker answered it correctly in
prose in step 1. The Host then sent the generic repair instruction ("Prose alone cannot complete this work order"),
so step 2 was spent explaining that it could not submit at all, and the task ended `WORKER_TOOLS_UNREACHABLE` with the
Lead telling the user the Sidekick never replied.

**Three defects, three fixes.**

1. *Wrong remedy.* The `WORKER_TOOLS_UNREACHABLE` text only described the agy remedy (`mcpBridge on`,
   `permissionMode skip`, `agy_tool`), which is meaningless for an ACP route. It is now route-aware
   (`src/host/worker-terminal.ts`): only a route Fusion actually wires (`antigravity`) is told to check those settings;
   every other route is told that the adapter itself must forward Host tools over MCP, that no Fusion setting can do it,
   and that workspace work needs a direct-call route instead. Zero tool calls is still named as a route/adapter
   mismatch, never as a provider outage, quota limit or model capability.
2. *Discarded evidence.* The captured request's own message — never an older step's — is now carried into the verdict
   as `workerSaid` (`{ text, truncated, note }`, at most 2000 characters), marked unverified prose, so the Lead can quote
   what the Sidekick actually said instead of denying that it answered. The record is persisted with the order mode, so
   `fusion_wait` re-reports exactly the same evidence.
3. *No channel for a text answer.* A text-only assignment whose route cannot call tools had no legal way to report.
   It now has one **strictly bounded** protocol, described below.

**The structured text report protocol (`src/host/text-report.ts`).** `fusion_submit_result` remains the preferred and
primary path; nothing changes for direct model routes or the agy bridge. Only when the order is `mode: 'text'` may the
Worker end its turn with exactly one ```` ```json ```` block. Fusion does not probe the route to decide that: a strictly
bound block is accepted for a text order, while a route that can call `fusion_submit_result` should still use it, and a
workspace or exploration order never accepts the block:

```json
{"fusionTextReport": 1, "workOrderId": "<the frozen order id>", "revision": 1,
 "briefRevision": 0, "operationId": "<when the order shows one>",
 "status": "completed", "summary": "<answer and what was done>", "unresolved": []}
```

- Bound to the current order and brief: `workOrderId` and `revision` must match the frozen order, `briefRevision` must
  match the brief this generation was dispatched under and is required whenever that brief context has one (and
  `operationId`, when present, must match too). Another order, another revision or brief, an unknown field, more than
  one block, an unclosed block, non-JSON, or plain prose are all refused, and the refusal reason is recorded and named
  in the diagnosis.
- Same shape and limits as the tool (`summary` ≤ 16 000 characters, `unresolved` ≤ 30 items of ≤ 2000), so the report
  travels through the *existing* validation, frozen checks (empty for a text order), review ticket and Lead acceptance.
  Fusion never accepts prose on its own, and the review reply marks such a report `submittedVia: 'text-report'` with an
  explicit warning that it arrived as text rather than as a tool call.
- Discoverable: the text-order brief, the one repair instruction and both Worker prompts state the exact field names
  and tell the Worker to copy the ids from its frozen order.
- No wasted generation: when a valid bound report is already the captured request's complete message, the
  turn-stopping repair is skipped instead of asking for what is on the table.

**Boundaries kept.** `mode: 'implement'` and `mode: 'explore'` still require real Host tool calls — a perfectly bound
text block on a workspace order is refused, the workspace is untouched, and the task ends `WORKER_TOOLS_UNREACHABLE`
with an explicit statement that only a real tool call can complete that order. This is *not* full ACP Sidekick support:
an ACP route still cannot read files, run commands or edit a workspace through Fusion, and the missing MCP bridge lives
in `dsh-tauri-acp`, outside this repository.

**Per-order, per-brief evidence.** `workerToolEvidence` used to count `tool/call` events across the whole child
session, so a persistent Worker that dispatched real tools under an earlier order could mask a current order that called
none. It is now anchored to the first `worker-request:<childId>:<turn>:<step>` row that names the current work order.

The text channel is stricter still. Rework keeps the frozen `order.revision`, so the **brief revision** is the only
durable boundary between a generation that already answered and the one that must answer again. A report is read only
from the captured request of the *current* brief revision and only from that request's single complete, non-interrupted
message; its `briefRevision` field must match too, so a copy of an older block is refused rather than silently adopted.
An older step's valid block in the *same* brief is never a fallback: if the captured request was interrupted or produced
no complete message, nothing is adopted and the task is diagnosed as having no report; the older steps are consulted only
to explain a refused block (`textReportRejected`). That matches the turn-stopping repair decision, which already looks
only at the captured request. With no captured identity the check fails closed instead of widening to the whole log.
`fusion_rework` and `fusion_delegate_text` deliveries re-state the protocol with the new brief revision, so the value
stays discoverable.

**Bounded in the ledger, not only in the reply.** The retained Worker quote is cut to 2000 characters when it is stored
(`workerText`, `workerTextTruncated`), and a refused block's reason is stored as `textReportRejected` (shown as
`textReportRefused`) in bounded form, so `fusion_wait` can explain a wrong `workOrderId`/`revision`/`briefRevision`. On
routes Fusion does not wire, the verdict names no agy setting and makes no blanket claim about how every ACP adapter
builds its session.

**The other defect this session exposed.** `runNativeChecks`/`runBaselineChecks` recorded a receipt's `inputSnapshot`
but never its `outputSnapshot`, while `src/evidence/receipts.ts` requires both to equal the candidate snapshot. Every
task with an acceptance command therefore failed verification as `CHECK_SNAPSHOT_MISMATCH` and could never be accepted.
The producer now takes the batch's real closing snapshot once every command in it has finished, confirms the source did
not change, writes it into each completed receipt, and re-runs the same check in the baseline path. A regression case in
`native-tests/coordinator.spec.ts` asserts the persisted receipt pair, because the defect was invisible in unit tests.

**Also worth knowing.** A route's `provider`/`model` is metadata describing *which line was dispatched*; a Worker's
sentence about "the model I am running" is its own unverified self-report. In session-6113b527 both happened to agree
(`devin / swe-2-flash-medium`), and neither is a substitute for the other.

## Post-merge note

Counts and the bundle filename above are as recorded at the time (`lib/dsh-model-fusion.js`). The package was renamed in
0.3.0: the bundle is now `lib/dsh-fusion.js` and the suite has grown since. The diagnosis and the fix have not changed.
