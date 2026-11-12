# Antigravity (agy) attribution

The built-in Google Antigravity support in this package derives from
[`SQDR2/dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker) (npm `@sqdr2/dsh-agy-worker`,
version 0.6.3, commit `ab49704`), and is redistributed here under its MIT license.

`dsh-agy-worker` is itself a fork of [`amlyczz/dsh-agy-link`](https://github.com/amlyczz/dsh-agy-link),
which keeps its own name, package and repository. The attribution chain is therefore:

```
dsh-agy-link (amlyczz)  →  dsh-agy-worker (SQDR2)  →  this package (@sqdr2/dsh-fusion)
```

## Upstream license

```
MIT License

Copyright (c) 2026 dsh-agy-worker contributors

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

## Bundled third-party assets

`assets/mermaid.min.js` is **byte-identical** to `dsh-agy-worker/assets/mermaid.min.js` (verified with
`cmp`), and the build copies it to `lib/assets/mermaid.min.js`. Its own `Bundled license information`
banner is preserved verbatim at the end of the file; the libraries it names are:

| Library | License (as stated in the file's own banner) |
| --- | --- |
| mermaid | MIT |
| lodash | MIT (`openjsf.org`) |
| DOMPurify 3.4.12 | Apache-2.0 / MPL-2.0 (`cure53`) |
| dagre-d3 / cytoscape layout code | MIT |

The file is served at `/plugins/agy-worker/mermaid.min.js` and is deliberately **not** bundled into
`lib/client.js`: the client loads it lazily on the first ```mermaid fence.

### Size tradeoff (accepted decision)

`assets/mermaid.min.js` is **3,572,661 bytes (3.4 MiB)** — roughly an order of magnitude larger than
both JavaScript bundles together (`lib/client.js` ≈ 0.32 MB, `lib/dsh-fusion.js` ≈ 1.2 MB). It is
vendored rather than generated or fetched at build time because:

- the route that serves it (`/plugins/agy-worker/mermaid.min.js`) must work offline, straight after
  `dsh plugin add`, with no second network fetch and no second supply-chain step;
- upstream ships the same file, so the artifact is byte-reproducible against `dsh-agy-worker` and the
  licenses above are exactly the ones upstream already reviewed;
- it stays out of the client bundle, so the page payload is unchanged unless a ```mermaid fence is
  actually rendered.

The cost accepted: an npm tarball ~3.4 MB larger, and a tracked binary in git. If it is ever replaced
by a build-time transform, the same license banner must be reproduced and this section updated. The
build already emits it into `lib/assets/` (`scripts/build.mjs`, `emitRuntimeAssets()`), so a packaging
change must also keep that copy step.

## What was ported

Every file under `src/host/agy/` and `src/client/agy/` carries the same notice in its header.
The port keeps upstream behavior for:

- `index.ts` — the install helper: dormant-safe detection, `llm.registerAdapter(['antigravity'])`,
  the `/agy` command family, `agy_ask`, the `agy_tool` mirror and its `tools/pre-execute`
  bypass, the `/plugins/agy-worker/*` HTTP surface, the background timers and the MCP bridge.
- `config.ts`, `types.ts` — the layered config (`DSH_AGY_*` env > `runtime-overrides.json` >
  the `agy` block > defaults), the provider/plugin ids and the stable error codes.
- `adapter.ts`, `runner.ts`, `parser.ts`, `mapper.ts`, `recording.ts`, `net.ts` — one short-lived
  `agy -p --output-format stream-json` child per call, the NDJSON translation, conversation
  continuity, the stream-json parser and its mapping to `StreamChunk`s.
- `auth.ts`, `oauth.ts`, `pool.ts`, `pool-auth.ts`, `credential-slot.ts`, `quota.ts`,
  `warmup.ts`, `sessions.ts`, `wincred.ts` — Google login, the multi-account pool, per-account
  credential isolation, quota polling and the weekly warmup.
- `models.ts`, `discovery.ts`, `media.ts`, `media-route.ts`, `diagnostics.ts`, `oneshot.ts`,
  `ask-tool.ts`, `mirror-tool.ts`, `commands.ts`, `mcp-bridge.ts`, `bridge.mjs`, `agy-db.ts`,
  `agy-log.ts`, `agy-usage.ts`, `auto-updater.ts`, `dsh-goal.ts`, `read-json-body.ts`,
  `atomic-write.ts`, `pool-types.ts` — model catalog, media staging and serving, the doctor
  report, the one-shot `agy_ask` path, the native tool mirror, the `/agy` handlers, the reverse
  MCP bridge (script shipped at `lib/bridge.mjs`), agy's conversation database and logs, and the
  DSH goal/plan protocol.
- `AgyConsole.tsx`, `locales.ts`, `brand-icons.ts`, `images.ts`, `decisions.ts`,
  `scroll-guard.ts`, `locale.ts`, `toolview.ts` — the management console, its dictionaries and
  icons, and the two native tool cards (`agy_tool`, `run_code`).

## What changed

The upstream package registered itself as a separate plugin (`@sqdr2/dsh-agy-worker`, plugin id
`agy-worker`) with its own cordis entry, its own client entry, its own sidebar panel and main
page, and its own page-level DOM scanners. This port registers the same host capability inside
the single `dsh-fusion` plugin and keeps the ported files' upstream behavior intact. Concretely:

- **One identity.** `installAgy(ctx, config.agy)` replaces the upstream `apply(ctx, entryConfig)`
  and returns the disposer that unwinds every effect it registered. There is no second cordis
  entry, no second package name, and `cordis.patch.yml` still inserts only `dsh-fusion`. The
  provider route (`antigravity`), the command (`/agy`), the tools (`agy_ask`, `agy_tool`) and the
  route prefix (`/plugins/agy-worker/*`) keep their exact upstream names.
- **Tool-card registration.** The client entry registers exactly the two keyed
  `tool.call.toolview` views upstream registered — `agy_tool` and `run_code` — and drops the
  `id`/`label` fields, which are list-slot options the keyed slot rejects. The `run_code` view
  still owns ordinary Code Mode programs: it recognizes the generated mirror wrapper through
  `mirrorStepInvocation` (the same strict parser Fusion's own activity projection uses) and
  renders everything else as a code card.
- **One client entry.** FusionSettings is the only `main` panel and the only
  `sidebar.panellist` entry. The upstream `main`, `sidebar.panellist`, `plugins.bundle.config`,
  `plugins.row.config` and `conversation.session.header.actions` registrations, its
  settings-nav icon injector, and its page-wide mermaid / reasoning / images / decisions / scroll
  scanners are not ported: they exist to dress a separate plugin's own surfaces, and Fusion
  already renders its activity with its own cards.
- **Scoped styling.** The console's custom properties are declared on `.agy-console` instead of
  `:root`/`body`, and its overlay marker is `agy-console-modal-open` instead of `agy-modal-open`,
  so porting the Antigravity palette cannot repaint Fusion's own pages.
- **State paths.** Work state stays at `$DSH_HOME/agy-worker` and the account pool at
  `$DSH_HOME/agy-accounts/pool.json` (see `docs/MIGRATION-AGY.md` for the manual copy from an
  upstream `DSH_STATE_DIR` installation). Nothing migrates user state automatically, edits a
  profile, or uninstalls the old package.

## Compatibility note for users of the old plugin

The old `@sqdr2/dsh-agy-worker` and this built-in capability hard-fail when both are enabled on
one Host: the web server refuses a duplicate `/plugins/agy-worker/*` route, `llm.registerAdapter`
refuses a second `antigravity` provider, `commands.register` refuses a second `/agy`, and the
client's keyed `tool.call.toolview` refuses a second `agy_tool` / `run_code` entry. Disable or
remove the old package **before** enabling this one — `docs/MIGRATION-AGY.md` walks through it.
