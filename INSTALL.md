# Install Fusion

[中文](INSTALL.zh.md) · Product pages: [README.md](README.md) (中文), [README.en.md](README.en.md)

Requires **DeepSeek Harness `>=0.2.1-rc.5 <0.3.0-0`** on **Node 24 or newer**. Other versions are not supported;
the 0.2.0 series is no longer supported.

> This package is a fork of [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion), published as
> `@sqdr2/dsh-fusion`. Because the package name changed, an installed `dsh-model-fusion` is not upgraded automatically;
> install the new package once as described below and its data migrates on first start.
>
> The package name and the plugin id are two different things: the package is `@sqdr2/dsh-fusion`, while the plugin id
> (the `- id:` in the composition, and the name of the data directory) stays `dsh-fusion`. An upgrade therefore changes
> only where the code is installed, never the data it reads.

## From npm (recommended)

```sh
dsh plugin --profile web add @sqdr2/dsh-fusion
```

## From GitHub

The repository ships the built `lib/`, so nothing is compiled locally.

```sh
dsh plugin --profile web add github:SQDR2/dsh-fusion
```

If `dsh` is not on PATH, pin one supported CLI:

```sh
npx @deepseek-ai/dsh@0.2.1-rc.5 plugin --profile web add @sqdr2/dsh-fusion
```

This writes only the `web` profile. Reopen a running Web Host once and reload the page.

## From a local checkout (development)

```sh
git clone https://github.com/SQDR2/dsh-fusion.git ~/github/dsh-fusion
cd ~/github/dsh-fusion && corepack pnpm@9.15.9 install --frozen-lockfile && cd -
dsh plugin --profile web add ~/github/dsh-fusion
```

## DSH Studio desktop app

Click **Plugins** in the left sidebar → **Add plugin**, and enter in "Package name or address":

```text
@sqdr2/dsh-fusion
```

`github:SQDR2/dsh-fusion` works there too. Then quit and reopen DSH Studio (plugins take effect at the next start).

## Upgrading from dsh-model-fusion

1. Remove the old package first, so two packages never register the Fusion entry at once:

   ```sh
   dsh plugin --profile web remove dsh-model-fusion
   ```

2. Install `@sqdr2/dsh-fusion` as above. Do **not** delete the old data directory first: everything in
   `$DSH_HOME/plugins/dsh-model-fusion/` (tasks, usage, settings) is migrated to
   `$DSH_HOME/plugins/dsh-fusion/` on first start.
3. Restart DSH (quit and reopen the desktop app; restart the Web Host and reload the page).
4. Existing sessions need no edit: the Fusion entry in the model menu points at the new route on its own.

## After installing

1. Sign in to at least two models in DSH: a strong Lead and a much cheaper Sidekick. Built-in providers work, and so do the
   subscription routes of [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login).
   Google Antigravity (agy CLI) is **built in** since 0.4.0: the `antigravity` route, `/agy`, `agy_ask` / `agy_tool` and the
   console inside the Fusion panel need no second package. If you still have the standalone
   [dsh-agy-worker](https://github.com/SQDR2/dsh-agy-worker) installed, disable or remove it **first** — enabling both at
   once fails at load (duplicate route, duplicate provider, duplicate command, duplicate tool card). Requirements and the
   manual state copy are in [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md) and
   [README.en.md](README.en.md#using-agy-as-the-sidekick-built-in).
2. Open the **Fusion** entry in the left sidebar. The page is titled **DSH Agent Studio With Fusion**; its three
   section buttons are **Fusion combos**, **Antigravity** and **ACP routes**. In Fusion combos, choose the Lead and the
   Sidekick, and save.
3. Select **Fusion · auto** in the model menu.
4. On Windows, install PowerShell 7 and make sure `pwsh` is on the PATH used to launch DSH. That is the only
   Windows evidence this project has, and it is historical: plugin v0.2.1 was verified on Windows Server 2022 with
   Node 22.23.3 and DSH 0.1.7-rc.2. That combination is far outside the current baseline (Node 24,
   DSH `>=0.2.1-rc.5 <0.3.0-0`), so Windows is unverified for this release; Windows 10/11 were never verified. On
   Linux, run the read-only check in [README.en.md](README.en.md#support) before real use.

## Uninstall

```sh
dsh plugin --profile web remove @sqdr2/dsh-fusion
```

In the desktop app, uninstall from the **Plugins** page in the left sidebar. Fusion's own records stay in
`$DSH_HOME/plugins/dsh-fusion/state.sqlite`; delete that file to remove them. The built-in Antigravity side keeps its work state where the standalone plugin kept it
(`$DSH_HOME/agy-worker/` — overrides, session bindings, media cache, warmup history) and its account pool at
`$DSH_HOME/agy-accounts/`; upstream read that pool from `DSH_STATE_DIR`, so an installation that set it needs the one-time
copy in [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md). Uninstalling this package never deletes either directory, and a
reinstall picks both up again.
