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
single `dsh-fusion` plugin, and adds the Sidekick-only MCP bridge (`bridge.ts`): an ACP
`session/new` carries a Host-tool MCP server only when the exact DSH session is a live
Fusion Worker on that ACP route, in a work-order mode that permits tools. Every other ACP
session — Lead turns, ordinary route use, discovery, compaction — opens with no MCP
servers, exactly as upstream did for every session.

The settings UI from upstream is not ported in this milestone; the routes are configured
through this plugin's own `acp.agents` config block.
