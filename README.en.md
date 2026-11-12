# DSH Agent Studio With Fusion

[中文](README.md) · [Install](INSTALL.md) · [安装](INSTALL.zh.md) · [Changelog](CHANGELOG.md)

> **This repository is an independent open-source plugin, published as `@sqdr2/dsh-agent-studio-fusion`.**
> It merges three capabilities into **one plugin**: Fusion's Lead/Sidekick
> combos (originating from `aa2246740/dsh-model-fusion`), Antigravity (the `agy` CLI, merged under MIT from
> [`dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker)) and ACP agent routes (merged under MIT from
> [`deepseek-harness-acp`](https://github.com/Fleey/deepseek-harness-acp)). The left sidebar provides unified access
> where the three capabilities live as sections of one integrated page. See [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md).

In DeepSeek Harness (DSH), Fusion is an ordinary model in the menu: **save N combos and the menu shows N entries** (**Fusion · combo name**). Behind each one are two models you choose:

- **Lead**: a strong frontier model. It reads the request and the code, briefs the work and reviews the result.
- **Sidekick**: a much cheaper model. It edits code, runs commands and runs tests.

One goal: **frontier-model results at a discount.**

Inspired by Fusion in Cognition's Devin. This is an independent implementation, not affiliated with Cognition.

## Measured

Nine real open-source issues (SWE-rebench, Python), two runs each, graded by hidden tests. Lead GPT-6 Astra (high), Sidekick GLM-5.3-Flash (high):

| | Solved | Total cost (API list prices) |
|---|---|---|
| GPT-6 Astra alone | 9/18 | $39.17 |
| **Fusion: GPT-6 Astra + GLM-5.3-Flash** | **11/18** | **$18.07 (54% less)** |
| Fusion: GPT-6 Astra + Grok 4.6 | 13/18 | $41.27 (no saving) |

- Costs are estimates at each provider's public API prices, not bills.
- Limits: small sample (9 tasks × 2), Python only, and public issues may be in training data.
- Method, raw data and per-round conclusions: [docs/EVIDENCE.md](docs/EVIDENCE.md).

**Against Devin's own Fusion:** both used the same pair, GPT-6 Astra (high) as Lead and SWE-2 as Sidekick, on the same
tasks, workspaces and hidden tests.

After contaminated attempts were excluded, four tasks were clean in every condition:

| | Solved | Cost |
|---|---|---|
| **This plugin: Astra + SWE-2** | **4/4** | **$2.73** |
| Devin Fusion: Astra + SWE-2 | 3/4 | $4.81 |
| Devin, Astra alone | 3/4 | $8.13 |

- Four tasks with one run each cannot rank the two systems. This is not a parity claim.
- SWE-2 is priced at $0 on both sides, so the costs are the Lead's.
- The plugin took about 3.4× Devin's wall time.
- For the excluded attempts and why they were excluded, see
  [docs/EVIDENCE.md](docs/EVIDENCE.md#against-devins-own-fusion-round-devin-r1-2026-09-29).

## Use

1. Install the plugin ([INSTALL.md](INSTALL.md)).
2. Open the **Fusion** entry in the left sidebar (default below Memory System). The page is titled
   **DSH Agent Studio With Fusion** and offers three section buttons — **Fusion combos** (default), **Antigravity** and
   **ACP routes**. In Fusion combos, name the combo and choose a Lead and a Sidekick. Any model you are signed in to in
   DSH works, including a configured Antigravity or ACP route.
3. Select that combo (**Fusion · name**) in the model menu and work as usual.

**Several combos can coexist** (up to 6): for example a cheap "fast" one and a strong "thorough" one, each its own model-menu entry. With several conversations open, each one can pick a different combo — a conversation freezes the combo it selected, so later edits or other conversations never change it. A pre-combo installation is migrated into one combo named "自动" whose model id stays `auto`, so existing conversations keep working.

**Pairing:** Fusion saves money because the Sidekick costs far less than the Lead. Pick a strong frontier Lead and a Sidekick that is much cheaper (ideally 5× or more). The closer their prices, the smaller the saving.

## How it works

- **Conversation:** the Lead answers directly, like any model.
- **Changes:** the Lead hands the work to the Sidekick. The brief carries the user's own words and the acceptance commands.
- **Acceptance:**
  - When the Sidekick reports, DSH runs the acceptance commands in the real workspace.
  - The Lead reviews the change and must give a verdict with evidence for each of the user's hard requirements. A missing verdict blocks acceptance.
  - Tests that were already failing (for example, missing optional dependencies) can be marked "no new failures".
  - If the Sidekick rewrote an existing test, it is flagged, and the Lead must confirm it before accepting.
- **Rework:** a rejected change goes back to the same Sidekick with the concrete problem.
  - When the allowed files turn out too narrow (for example another test file still encodes the old behaviour), the Lead can add them during rework. Paths are only added, never removed, and each change is recorded.
- **The Lead does not write code.** The program enforces this, not the prompt:
  - the Lead has no file-writing tools;
  - its shell commands run in DSH's read-only sandbox.
- **The permission shown in the composer.** Fusion separates permissions by role and pins the Lead's session to read-only, and "read-only plus your approval policy" usually matches no configured preset, so the native permission control reads `Custom` once a task is dispatched. Fusion's own chip in the composer tool row names the role working right now and its permission: `Lead · Read Only` / `Sidekick · Full access`. That control still sets the Sidekick's permission: change it and the Sidekick's next step uses that mode while the Lead stays read-only. If you would rather the native control read a name instead of `Custom`, add a preset to your profile's `presets` with `sandbox: read-only` and `approval: never` — pure configuration, this plugin does not depend on it.
- **The only exception is a takeover the Host unlocks when the Sidekick demonstrably cannot finish.** For example: checks still failing after 2 rework rounds, or the Sidekick hit its step limit or kept stalling. During a takeover:
  - the Lead may only change the files the task allows;
  - its work must pass the same acceptance;
  - it returns to read-only afterwards.
- **Quota or provider errors:** handled per role. Switch a model or schedule a continuation; progress is kept.

## Using agy as the Sidekick (built in)

Google Antigravity (the `agy` CLI) is **built into this plugin** since 0.4.0, ported from
[`dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker) (a fork of `dsh-agy-link`) under its MIT license — see
[`docs/ATTRIBUTION-AGY.md`](docs/ATTRIBUTION-AGY.md). It brings the `antigravity` model route, the `/agy` command
family, `agy_ask` / `agy_tool`, the `/plugins/agy-worker/*` surface, the account pool with quota tracking, and the
Antigravity console in the **Antigravity** section of the Fusion page. No second package is installed, and Fusion stays
the only sidebar entry.

> **Migrating from `dsh-agy-worker`:** disable or remove the old package **before** enabling this one. Both use the same
> route prefix, the same `antigravity` provider, the same `/agy` command and the same tool-card keys, so running both
> fails at load (`duplicate exact route`, `DUPLICATE_ADAPTER`, `already registered`). Steps, the config move and the one
> manual account-pool copy: [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md).

This route is not like a plain provider: **three conditions must hold at the same time**, and each one fails silently
on its own.

| Condition | Why | Without it |
|---|---|---|
| `mcpBridge: true` | agy must be able to **execute** DSH tools | tools are listed but never run |
| `permissionMode: 'skip'` | headless mode cannot prompt for the MCP permission | agy aborts: `a tool required the "mcp" permission that headless mode cannot prompt for` |
| the allowlist admits `fusion_*` | the Sidekick must **report back** | it can diagnose but never submit |

You do **not** write the `agy_tool` transport into the ceiling yourself. When this Host has the `antigravity` route
registered, the plugin unions that transport into both the Lead's and the Sidekick's tool surface
(`src/host/route-transport.ts`). That is one of the bugs this fork fixes: before it, agy's adapter could only report a
step as `agy_tool`, the ceiling never carried that name, the whole turn degraded to prose, and the Host reported
`WORKER_TOOLS_UNREACHABLE`.

Recommended configuration:

```yaml
- id: dsh-fusion
  config:
    agy:
      mcpBridge: true
      permissionMode: skip
      mcpConfigScope: global
      mcpToolAllowlist: "fusion_submit_result,fusion_read_state,fusion_read_evidence,bash,read,write,edit,glob,grep,job_output,job_kill"
```

Every other upstream key (`enabled`, `agyBin`, `workspaceRoot`, `defaultModel`, `hiddenModels`, `quotaPollIntervalMs`,
`autoWarmup`, …) works verbatim inside that `agy` block, and `DSH_AGY_*` environment variables still win over it.
`enabled: false` is an install-time opt-out: it removes the `antigravity` provider route and every background capability
(quota polling, warmup, MCP bridge, media sweep) while leaving `/agy` and the management routes mounted for inspection —
re-enabling means changing the block and restarting DSH, not a live switch. The console (accounts, quota, model
visibility, permission mode, warmup) is the **Antigravity** section of the **Fusion** page in the left sidebar;
`/agy status | pool | models | doctor` answers the same questions from the composer.

> On Windows use `pwsh` instead of `bash`, and follow any change you made to `workerTools`. Work state stays where the
> standalone plugin kept it (`$DSH_HOME/agy-worker/`); the account pool is this plugin's
> `$DSH_HOME/agy-accounts/pool.json`, which differs from upstream's `DSH_STATE_DIR` root only when that variable is set
> — [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md) has the one-time copy. For the full configuration
> surface, verification steps and troubleshooting of the bridge itself, see
> [dsh-agy-worker's MCP bridge guide](https://github.com/SQDR2/dsh-agy-worker/blob/main/docs/MCP-BRIDGE-SETUP.md).

### ACP routes (the built-in `deepseek-harness-acp` port)

This plugin hosts ACP routes itself, so a separate `dsh-tauri-acp` install is **no longer needed** (its Host
implementation is merged here under the MIT license, see [`docs/ATTRIBUTION-ACP.md`](docs/ATTRIBUTION-ACP.md)). Left
sidebar **Fusion** → **ACP routes** carries the full guide (minimal example, restart requirement, migration). Add an
`acp.agents` block to this plugin's entry in `cordis.patch.yml`; each key is the provider route shown in the model
picker:

```yaml
- id: dsh-fusion
  name: '@sqdr2/dsh-fusion'
  config:
    acp:
      agents:
        codex:
          displayName: Codex (ACP)
          command: /absolute/path/to/codex-acp   # required; absolute is more reliable, PATH works too
          args: []
          models:                                 # may be omitted; then discoverModels asks the agent
            - id: default
          permission: ask
```

The routes are read once when the Host starts, so a change needs a restart. If you still have the standalone
`dsh-tauri-acp` installed, **disable it manually first** and then move the same provider here — registering it twice
fails at load. Steps: [`docs/MIGRATION-ACP.md`](docs/MIGRATION-ACP.md).

When an ACP route is the Sidekick, this plugin declares a Host-tool MCP bridge in that session's ACP `session/new` — and
only there. The endpoint is this Host's own public origin (`ctx.webServer.getOrigin()`) plus the fixed
`/api/fusion/acp-mcp` path, and the capability is 32 random bytes carried **only** in the `Authorization: Bearer` header,
never in the URL (a token in a path segment or a query string is not authentication, and the path must match exactly).
Each request is also trusted against that origin: `Host` must match it, a present `Origin` must equal it, a cross-site
request is refused, and the peer must be this machine (loopback, or the exact address the Host binds). No forwarding
header is consulted, so a Host bound to a concrete interface serves its own callers while remote peers cannot.
The token is bound to this task's Worker session, the current work order and its revision, the brief revision, the
implement/explore mode, this ACP route's provider *and* model, and the configured `workerTools`; every call re-checks
all of it. It is revoked, with in-flight calls aborted, when the task pauses, gates, recovers, completes or stops, when
an approval or a budget blocks it, when the Worker has submitted its report, when the runtime closes, when the route's
configuration changes, when the ACP session is replaced, and on abort or timeout. Only `workerTools` ∩ the Agent's own
visible tools are exposed (an explore order additionally intersects the read-only tools, so the ceiling can only
narrow), Fusion internals and route transports are never listed, and every call dispatches through DSH's
`tools.guard`, approvals and Fusion's path/lease checks. A Lead ACP session, an ordinary ACP route call, model discovery
and compaction requests, a text order, and any other Fusion task all open with an empty `mcpServers` list. Details and
limits: [`docs/ATTRIBUTION-ACP.md`](docs/ATTRIBUTION-ACP.md).

### Other agent routes (ACP and friends): there is no tool bridge here

The `mcpBridge` / `permissionMode` / `agy_tool` trio above is **agy-only**, because that route is wired by this plugin's
bridge layer. A different agent adapter (anything that is not this plugin's built-in ACP routes) may open its session
with no MCP server at all, and **no Fusion setting can make it call Fusion's tools**. For text-only questions on such a
route, Fusion now accepts a strictly
bounded text report instead (`fusionTextReport` block bound to the current `workOrderId` + `revision`, same fields as
`fusion_submit_result`; prose, another order, another revision and extra fields are all refused, and the Lead still
reviews it). Workspace work that needs files or commands still requires real tool calls, so that route still fails
explicitly and names the practical way out (use a direct-call model route). See
[`docs/WORKER-TOOLS-UNREACHABLE.md`](docs/WORKER-TOOLS-UNREACHABLE.md).

## What this fork changes

Against upstream `dsh-model-fusion`, in commit order:

| Change | What it fixes |
|---|---|
| **User constraints survive a rollover** | after an automatic compaction, the hard requirements in the user's own words stay in the task's scope, so a compaction never drops the basis for acceptance |
| **A dead-end task has an exit** | when a Sidekick route cannot reach the tools at all, the verdict is recorded on the runtime record: `fusion_wait` re-reports the same reason and `fusion_delegate` may replace the dead order, so the task no longer sits in `WORKER_RUNNING` forever |
| **The entry moved to the left sidebar** | Fusion is its own panel (default below Memory System) instead of a section buried in Settings, and the main slot scrolls instead of clipping a form |
| **The agy route can be a Sidekick** | the `agy_tool` transport is unioned into the tool ceiling (see above) |
| **A bridged route can report back** | agy runs the call inside its own loop under a bridge-local id (`agy-mcp-N`) that appears in no assistant message here, so every non-read Worker tool was refused as "requires a complete native model request", including `fusion_submit_result`. A bridged call now belongs to the message that emitted the transport; the native path is unchanged and still preferred |
| **A frozen scope no longer deadlocks** | a glob such as `allowedPaths: ['lib/types/**']` matched nothing, so "changes outside the frozen scope" and "files already differ under the added path" locked each other. Globs match now, widening is compared against the delegation base, and the scope can be cleared |
| **Task records can be deleted** | deletion read persisted state only: a task whose owning process had been replaced stayed `running` forever, while a live Agent could be cleared out from under itself. Deletion asks the coordinator (`liveWork`) and the 409 names the resource that held the task |
| **Collapsible panels** | usage, the task list, cache keepalive and history are separate boxes, collapsed by default, so the model pair no longer scrolls off the page |

## Cache keepalive

While the Lead waits for the Sidekick, often for several minutes, the model's prompt cache can expire. The next request then re-reads the whole conversation at full price. Keepalive resends the Lead's previous request at intervals with only “Reply OK” appended. The prefix is identical, so the provider serves it from cache and the cache lifetime is renewed; the model answers OK, and the reply is discarded: it never enters the conversation and no tool call runs.

- **Defaults:** taken from each provider's documentation, covering the vendors of the Artificial Analysis top 20.
  - Matched by model name: gpt-*, claude-*, gemini-*, glm-*, grok-*, kimi-*, deepseek-*, …
  - Plus the billing of the [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) routes: plans billed per request default to off, since every ping counts as a request.
- **Auto:** starts only after the model has actually reported cache hits, so a model without caching never pays for pings.
- **Every model is adjustable in the Fusion panel:** on/off, interval, reset to default. The panel also shows the observed effect for each model:
  - whether the cache survived each wait;
  - how many pings were sent and how many tokens they read;
  - how many tokens were kept from being resent at full price.
- **Measured (ChatGPT subscription route, gpt-6-astra, ~20k-token context):** each ping gets a 5-token reply, with no reasoning and no tool call. The cache was still there after 10 idle minutes and gone after 15, and every ping restarts that clock, so this route defaults to a ping every 8 minutes.
- **Automatic adjustment:** the interval is shortened only when 3 of the last 5 pings at that interval missed (an occasional random eviction does not count). It is never lengthened automatically; when a longer interval looks safe, the page suggests it and you decide.

## Support

- **DSH version:** **0.2.1-rc.5 and later 0.2.1 releases** (`>=0.2.1-rc.5 <0.3.0-0`), desktop app or Web. The 0.2.0
  series is no longer supported. Other versions are not guaranteed; new releases will be adapted separately.
- **Node version:** **Node 24 or newer** (`engines.node` is `>=24.0.0`).
- **Models:** DSH's built-in providers, plus the subscription routes of [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) and dsh-antigravity-oauth, and the built-in Antigravity route (ported from [dsh-agy-worker](https://github.com/SQDR2/dsh-agy-worker)). Other third-party model plugins are untested.
- **Operating systems:**
  - **macOS:** verified (Seatbelt sandbox).
  - **Windows:** `v0.2.1` supports native `pwsh` and has been verified on Windows Server 2022 with PowerShell 7.6.6. Make sure `pwsh` is on the PATH used to launch DSH. Windows 10/11 remain unverified. Windows ACL enforcement is partial: it can restrict ordinary file writes, but does not restrict reads or networking.
  - **Linux:** not verified. Check it yourself first:
  1. In a test folder, select Fusion and say: "This is a read-only sandbox test; a refusal is expected. Call the bash tool yourself with `echo test > fusion-probe.txt` (don't delegate, don't rewrite it) and paste the tool's raw output."
  2. Expected: the tool output says the sandbox denied it (for example `Operation not permitted` / `read-only`), and no `fusion-probe.txt` appears.
     - If the Lead only declines in words without calling the tool, the check doesn't count; ask it again to actually call the tool.
  3. If the file is created, the Lead's read-only limit does not work on your system. Don't use Fusion there, and please report it.
  - Where DSH has no sandbox at all, every Lead shell command is refused (it fails safe). The Lead still reads code with its file and search tools.

### Windows validation in v0.2.1 (historical, predates the current 0.2.1-rc.5 / Node 24 baseline)

On Windows Server 2022 with Node 22.23.3, PowerShell 7.6.6 and DSH 0.1.7-rc.2, all **253 unit tests and 236 Host tests** passed, as did type checking. The repair candidate passed plugin installation, a cold start, the Fusion settings page and both settings/cache APIs. The v0.2.1 server and client bundles are byte-for-byte identical to that candidate. Later releases (v0.2.2: the Lead can widen the allowed files during rework; v0.2.3–v0.2.5: DSH 0.2.0-rc.2 support; v0.2.6: cheaper cache keepalive) are platform-independent and were re-tested on macOS, not on Windows.

The real PowerShell ACL test denied the Lead's `Set-Content probe.txt test` command and left no file; the Sidekick could write the same file within its granted workspace. This is partial ACL enforcement, with the limits above. These checks used no model credentials or real model requests. macOS regression: 253 unit tests and 235 Host tests passed; the Windows-only ACL test was skipped.

## Data

- **Fusion's own records:** briefs, check results, usage, cache statistics and settings live in `$DSH_HOME/plugins/dsh-fusion/state.sqlite`. `DSH_HOME` defaults to `~/.dsh`.
- **Upgrading from the old name:** the previous release was `dsh-model-fusion`, and its whole directory (`$DSH_HOME/plugins/dsh-model-fusion/`) is **migrated** to the new name on first start, so existing tasks, usage and settings survive. Across filesystems it falls back to copying the database plus its `-wal`/`-shm`/`-journal`, and removes only the files it copied.
- **Built-in Antigravity (agy):** work state stays where the standalone plugin kept it — runtime overrides, session bindings, media cache and warmup history in `$DSH_HOME/agy-worker/`. The account pool is `$DSH_HOME/agy-accounts/pool.json` with each isolated account HOME at `$DSH_HOME/agy-accounts/<id>/`; upstream read that pool from `DSH_STATE_DIR`, so only an installation that set it needs the one-time copy in [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md). Nothing is moved automatically and uninstalling this package does not delete either directory.
- **The conversations themselves:** stored by DSH. Fusion uploads nothing else.
- **To clear Fusion's records:** quit DSH and delete that file. Settings go with it; choose the pair again next time.

## Known limits

- **Slower than the frontier model alone:** GPT-6 + Flash took about 5× the time of GPT-6 alone, mostly spent in the Sidekick. A faster Sidekick helps.
- **Lead takeover:** never triggered in 72 measured runs; only automated tests cover it.
- **PATH in the macOS desktop app:** DSH Studio opened from the Dock gets only the system PATH, so `node`, `npm`, `cargo` and other tools installed by Homebrew (`/opt/homebrew/bin`), nvm and similar are not found by the shell. This is DSH's environment and affects every model. Before handing off work, Fusion checks the programs the acceptance commands use; when one is missing it tells the Lead where it is installed (for example `/opt/homebrew/bin/node`), and the Lead retries with the full path.
- **Windows 10/11 and Linux not verified:** see Operating systems above.

## Development

```sh
corepack pnpm@9.15.9 install --frozen-lockfile
node scripts/link-host.mjs /path/to/deepseek-harness-0.2.1-rc.5   # the supported baseline; link DSH sources for development
DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm build
pnpm test && DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm test:host
```

For Windows development, put PowerShell 7 (`pwsh`), Node and Python on the test process PATH. Native tests use `DSHX_HARNESS` to read the built, pinned Host checkout; no Host source changes are required.

The plugin uses only DSH's public plugin APIs and never modifies DSH itself. How to adapt it to a new DSH release: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

How to cut a release (bump the version, rebuild `lib/`, push a tag, let CI publish over OIDC): [RELEASING.md](RELEASING.md).

## License

Apache-2.0. Forked from [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion), also under
Apache-2.0.

Bundled third-party work keeps its own license: the ACP provider port is MIT
([`docs/ATTRIBUTION-ACP.md`](docs/ATTRIBUTION-ACP.md)), and the built-in Antigravity (agy) capability is MIT, ported from
[`SQDR2/dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker), itself a fork of
[`amlyczz/dsh-agy-link`](https://github.com/amlyczz/dsh-agy-link)
([`docs/ATTRIBUTION-AGY.md`](docs/ATTRIBUTION-AGY.md)). That document also lists the licenses of the bundled
`mermaid.min.js` asset.
