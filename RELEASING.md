# Releasing

[中文](RELEASING.zh.md) · [Install](INSTALL.md) · [README](README.en.md)

Maintainer notes. Users do not need this page.

`@sqdr2/dsh-agent-studio-fusion` publishes to npm from GitHub Actions over OIDC, so no long-lived token exists anywhere. This page
covers the one-time setup that makes that work, and the loop for each release afterwards.

## What triggers a publish

Only two events:

| Event | Result |
|---|---|
| Push a tag matching `v*` | build, test, publish |
| `workflow_dispatch` | same; `dry_run=true` stops before publishing |

**Pushing to `main` never publishes.** A merge, a docs fix or a version bump sitting on `main` has no effect on npm
until a tag exists.

The workflow skips a version that is already on npm, so re-running a tag is safe: it rebuilds and retests, then exits
without touching the registry.

## One-time setup

Both steps are already done for this repository. They are recorded here because a fork that renames the package has to
repeat them, and because a misconfigured trusted publisher fails in a way that looks like a broken workflow.

### 1. Enable Actions

This repository is a fork, and GitHub disables Actions on forks by default. Without this step a tag push is silently
ignored: no run is created, no failure appears, and the Actions tab reports `0 workflow runs`.

Open the **Actions** tab and accept the "I understand my workflows, go ahead and enable them" prompt.

### 2. Add a trusted publisher on npm

OIDC publishing is authorised per package, on the package's own settings page, which a name that has never been
published does not have. So the very first release of a name can only be done by hand.

**What actually shipped 1.0.0 (2026-11-13, including the traps):** publishing a *new* name directly with a bypass-2FA
granular token returns `E404 Not Found - PUT` (not 401), and `npm@12` behaves the same. The first publish of a name has
to be **staged** and then approved by a maintainer in the browser with 2FA:

```sh
npx npm@12 stage publish . --access public    # uploads as staged; this is what claims the name
npx npm@12 stage list                         # take the stage-id; status goes validating → staged
# then approve it in npmjs.com → avatar → Staged packages (interactive 2FA; a token cannot do this)
npx npm@12 stage list                         # after approval the entry is gone and 1.0.0 is in the registry
```

The registry first holds a `0.0.0-stage` placeholder version; once the real version is approved `dist-tags.latest`
points at it, so the placeholder can be ignored (upstream `@sqdr2/dsh-agy-worker` carries the same `0.0.0-stage`).
Staging also needs `--registry https://registry.npmjs.org/`: this machine's `~/.npmrc` points at npmmirror, which has no
`/-/stage` endpoint and answers `404 .../-/stage`.

1. Use the staging path above (or a granular token with 2FA bypass, `bypass_2fa: true`, `package: write`, correct
   scope) for that first publish. Without bypass it is rejected with `EOTP This operation requires a one-time password`.
2. On **npmjs.com → the package → Settings → Trusted publishing**, add:

   | Field | Value |
   | --- | --- |
   | Provider | GitHub Actions |
   | Repository | `SQDR2/dsh-agent-studio-fusion` |
   | Workflow | `publish.yml` |
   | Permission | allow npm publish |

   The account needs 2FA of its own first. The package page only says "2FA has been enabled for this package. It is
   recommended that you configure 2FA for your npm account", and submitting the form bounces to
   `/settings/<user>/tfa` asking for a security key or authenticator. Configure account-level 2FA before starting, or
   the form silently turns into a 2FA enrolment page and nothing is created.

3. Publish a version within **2 days**. A new trust configuration is only validated by a first successful publish;
   unvalidated ones expire and cannot be edited afterwards, only deleted and recreated.

Once the trusted publisher is validated, recommend **Settings → Publishing access → Require two-factor authentication
and disallow tokens** on the package. Tokens stop being usable for publishing; only the workflow can publish.

The npm CLI cannot create a trusted publisher: `npm trust github` needs an interactive 2FA credential, and the API
rejects a 2FA-bypass token with `Granular access tokens that bypass two-factor authentication may not perform this
action`. This step is browser-only by design.

## Cutting a release

`package.json` is the single source of truth for the version. The tag must match it exactly or the workflow stops at its
first step.

```sh
# 1. Bump the version in package.json (and nowhere else), and add the entry at
#    the top of CHANGELOG.md. That section becomes the GitHub release body.
# 2. Rebuild lib/ — it is tracked in git and shipped in the tarball, so a stale
#    lib/ publishes code that does not match the tagged source.
DSHX_HARNESS=/path/to/deepseek-harness pnpm build   # the Host checkout you test against
pnpm typecheck && pnpm test
DSHX_HARNESS=/path/to/deepseek-harness pnpm test:host
# 3. Commit the source, the rebuilt lib/ and CHANGELOG.md together.
git add -A && git commit -m "chore(release): 1.0.0"
# 4. Tag and push both.
git tag v1.0.0 && git push origin main v1.0.0
```

The workflow then runs `pnpm install`, `pnpm build`, `pnpm test` and, on a tag, `npm publish --access public`.
A published version also gets a provenance attestation, so `npm view` can point at the commit it was built from.

[`CHANGELOG.md`](CHANGELOG.md) is the only place release notes live. Do not add a `RELEASE-*.md` per version: a
directory of near-identical files that nothing links to stops being readable within a few releases, and the notes belong
under one version heading each. It lists only versions published from this repository (0.3.x as `@sqdr2/dsh-fusion`, 1.0.0 and later as
`@sqdr2/dsh-agent-studio-fusion`); upstream `dsh-model-fusion` history stays in the upstream repository.

### Two things the build is pinned to

`scripts/build.mjs` no longer version-gates the Host. It builds with whatever checkout `DSHX_HARNESS` names (or with the
local esbuild pass when none is given), so a release build is reproducible from any checkout of a supported release. The
supported runtime is declared once, in `engines.dsh` (`>=0.2.1-rc.5 <0.3.0-0`) plus `engines.node` (`>=24.0.0`), and
checked by `scripts/link-host.mjs` and the peer ranges rather than by the bundler.

CI still checks out an older devkit tag to run `pnpm build`/`pnpm test`. That is a build-time dependency of this
repository, not a statement about supported runtimes: the published plugin is expected to run on any release in
`engines.dsh`. Verify a release candidate with `DSHX_HARNESS=<checkout> pnpm test:host` against the Host you tested with.

The bundler version in the workflow is pinned to exactly `tsdown@0.22.2`. `lib/` is committed, so a different bundler
would commit a bundle that does not match what was tested; `0.22.14`, for instance, reformats several hundred lines.

## Checking a release

```sh
npm view @sqdr2/dsh-agent-studio-fusion version dist-tags
npm view @sqdr2/dsh-agent-studio-fusion@1.0.0 dist.attestations   # present means it came from CI
```

To check the artefact rather than the metadata:

```sh
npm install @sqdr2/dsh-agent-studio-fusion@1.0.0
node -e "import('@sqdr2/dsh-agent-studio-fusion').then(m => console.log(m.name, m.inject.length))"
grep -o 'id: \"[^\"]*\"' node_modules/@sqdr2/dsh-agent-studio-fusion/lib/client.js | head -1
```

The host bundle must export `dsh-agent-studio-fusion`, and the client bundle's registration id must be the package
name `@sqdr2/dsh-agent-studio-fusion`. They differ on purpose: see [INSTALL.md](INSTALL.md) for why, and `src/identity.ts` for how.

## If a publish fails

| Symptom | Cause |
| --- | --- |
| Tag pushed, `0 workflow runs` | Actions not enabled on the fork |
| `404` or `ENEEDAUTH` from `npm publish` | No trusted publisher on npm, or it expired unvalidated |
| `tag vX != package.json Y` | Version bumped in one place only |
| `Unsupported Host package version` | CI's devkit checkout does not match the tag that workflow expects (a build-time issue, not the supported runtime) |
| Bundle rebuild differs from committed `lib/` | Bundler version not pinned to `0.22.2` |
