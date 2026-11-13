# DSH Agent Studio With Fusion

[中文](README.md) · [Install](INSTALL.md) · [Changelog](CHANGELOG.md) · [Doc index](#doc-index)

<img src="assets/icon.svg" width="72" alt="">

**The expensive model only thinks; the cheap model does the work — as one plugin, and as an ordinary model in DSH.**

After installing, the left sidebar has a **Fusion** entry whose page holds three sections: **Fusion combos**, **Antigravity** (the `agy` CLI) and **ACP routes**. No `dsh-agy-worker`, no `dsh-tauri-acp`, no companion package.

| | |
|---|---|
| Package | `@sqdr2/dsh-agent-studio-fusion` |
| Plugin id | `dsh-agent-studio-fusion` (config row, state directory and log marker) |
| Provider route | `dsh-fusion`, shown in the model menu as **Fusion · combo name** |
| Requirements | DSH `>=0.2.1-rc.5 <0.3.0-0`, Node 24+ |

## What it solves

Behind every **Fusion combo** are two models you choose:

- **Lead**: a strong frontier model. It reads the request and the code, briefs the work, reviews the result and sends it back. It **does not write code** — it has no file-writing tools, and its shell commands run in DSH's read-only sandbox. The program enforces that, not the prompt.
- **Sidekick**: a much cheaper model. It edits files, runs commands, runs tests and reports back.
- **One goal**: frontier-model results at a discount. The saving comes from the price gap — the Sidekick must cost far less than the Lead (ideally 5× or more). The closer their prices, the smaller the saving.

Inspired by Fusion in Cognition's Devin. This is an independent implementation, not affiliated with Cognition.

## Measured

Nine real open-source issues (SWE-rebench, Python), two runs each, graded by hidden tests. Lead GPT-6 Astra (high), Sidekick GLM-5.3-Flash (high):

| | Solved | Total cost (API list prices) |
|---|---|---|
| GPT-6 Astra alone | 9/18 | $39.17 |
| **Fusion: Astra + GLM-5.3-Flash** | **11/18** | **$18.07 (54% less)** |
| Fusion: Astra + Grok 4.6 | 13/18 | $41.27 (no saving) |

Against Devin's own Fusion — the same pair (Lead GPT-6 Astra, Sidekick SWE-2), the same tasks, workspaces and hidden tests. After contaminated attempts were excluded, four tasks were clean in every condition: **this plugin 4/4, $2.73**; Devin Fusion 3/4, $4.81; Devin with Astra alone 3/4, $8.13. This plugin took about 3.4× Devin's wall time.

The samples are small (4 tasks × 1 run; 9 tasks × 2 in the other round), Python only, and public issues may be in training data — so this is **not** a ranking, and not a parity claim. Method, raw data, per-round conclusions and the excluded attempts: **[docs/EVIDENCE.md](docs/EVIDENCE.md)**.

## Use

```sh
dsh plugin --profile web add @sqdr2/dsh-agent-studio-fusion
```

Installing straight from GitHub works too (the repository ships a built `lib/`): `dsh plugin --profile web add github:SQDR2/dsh-agent-studio-fusion`. Desktop-app install, local-directory install, uninstall and migration from older packages: **[INSTALL.md](INSTALL.md)**.

1. Open **Fusion** in the left sidebar (default below Memory System).
2. In **Fusion combos**, name the combo and choose a Lead and a Sidekick. Any model you are signed in to works, including a configured Antigravity or ACP route.
3. Pick **Fusion · combo name** in the model menu and work as usual.
4. Fusion's chip near the composer names the role working right now: `Lead · Read Only` / `Sidekick · Full access`.

**Up to 6 combos** can coexist — a cheap "fast" one and a strong "thorough" one, each its own model-menu entry. With several conversations open, each can pick a different combo; a conversation freezes the combo it picked, so later edits or other conversations never change it. A pre-combo installation is migrated into one combo named "自动" whose model id stays `auto`, so existing conversations keep working.

The composer's permission control reads `Custom` once a task is dispatched: the Lead's session is pinned to read-only, and "read-only plus your approval policy" usually matches no configured preset. That control still sets the **Sidekick's** permission — change it and the Sidekick's next step uses that mode, while the Lead stays read-only. If you would rather it read a name instead of `Custom`, add a preset to your profile's `presets` with `sandbox: read-only` and `approval: never` — pure configuration, this plugin does not depend on it.

## How one task runs

1. The Lead decides code must change and hands the work to the Sidekick. The brief carries the user's own words and the acceptance commands.
2. The Sidekick reports; DSH runs the acceptance commands in the real workspace.
3. The Lead reviews each of the user's hard requirements and must give a verdict with evidence for every one — a missing verdict blocks acceptance. If the Sidekick rewrote an existing test, that is flagged and needs the Lead's confirmation.
4. A rejection goes back to the same Sidekick with the concrete problem. When the allowed files turn out too narrow (say another test file still encodes the old behaviour), the Lead may only **add** paths during rework, never remove them, and every addition is recorded.
5. Tests that were already failing (a missing optional dependency, for instance) can be marked "no new failures".
6. **The one exception**: a takeover the Host unlocks only when the Sidekick demonstrably cannot finish (still failing after 2 rework rounds, step limit reached, repeated stalls). The Lead may then change only the files the task allows, must pass the same acceptance, and returns to read-only afterwards.
7. Quota or provider errors are handled per role: switch a model or schedule a continuation, with progress kept.

## The three routes

### Fusion combos

The Lead/Sidekick pair above. Either side can be a built-in DSH route, a subscription route, Antigravity or an ACP route.

### Antigravity (the `agy` CLI, built in)

Built in as of 1.0.0, ported from [`dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker) 0.6.3 (MIT, see [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md)): the `antigravity` route, the `/agy` command family, `agy_ask` / `agy_tool`, the `/plugins/agy-worker/*` surface, and the account pool with quota tracking. The console lives in the page's **Antigravity** section; `/agy status | pool | models | doctor` answers the same questions from the composer.

With this route as the Sidekick, **three conditions must hold at once**; each fails silently on its own:

| Condition | What it buys | Without it |
|---|---|---|
| `mcpBridge: true` | agy must be able to **execute** DSH tools | tools are listed but never run |
| `permissionMode: 'skip'` | headless mode cannot prompt for the MCP permission | agy aborts: `a tool required the "mcp" permission that headless mode cannot prompt for` |
| the allowlist admits `fusion_*` | the Sidekick must **report back** | it diagnoses but never submits |

You do not write the `agy_tool` transport yourself: when the `antigravity` route is registered, this plugin unions it into both the Lead's and the Sidekick's tool surface (`src/host/route-transport.ts`).

```yaml
- id: dsh-agent-studio-fusion
  config:
    agy:
      mcpBridge: true
      permissionMode: skip
      mcpConfigScope: global
      mcpToolAllowlist: "fusion_submit_result,fusion_read_state,fusion_read_evidence,bash,read,write,edit,glob,grep,job_output,job_kill"
```

Every key from the old `dsh-agy-worker` (`enabled`, `agyBin`, `workspaceRoot`, `defaultModel`, `hiddenModels`, `quotaPollIntervalMs`, `autoWarmup`, …) works verbatim inside that `agy` block, and `DSH_AGY_*` environment variables still win. `enabled: false` is an **install-time** switch: it removes the `antigravity` route and every background capability (quota polling, warmup, the MCP bridge, the media sweep) while leaving `/agy` and the management routes mounted for inspection; re-enabling means changing the block and restarting DSH, not a live toggle.

> On Windows use `pwsh` instead of `bash`, and follow any change to `workerTools`. Before enabling this, **first** disable or remove `dsh-agy-worker`: both use the same route prefix, the same `antigravity` provider, the same `/agy` command and the same tool-card keys, so running both fails at load (`duplicate exact route`, `DUPLICATE_ADAPTER`, `already registered`). Steps, the config move and the one manual account-pool copy: [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md).

### ACP routes (the built-in `deepseek-harness-acp` port)

The Host implementation is merged here under the MIT license ([docs/ATTRIBUTION-ACP.md](docs/ATTRIBUTION-ACP.md)), so a separate `dsh-tauri-acp` install is **no longer needed**. The page's **ACP routes** section has a minimal example, the restart requirement and the migration steps; each key is the provider route shown in the model picker:

```yaml
- id: dsh-agent-studio-fusion
  config:
    acp:
      agents:
        codex:
          displayName: Codex (ACP)
          command: /absolute/path/to/codex-acp   # required; absolute is more reliable, PATH also works
          args: []
          models:                                 # may be omitted entirely; then discoverModels asks
            - id: default
          permission: ask
```

Routes are read once when the Host starts, so a change needs a restart. If you still have the standalone `dsh-tauri-acp`, **disable it manually first** and then move the same provider here — registering it twice fails at load ([docs/MIGRATION-ACP.md](docs/MIGRATION-ACP.md)).

When an ACP route is the Sidekick, this plugin declares a Host-tool MCP bridge in that session's ACP `session/new` and nowhere else: this Host's own public origin plus the fixed `/api/fusion/acp-mcp` path, with 32 random bytes carried **only** in the `Authorization: Bearer` header (never in the URL). Requests are trusted against that origin — `Host` must match, a present `Origin` must equal it, a cross-site request is refused, the peer must be this machine — and no forwarding header is consulted. The token is bound to this task's Worker session, the current work order and its revision, the brief revision, the implement/explore mode, this route's provider *and* model, and the configured `workerTools`; every call re-checks all of it. It is revoked, with in-flight calls aborted, on pause, rework, recovery, completion, a pending approval, a budget block, a submitted report, runtime shutdown, a config change, a session replacement, abort or timeout. Only `workerTools` ∩ the Agent's own visible tools are exposed (an explore order additionally intersects the read-only tools, so the ceiling can only narrow), and every call dispatches through DSH's `tools.guard`, approvals and Fusion's path/lease checks. A Lead ACP session, an ordinary route call, model discovery and compaction requests, a text order, and any other Fusion task all open with an empty `mcpServers` list.

### Other agent routes

The `mcpBridge` / `permissionMode` / `agy_tool` trio above is **agy-only**, because that route is wired by this plugin's bridge layer. A different adapter (anything that is not this plugin's built-in ACP routes) may open its session with no MCP server at all, and **no Fusion setting can make it call Fusion's tools**. For text-only questions on such a route, Fusion accepts a strictly bounded text report instead (`fusionTextReport`, bound to the current `workOrderId` + `revision`, same fields as `fusion_submit_result`; prose, another order, another revision and extra fields are all refused, and the Lead still reviews it). Work that needs files or commands still requires real tool calls. See [docs/WORKER-TOOLS-UNREACHABLE.md](docs/WORKER-TOOLS-UNREACHABLE.md).

## Cache keepalive

While the Lead waits for the Sidekick, often for several minutes, the prompt cache can expire and the next request re-reads the whole conversation at full price. Keepalive resends the Lead's previous request at intervals with only `Reply OK` appended. The prefix is identical, so the provider serves it from cache and the cache lifetime is renewed; the model answers with 5 tokens, and the reply is discarded — it never enters the conversation and runs no tool call.

- **Defaults** come from each provider's documentation, covering the vendors of the Artificial Analysis top 20, matched by model name (`gpt-*`, `claude-*`, `gemini-*`, `glm-*`, `grok-*`, `kimi-*`, `deepseek-*`, …). Plans billed per request — the [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) routes — default to off, since every ping counts as a request.
- **Auto start**: pings begin only after the model has actually reported cache hits, so a model without caching never pays for them.
- Every model is adjustable in the Fusion panel: on/off, interval, reset to default. The panel also shows the observed effect — whether the cache survived the wait, how many pings were sent, how many tokens they read, and how many tokens were kept from being resent at full price.
- **Measured** (ChatGPT subscription route, gpt-6-astra, ~20k-token context): the cache was still there after 10 idle minutes and gone after 15, and every ping restarts that clock, so this route defaults to one every 8 minutes.
- **Automatic adjustment**: the interval shortens only when 3 of the last 5 pings at it missed (an occasional random eviction does not count). It never lengthens on its own; when a wider interval looks safe, the page suggests it and you decide.

## Support

| | |
|---|---|
| DSH | `>=0.2.1-rc.5 <0.3.0-0`, desktop app or Web; the 0.2.0 series is no longer supported |
| Node | 24 or newer (`engines.node` is `>=24.0.0`) |
| Models | Built-in DSH routes, the subscription routes of [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) and dsh-antigravity-oauth, and the built-in Antigravity route; other third-party model plugins are untested |
| macOS | Verified (Seatbelt sandbox) |
| Windows | Native `pwsh` since `v0.2.1`, verified on Windows Server 2022 / PowerShell 7.6.6; Windows 10/11 unverified. ACL enforcement is partial: it restricts ordinary file writes, but not reads or networking |
| Linux | Unverified |

<details>
<summary>Self-check on Linux</summary>

1. In a test folder, select Fusion and say: "This is a read-only sandbox test; a refusal is expected. Call the bash tool yourself with `echo test > fusion-probe.txt` (don't delegate, don't rewrite it) and paste the tool's raw output."
2. Expected: the output says the sandbox denied it (for example `Operation not permitted` / `read-only`), and no `fusion-probe.txt` appears. If the Lead only declines in words without calling the tool, the check doesn't count — ask it again to actually call the tool.
3. If the file is created, the Lead's read-only limit does not work on your system: don't use Fusion there, and please report it.

Where DSH has no sandbox at all, every Lead shell command is refused (it fails safe); the Lead still reads code with its file and search tools.

</details>

## Where the data lives

- **Fusion's own records**: briefs, check results, usage, cache statistics and settings in `$DSH_HOME/plugins/dsh-agent-studio-fusion/state.sqlite` (`DSH_HOME` defaults to `~/.dsh`).
- **Upgrading from an older name**: the `dsh-fusion`, `dsh-model-fusion` and `dsh-agent-studio` directories are **migrated** wholesale on first start, so existing tasks, usage and settings survive. Across filesystems it falls back to copying the database plus its `-wal`/`-shm`/`-journal`, removing only the files it copied.
- **Built-in Antigravity**: work state stays where the standalone plugin kept it — runtime overrides, session bindings, media cache and warmup history in `$DSH_HOME/agy-worker/`. The account pool is this plugin's `$DSH_HOME/agy-accounts/pool.json`, with each isolated account HOME at `$DSH_HOME/agy-accounts/<id>/`; upstream read that pool from `DSH_STATE_DIR`, so only an installation that set it needs the one-time copy in [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md). Nothing moves automatically and uninstalling this package deletes neither directory.
- **The conversations themselves** are stored by DSH; Fusion uploads nothing else. To clear its records, quit DSH and delete that sqlite file — settings go with it.

## Known limits

- **Slower than the frontier model alone**: GPT-6 + Flash took about 5× the time of GPT-6 alone, mostly spent in the Sidekick. A faster Sidekick helps a lot.
- **Lead takeover**: never triggered in 72 measured runs; only automated tests cover it.
- **PATH in the macOS desktop app**: DSH Studio opened from the Dock gets only the system PATH, so `node`, `npm`, `cargo` and other tools installed by Homebrew (`/opt/homebrew/bin`), nvm and similar are not found by the shell. This is DSH's environment and affects every model. Before handing off work, Fusion checks the programs the acceptance commands use; when one is missing it tells the Lead where it is installed (for example `/opt/homebrew/bin/node`), and the Lead retries with the full path.
- **Windows 10/11 and Linux unverified**: see the table above.

## Development

```sh
corepack pnpm@9.15.9 install --frozen-lockfile
node scripts/link-host.mjs /path/to/deepseek-harness-0.2.1-rc.5   # the supported baseline; link DSH sources while developing
DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm build
pnpm test && DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm test:host
```

On Windows, put PowerShell 7 (`pwsh`), Node and Python on the test process PATH. Native tests use `DSHX_HARNESS` to read the built, pinned Host checkout; no Host source changes are needed.

`lib/` is a build artifact committed with the source (`lib/dsh-agent-studio-fusion.js`, `lib/client.js`, `lib/bridge.mjs`, `lib/assets/mermaid.min.js`, `lib/types/**`), so a change under `src/` needs `pnpm build` and the rebuilt `lib/` in the same commit. The plugin uses only DSH's public plugin APIs and never modifies DSH itself; adapting to a new DSH release is described in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md). Cutting a release (bump the version, rebuild `lib/`, push a tag, let CI publish over OIDC): [RELEASING.md](RELEASING.md).

## Doc index

| Document | Contents |
|---|---|
| [INSTALL.md](INSTALL.md) | Install, uninstall, migrating from older packages |
| [CHANGELOG.md](CHANGELOG.md) | What each release changed, validated, and did **not** validate |
| [docs/EVIDENCE.md](docs/EVIDENCE.md) | Measurement method, raw data, excluded attempts |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | The DSH interfaces this depends on, and the upgrade procedure |
| [docs/WORKER-TOOLS-UNREACHABLE.md](docs/WORKER-TOOLS-UNREACHABLE.md) | Diagnosing a Sidekick that cannot reach tools, and the text-report fallback |
| [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md) | Moving from `dsh-agy-worker` to the built-in Antigravity |
| [docs/MIGRATION-ACP.md](docs/MIGRATION-ACP.md) | Moving from `dsh-tauri-acp` to the built-in ACP routes |
| [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md) · [docs/ATTRIBUTION-ACP.md](docs/ATTRIBUTION-ACP.md) | Origin, changes and license of the merged code |
| [docs/DEVIN-LOCAL-FUSION.md](docs/DEVIN-LOCAL-FUSION.md) | Binary forensics of Devin CLI's Fusion, compared point by point with this project |
| [RELEASING.md](RELEASING.md) | Release procedure |

## License

Apache-2.0. Forked from [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion), also under Apache-2.0.

Merged third-party work keeps its own license: the ACP provider port is MIT ([docs/ATTRIBUTION-ACP.md](docs/ATTRIBUTION-ACP.md)), and the built-in Antigravity (agy) capability is MIT, ported from [`SQDR2/dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker) (itself a fork of [`amlyczz/dsh-agy-link`](https://github.com/amlyczz/dsh-agy-link)) — see [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md), which also lists the licenses of the libraries bundled in `mermaid.min.js`.
