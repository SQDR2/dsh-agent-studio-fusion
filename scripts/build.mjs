import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

/**
 * Build the two artifacts the Harness loads: the Host module (`lib/dsh-fusion.js`,
 * plain ESM with every package external) and the Web client bundle
 * (`lib/client.js`, a CommonJS body wrapped in the Harness module-loader
 * envelope).
 *
 * Two paths produce the same output. The harness-owned `dshx` builder is used
 * when a checkout provides it; otherwise a local `esbuild` pass emits the same
 * shape. The fallback exists because a harness release can drop `tools/dshx`
 * without making this repository unbuildable — and because the fallback needs no
 * harness checkout at all, so a plain `pnpm build` works here.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { name: id } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const emitTypes = () => execFileSync(process.execPath,
  [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' })

const clientBanner = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(id)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
`
const clientFooter = `
		return module.exports;
	}
});
`

/** The harness-owned path: one bundler config per face, resolved from the checkout. */
async function buildWithDshx(host) {
  const adapter = resolve(host, 'tools/dshx/src/client-build.js')
  const require = createRequire(resolve(host, 'package.json'))
  const { build } = await import(pathToFileURL(require.resolve('tsdown')).href)
  const { externalClientBundle } = await import(pathToFileURL(adapter).href)
  emitTypes()
  mkdirSync(resolve(root, 'lib'), { recursive: true })
  for (const config of externalClientBundle(id, ['src/dsh-fusion.ts'], { packageRoot: root, clientEntry: 'src/client/index.ts' })) {
    await build({ ...config, config: false, cwd: root })
  }
}

/**
 * The local path. Packaging rules are the ones the Harness relies on: every bare
 * specifier stays a runtime import (`packages: 'external'`), so no `@deepseek-ai/*`
 * package is duplicated into the bundle, and the client body is CommonJS because
 * the module loader hands it a `require`.
 */
async function buildWithEsbuild() {
  const { build } = await import(pathToFileURL(createRequire(resolve(root, 'package.json')).resolve('esbuild')).href)
  emitTypes()
  mkdirSync(resolve(root, 'lib'), { recursive: true })
  // The Host module ships without a sourcemap, like the client bundle the harness
  // serves with one: keep the artifact set identical to the dshx build.
  await build({ entryPoints: [resolve(root, 'src/dsh-fusion.ts')], outfile: resolve(root, 'lib/dsh-fusion.js'),
    bundle: true, format: 'esm', platform: 'node', target: 'node22', packages: 'external', sourcemap: false, logLevel: 'warning' })
  await build({ entryPoints: [resolve(root, 'src/client/index.ts')], outfile: resolve(root, 'lib/client.js'),
    bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', packages: 'external', jsx: 'automatic',
    sourcemap: true, logLevel: 'warning', banner: { js: clientBanner }, footer: { js: clientFooter } })
}

const host = process.env.DSHX_HARNESS
if (host && existsSync(resolve(host, 'tools/dshx/src/client-build.js'))) await buildWithDshx(host)
else await buildWithEsbuild()
