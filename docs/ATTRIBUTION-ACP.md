# ACP provider attribution

The ACP (Agent Client Protocol) provider support in this package derives from
[`Fleey/deepseek-harness-acp`](https://github.com/Fleey/deepseek-harness-acp) (published as
`dsh-tauri-acp`), and is redistributed here under its MIT license.

## Upstream license

```
MIT License

Copyright (c) 2026 Fleey

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## What was ported

Each file under `src/host/acp/` carries the same notice in its header. The port keeps the
upstream behavior for:

- `agent-process.ts` — one ACP agent process per route over stdio JSON-RPC, the handshake,
  session open/close, model and reasoning-effort selection, cancellation, model discovery.
- `adapter.ts` — the DSH `LlmAdapter`: model catalog and metadata, streaming translation,
  incremental prompts, usage accounting, retries off.
- `permission.ts` — the agent's permission requests routed through DSH's approval policy.
- `transcript.ts`, `chunk-translator.ts` — conversation projection and stream translation.
- `prompt-capabilities.ts`, `context-windows.ts`, `request-image.ts` — learned facts and
  image request sizing, cached under `$DSH_HOME/cache/dsh-fusion/`.
- `config.ts`, `types.ts` — the `acp.agents` profile schema.

## What changed

The upstream package registered itself as a separate plugin (`dsh-tauri-acp`) with its own
settings section and client bundle. This port registers the same host capability inside the
single `dsh-agent-studio-fusion` plugin and leaves the ported files' upstream behavior intact, then adds
one Fusion-only surface: a Sidekick-only Host-tool MCP bridge (`bridge.ts`, `bridge-route.ts`,
and the declaration handoff in `index.ts`).

**What the bridge is, and whose it is.** The bridge is **Fusion-specific hardening**, not an
upstream feature: upstream opens every ACP session with no MCP servers at all. Here an ACP
`session/new` carries a Host-tool MCP server only when the exact DSH session is a live Fusion
Worker on that ACP route, in a work-order mode that permits tools; every other ACP session —
Lead turns, ordinary route use, discovery, compaction, text orders — is left without MCP
servers, i.e. in the upstream state. The bounded facts that hold today are:

- **The Host's own origin.** The URL is `WebServer.getOrigin()` plus the fixed
  `/api/fusion/acp-mcp` path, so an HTTPS bind or a non-default concrete local interface is
  reachable exactly as configured. There is no loopback fallback: a Host that cannot name
  its origin gets no bridge at all. The route is mounted as an **exact** path.
- **A bearer capability, header only.** The token is 32 random bytes, carried solely in the
  `Authorization: Bearer` header. It never appears in the URL, so agent-process logs,
  proxies and history cannot replay it, and a token spliced into a path or a query string
  is not authentication. Malformed and suffix targets fail closed without throwing.
- **Trusted against that same origin.** A request is served only when its `Host` header is
  exactly the configured origin's authority, a present `Origin` header equals the origin, it
  is not a cross-site browser request, and its peer address is this machine (loopback or the
  exact address the Host binds, with IPv4-mapped IPv6 normalized). No forwarding header is
  consulted, so a Host bound to a concrete local interface serves its own callers while
  remote peers and proxies cannot reach the bridge.
- **Bound to one dispatch.** The grant records the Agent id, DSH session id, Fusion task,
  work-order id and revision, brief revision, mode, route (provider *and* model) and the
  configured `workerTools` ceiling. Every tool call re-resolves the Agent from the DSH
  registry and re-checks all of it; a mismatch, an expiry or a lost owner revokes the grant.
- **Gated by the coordinator's own state.** `FusionCoordinator.acpWorkerFacts()` is the only
  authority: it returns facts only for the exact session this task dispatched (accepted,
  else reserved), and fails closed on every gate that already stops a Worker turn — a
  paused/blocked/recovering/unknown/completed task, pending approval, an exhausted budget, a
  stopping or closing runtime, a submitted report, or a missing runtime record.
- **Narrowed, never widened.** The list is `workerTools` ∩ the Agent's own visible schema
  registry, minus Fusion's `fusion_*` internals and route transports. An `explore` order is
  the read-only tools *within* `workerTools`, so it can only narrow the configured ceiling.
- **Dispatched through DSH.** Each call goes through `ctx.tools.execute` with the live Agent
  and a branded `ToolCallId`, so Harness guards, approvals and sandbox policy stay
  authoritative. No tool implementation is called directly, and no Fusion internal or route
  transport is ever exposed.
- **Ended with the dispatch.** The grant is revoked and its in-flight calls aborted when the
  turn aborts or times out, when its consumer stops iterating, when `session/new` or model /
  effort selection fails after the declaration, when the ACP session is replaced or
  closes, when the route's profile changes or disappears, when the adapter or plugin is
  disposed, and whenever the bridge itself finds the reused session no longer authorized. A
  successful turn keeps it, because the same ACP session is reused for the next step of the
  same work order.

### What is still not ported: the full upstream configuration editor

The full editor upstream shipped is **not** ported, and this document does not claim otherwise.
A narrow, import-only UI has been restored locally in `src/client/AcpSettingsGuide.tsx` (allowing users
to paste configuration JSON and write selected routes directly to `dsh-agent-studio-fusion → acp.agents` via DSH
ConfigForms, with an explicit Host restart requirement), but full route management, live model discovery
and connection status, and a full-field agent editor remain outside scope:

- no route list read from a live registry, no model discovery, no connection status or health monitoring;
- no dedicated multi-field editing forms for individual agent parameters;
- the import workflow solely parses JSON server definitions, previews selected entries, overlays imported launch
  fields over existing profiles, and commits them to the `acp.agents` config block;
- all ACP routes continue to require a Host restart to become active.

A full editor is a separate capability: it would need a Host-side read/write surface for the profile, a conflict
protocol with external edits, and validation that matches `src/host/acp/config.ts`. None of that exists here, and the
page deliberately keeps its scope limited to setup guidance and configuration import.
