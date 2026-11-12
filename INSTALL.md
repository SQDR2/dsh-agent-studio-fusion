# Install DSH Agent Studio

[中文](INSTALL.zh.md) · Product pages: [README.md](README.md) (中文), [README.en.md](README.en.md)

Requires **DeepSeek Harness `>=0.2.1-rc.5 <0.3.0-0`** on **Node 24 or newer**. Other versions are not supported;
the 0.2.0 series is no longer supported.

> Published as `@sqdr2/dsh-agent-studio-fusion`, with plugin id `dsh-agent-studio-fusion`.
> Any existing data from `dsh-fusion` or `dsh-model-fusion` is migrated automatically on first start.

## From npm (recommended)

```sh
dsh plugin --profile web add @sqdr2/dsh-agent-studio-fusion
```

## From GitHub

The repository ships the built `lib/`, so nothing is compiled locally.

```sh
dsh plugin --profile web add github:SQDR2/dsh-agent-studio-fusion
```

If `dsh` is not on PATH, pin one supported CLI:

```sh
npx @deepseek-ai/dsh@0.2.1-rc.5 plugin --profile web add @sqdr2/dsh-agent-studio-fusion
```

This writes only the `web` profile. Reopen a running Web Host once and reload the page.

## From a local checkout (development)

```sh
git clone https://github.com/SQDR2/dsh-agent-studio-fusion.git ~/github/dsh-agent-studio-fusion
cd ~/github/dsh-agent-studio-fusion && corepack pnpm@9.15.9 install --frozen-lockfile && cd -
dsh plugin --profile web add ~/github/dsh-agent-studio-fusion
```

## DSH Studio desktop app

Click **Plugins** in the left sidebar → **Add plugin**, and enter in "Package name or address":

```text
@sqdr2/dsh-agent-studio-fusion
```

`github:SQDR2/dsh-agent-studio-fusion` works there too. Then quit and reopen DSH Studio (plugins take effect at the next start).

## Upgrading from earlier packages

1. Remove previous packages to avoid conflicts:

   ```sh
   dsh plugin --profile web remove @sqdr2/dsh-fusion
   dsh plugin --profile web remove dsh-model-fusion
   ```

2. Install `@sqdr2/dsh-agent-studio-fusion` as shown above. Do **not** delete the data directory:
   all ledger, tasks and state will migrate into `$DSH_HOME/plugins/dsh-agent-studio-fusion/` automatically.
3. If you had standalone `dsh-agy-worker` installed, remove it:
   ```sh
   dsh plugin --profile web remove @sqdr2/dsh-agy-worker
   ```
4. Restart DSH.

## Uninstall

```sh
dsh plugin --profile web remove @sqdr2/dsh-agent-studio-fusion
```
