#!/usr/bin/env node
// Offline stand-in for the `agy` CLI, used only by native-tests/agy-process.spec.ts.
//
// Faithful to the stream-json shapes the real binary emits (the same vocabulary
// the ported parser in src/host/agy/parser.ts documents and upstream's
// test/fake-agy.mjs captured): `init`, a `user_input` step, a `tool` step that
// goes ACTIVE→DONE, streamed `agent_response` text_delta fragments, and a final
// `result` envelope with usage. It contacts nothing: no network, no Google, no
// keychain — it only writes NDJSON to stdout and records its argv for assertions.
//
// Modes (FAKE_AGY_MODE):
//   ok          — the sequence above, exit 0
//   models      — the `models` subcommand listing (JSON array), exit 0
//   version     — `--version` output, exit 0
//   fail        — a result envelope with status ERROR, exit 1
//
// It never reads user state and never touches the account pool or a keychain.
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const mode = process.env.FAKE_AGY_MODE ?? 'ok'

// Record what the adapter actually invoked, so the test can assert the prompt
// literal and the arguments it built instead of trusting a log line.
if (process.env.FAKE_AGY_ARGS_FILE) {
  try { writeFileSync(process.env.FAKE_AGY_ARGS_FILE, JSON.stringify(argv)) } catch { /* best effort */ }
}

if (argv[0] === '--version' || mode === 'version') {
  process.stdout.write('agy version 1.1.13-fake\n')
  process.exit(0)
}

if (argv[0] === 'models' || mode === 'models') {
  // `offline-fixture-model` is deliberately absent from the built-in fallback
  // catalog, so a test that sees it knows the CLI listing was really read.
  process.stdout.write(JSON.stringify([
    { id: 'offline-fixture-model', display_name: 'Offline Fixture Model' },
    { id: 'gemini-3-6-flash', display_name: 'Gemini 3.6 Flash' },
  ]))
  process.exit(0)
}

const emit = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')

const conv = argv.includes('--conversation')
  ? argv[argv.indexOf('--conversation') + 1]
  : 'conv-offline-1'

if (mode === 'fail') {
  emit({ event: 'result', result: { conversation_id: '', status: 'ERROR', response: '', error: 'offline fixture failure', duration_seconds: 0.1, num_turns: 0, usage: { input_tokens: 0, output_tokens: 0 } } })
  process.exit(1)
}

// 1. Handshake: the adapter learns the conversation id and the model agy reports.
emit({ event: 'init', conversation_id: conv, init: { model: 'gemini-3-6-flash', cwd: process.cwd(), tools: ['run_command', 'read_file'] } })

// 2. The prompt agy accepted, as its own first step (no text: user_input steps are markers).
emit({ event: 'step_update', step_update: { conversation_id: conv, step_index: 0, state: 'DONE', step_type: 'user_input' } })
emit({ event: 'step_update', step_update: { conversation_id: conv, step_index: 1, state: 'DONE', step_type: 'checkpoint', duration_seconds: 0.05 } })

// 3. One tool step: ACTIVE announces the parameters, DONE carries the output.
//    This is the step the mirror tool later replays through `recordedStep`.
emit({ event: 'step_update', step_update: { conversation_id: conv, step_index: 2, state: 'ACTIVE', step_type: 'tool', tool_name: 'run_command', tool_info: { name: 'run_command', parameters: { CommandLine: 'ls' } } } })
emit({ event: 'step_update', step_update: { conversation_id: conv, step_index: 2, state: 'DONE', step_type: 'tool', duration_seconds: 0.2, tool_name: 'run_command', tool_info: { name: 'run_command', parameters: { CommandLine: 'ls' }, output: 'note1.txt\nnote2.txt\n' } } })

// 4. The answer, streamed as sequential partial text like the real binary.
emit({ event: 'step_update', step_update: { conversation_id: conv, step_index: 3, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Offline ' } })
emit({ event: 'step_update', step_update: { conversation_id: conv, step_index: 3, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'fixture ' } })
emit({ event: 'step_update', step_update: { conversation_id: conv, step_index: 3, state: 'DONE', step_type: 'agent_response', text_delta: 'answered.', duration_seconds: 0.4, usage: { input_tokens: 120, output_tokens: 6, thinking_tokens: 2, total_tokens: 128 } } })

// 5. The final envelope. Its response matches the streamed fragments so the
//    adapter's "final answer" projection is exercised too.
emit({ event: 'result', result: { conversation_id: conv, status: 'DONE', response: 'Offline fixture answered.', duration_seconds: 0.6, num_turns: 1, usage: { input_tokens: 120, output_tokens: 6, thinking_tokens: 2, total_tokens: 128 } } })

process.exit(0)
