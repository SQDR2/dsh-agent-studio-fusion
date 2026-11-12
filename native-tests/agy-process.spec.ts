/**
 * Offline integration check for the built-in Antigravity route.
 *
 * This drives the REAL adapter against a REAL child process — the fixture at
 * `native-tests/fixtures/fake-agy.mjs`, wired in through the same
 * `AgyAdapterDeps.bin` seam the Host uses — and then replays the recorded tool
 * step through the production `agy_tool` mirror. It covers:
 *
 *   - model discovery (`AgyAdapter.listModels` over the fixture's `models` JSON);
 *   - one text turn: streamed `agent_response` fragments, a usage chunk and a
 *     `stop` finish, plus the session binding the adapter persists;
 *   - one tool step: the `tool-calls` span cut, the `agy_tool` arguments the
 *     mirror receives, and the recorded output the mirror replays;
 *   - cleanup: the child process exits, its recording settles, and nothing is
 *     left holding a temp directory.
 *
 * It is NOT a Fusion-worker end-to-end test. No Lead, no work order, no
 * coordinator, no Google login and no network are involved: the fixture only
 * writes NDJSON to stdout. What it proves is that the ported adapter, parser,
 * recorder and mirror work together against a real process boundary.
 *
 * Isolation: HOME, USERPROFILE, DSH_HOME, DSH_STATE_DIR, the agy conversations
 * directory, media dir and the MCP config are all redirected into throwaway temp
 * directories, and the fallback conversation-discovery hook is disabled, so the
 * run cannot read or write the account pool, a system keychain or real user
 * state. The only prompt this test sends is the literal below.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { AgyAdapter, type AgyAdapterDeps } from '../src/host/agy/adapter.js'
import { ModelCatalog } from '../src/host/agy/models.js'
import { SessionStore } from '../src/host/agy/sessions.js'
import { RunRegistry } from '../src/host/agy/recording.js'
import { defineAgyMirrorTool, MIRROR_TOOL_NAME } from '../src/host/agy/mirror-tool.js'
import { probeProcess } from '../src/host/agy/runner.js'
import { defaultConfig, type PluginConfig } from '../src/host/agy/types.js'

/** The exact prompt literal this check may send. Nothing else is composed here. */
const PROMPT = 'offline integration check'

const FIXTURE = join(import.meta.dirname, 'fixtures', 'fake-agy.mjs')

/** Environment keys this test redirects; restored after each case. */
const REDIRECTED = [
  'HOME', 'USERPROFILE', 'DSH_HOME', 'DSH_STATE_DIR', 'DSH_AGY_CONVERSATIONS_DIR',
  'DSH_AGY_MODE', 'DSH_AGY_BIN', 'DSH_AGY_ENABLED', 'DSH_AGY_MCP_BRIDGE', 'DSH_AGY_CACHE_DIR',
  'GEMINI_CLI_HOME', 'FAKE_AGY_MODE', 'FAKE_AGY_ARGS_FILE',
] as const

let root = ''
const saved = new Map<string, string | undefined>()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fusion-agy-offline-'))
  for (const key of REDIRECTED) saved.set(key, process.env[key])
  // A self-contained machine: every path the adapter could reach for points inside `root`.
  const home = join(root, 'home')
  process.env.HOME = home
  process.env.USERPROFILE = home
  process.env.DSH_HOME = join(root, 'dsh-home')
  process.env.DSH_STATE_DIR = join(root, 'dsh-state')
  process.env.DSH_AGY_CONVERSATIONS_DIR = join(root, 'conversations')
  process.env.GEMINI_CLI_HOME = join(root, 'gemini-home')
  // Keep the fixture deterministic and stop any real binary from being resolved.
  process.env.FAKE_AGY_MODE = 'ok'
  process.env.DSH_AGY_MODE = 'skip'
  delete process.env.DSH_AGY_BIN
})

afterEach(() => {
  for (const key of REDIRECTED) {
    const previous = saved.get(key)
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
  saved.clear()
  rmSync(root, { recursive: true, force: true })
})

/** An adapter whose only outside dependency is the fixture child process. */
function makeAdapter(overrides: Partial<PluginConfig> = {}) {
  const argsFile = join(root, 'argv.json')
  process.env.FAKE_AGY_ARGS_FILE = argsFile
  const cfg: PluginConfig = {
    ...defaultConfig(),
    // The fixture speaks the same stream-json vocabulary as the real CLI.
    permissionMode: 'skip',
    timeoutMs: 20_000,
    workspaceRoot: root,
    mediaDir: join(root, 'media'),
    mcpConfigPath: join(root, 'mcp.json'),
    mcpBridge: false,
    autoWarmup: false,
    quotaPollIntervalMs: 3_600_000,
    ...overrides,
  }
  const store = new SessionStore(join(root, 'sessions.json'))
  // Same discovery seam the Host uses: spawn `agy models` and hand the stdout to
  // the catalog parser. Here the "binary" is the fixture, so discovery is real
  // process work with no network.
  const catalog = new ModelCatalog(
    async (signal, _accountId) => {
      const out = await probeProcess(FIXTURE, ['models'], 30_000, signal, process.env, false)
      if (out.code !== 0 && out.stdout.trim() === '') {
        throw new Error('agy models failed: ' + out.stderrTail.slice(-200))
      }
      return { stdout: out.stdout, stderr: out.stderrTail }
    },
    cfg.fallbackModels,
    300_000,
  )
  const runs = new RunRegistry()
  const deps: AgyAdapterDeps = {
    getConfig: () => cfg,
    catalog,
    store,
    bin: () => FIXTURE,
    acquire: () => Promise.resolve(() => {}),
    runs,
  }
  const adapter = new AgyAdapter(deps)
  return { adapter, store, runs, catalog, cfg, argsFile }
}

const user = (text: string): Message => ({ role: 'user', content: [{ type: 'text', text }] } as unknown as Message)

const options = (messages: Message[], extra: Partial<GenerateOptions> = {}): GenerateOptions => ({
  provider: 'antigravity', model: 'gemini-3.6-flash', messages, ...extra,
} as GenerateOptions)

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

/** Wait for the recording to settle, so a replay sees the finished tool step. */
async function settledRecording(runs: RunRegistry, runId: string): Promise<NonNullable<ReturnType<RunRegistry['get']>>> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const rec = runs.get(runId)
    if (rec !== undefined && rec.isSettled) return rec
    if (Date.now() > deadline) throw new Error('recording did not settle within 10s')
    await new Promise(resolve => { setTimeout(resolve, 20) })
  }
}

describe('offline AGY process integration (fixture child, real adapter, real mirror)', () => {
  it('discovers models from the CLI listing', async () => {
    const { adapter, catalog } = makeAdapter()
    // `listModels` refreshes in the background, so await the discovery explicitly:
    // the assertion is about the fixture's stdout reaching the catalog parser.
    await catalog.forceRefresh()
    const models = await adapter.listModels()
    // The fallback catalog cannot produce this id, so seeing it proves the CLI listing was read.
    expect(models.map(model => model.id)).toContain('offline-fixture-model')
    expect(models.every(model => model.provider === 'antigravity')).toBe(true)
  })

  it('runs one text turn through a real child process and binds the session', async () => {
    const { adapter, store, argsFile } = makeAdapter()
    // `tools: []` withholds the mirror transport, so this span does not cut on the
    // fixture's tool step and the streamed answer stays in one span (which is what
    // a text-only Fusion Worker turn on this route looks like).
    const chunks = await collect(adapter.stream(options([user(PROMPT)], { sessionId: 'offline-session', tools: [] } as never)))

    const text = chunks.filter(c => c.type === 'text-delta')
      .map(c => (c as unknown as { text: string }).text).join('')
    // The fixture streams "Offline " + "fixture " + "answered." as separate deltas.
    expect(text).toBe('Offline fixture answered.')

    const finish = chunks.at(-1) as { type: string; reason: { kind: string } }
    expect(finish.type).toBe('finish')
    expect(finish.reason.kind).toBe('stop')
    // A usage chunk precedes the finish: the run is accounted, not just text.
    expect(chunks.some(c => c.type === 'usage')).toBe(true)

    // The adapter really spawned the fixture with the prompt and no real binary.
    const argv = JSON.parse(readFileSync(argsFile, 'utf8')) as string[]
    expect(argv).toContain('--output-format')
    expect(argv[argv.indexOf('--output-format') + 1]).toBe('stream-json')
    // The literal prompt rides `-p` (the request is far below the argv ceiling).
    const promptAt = argv.indexOf('-p')
    expect(promptAt).toBeGreaterThan(-1)
    expect(argv[promptAt + 1]).toBe(PROMPT)

    // The session binding names the conversation the fixture reported.
    const binding = store.get('offline-session')
    expect(binding?.conversationId).toBe('conv-offline-1')
  })

  it('cuts one tool span, records the step, and replays it through the production mirror', async () => {
    const { adapter, runs } = makeAdapter()
    const chunks = await collect(adapter.stream(options([user(PROMPT)], { sessionId: 'offline-tool' as never })))

    const finish = chunks.at(-1) as { type: string; reason: { kind: string } }
    expect(finish.type).toBe('finish')
    // The fixture emits one completed tool step, so the span is cut for it.
    expect(finish.reason.kind).toBe('tool-calls')

    const block = chunks.find(c => c.type === 'block-end' && (c as { block?: { type?: string } }).block?.type === 'tool-call') as
      unknown as { block: { id: string; name: string; arguments: string } } | undefined
    expect(block).toBeDefined()
    // The native mirror is preferred whenever `agy_tool` is advertised.
    expect(block.block.name).toBe(MIRROR_TOOL_NAME)

    const args = JSON.parse(block.block.arguments) as { run: string; step: number }
    expect(typeof args.run).toBe('string')
    expect(args.run.length).toBeGreaterThan(0)

    // The recording holds the step the fixture executed, and it settles.
    const rec = await settledRecording(runs, args.run)
    const recorded = rec.toolEventAt(args.step)
    expect(recorded?.name).toBe('run_command')
    expect(recorded?.output).toBe('note1.txt\nnote2.txt\n')

    // The production mirror replays that recorded output for the span's callId.
    const mirror = defineAgyMirrorTool({ runs })
    const replayed = await mirror.execute(
      { run: args.run, step: args.step } as never,
      { signal: new AbortController().signal } as never,
    )
    expect(replayed).toBe('note1.txt\nnote2.txt\n')
  })

  it('surfaces a failing run as an error finish, not a silent stop', async () => {
    const { adapter } = makeAdapter()
    process.env.FAKE_AGY_MODE = 'fail'
    const chunks = await collect(adapter.stream(options([user(PROMPT)], { sessionId: 'offline-fail', tools: [] } as never)))
    const finish = chunks.at(-1) as { type: string; reason: { kind: string; failure?: { code: string; message: string } } }
    expect(finish.type).toBe('finish')
    // Exactly how a native provider error ends a turn — never a fake `stop`.
    expect(finish.reason.kind).toBe('error')
    expect(finish.reason.failure?.message ?? '').toMatch(/offline fixture failure/)
  })

  it('settles the run and leaves no live recording behind', async () => {
    const { adapter, runs } = makeAdapter()
    await collect(adapter.stream(options([user(PROMPT)], { sessionId: 'offline-cleanup', tools: [] } as never)))
    // The adapter awaited the process outcome, so every recording it created is
    // settled (the registry keeps settled runs for replay, which is intentional):
    // nothing is still live, so nothing can keep the temp workspace busy.
    const live = runs.runIds.filter(id => runs.get(id)?.isSettled === false)
    expect(live).toEqual([])
    // Nothing stays pinned either: a pinned run would be exempt from eviction
    // and would keep the recording (and its workspace) reachable forever.
    expect(runs.pinnedCount).toBe(0)
    expect(existsSync(root)).toBe(true)
  })
})
