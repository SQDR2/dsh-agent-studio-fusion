# Phase 5 — the A/B this branch's prompt changes need

The prompt changes in `facbd4b` claim no speed or cost improvement: no new model
call was made when they landed. `docs/DEVIN-LOCAL-FUSION.md` §7.4 fixes the
protocol below; §7 records why these rules are the ones being tested (Devin's own
verify-once / never-re-run / batch-the-rework framing, and the 4.4× sidekick-call
gap measured on the same model pair in `results-devin-r1`).

## What is already verified here

The pipeline runs end to end without a model:

```
python3 benchmark/rebench/harness.py fetch
# {"fetched": 9, "rows": "/home/zlw/.rebench-data/rows-tasks.json"}

python3 benchmark/rebench/harness.py prepare delgan__loguru-1451 dry-run
# /home/zlw/rebench-work/delgan__loguru-1451/dry-run

python3 run.py --plan plan-phase5.json --out /tmp/p5-dry.jsonl --dry-run \
  --only delgan__loguru-1451
# {"pending": 1, "alreadySpentUsd": 0.0}
# {"key": "delgan__loguru-1451|F_fusion|1", "wallSeconds": 18, "costUsd": 0.0,
#  "error": null, "resolved": true}
```

`--dry-run` applies the gold patch instead of calling a model, so it proves
preparation, gold/hidden-test separation, grading and bookkeeping — not a
benchmark result.

## Prerequisites the dry run does not need

1. **A Host that loads this branch's plugin.** The web profile links
   `dsh-fusion: link:/home/zlw/github/dsh-fusion`, which is the main checkout
   (`96c5e3b`), not this worktree. Both arms must run the *same code*; only
   `prompts/` differs. Point the link at this worktree (or install this branch
   into a dedicated profile) before either arm, and restart that Host so the
   profile re-resolves.
2. **A transport that can reach the Host.** `dsh.mjs` now accepts either:
   - `DSH_BENCH_URL` — the URL `dsh web` prints, which carries `?token=`. That
     launch token lives only in the printing process's memory (`browser-auth.ts`
     `processLaunchToken`, never written to disk), so it must be handed over; the
     bridge exchanges it at `/connect?token=…&interactions=none` for a signed API
     operator cookie and reuses that cookie. This is the path for checkouts that
     have no `tools/dshx` (this one has none, and never did);
   - or the historical `tools/dshx` helpers, when the checkout has them.
   Both failure paths fail loudly and before any request is sent.
3. **A budget and a pair.** `plan-phase5.json` uses `gz/gpt-6-astra` (lead) +
   `gz/deepseek-v4.1-flash` (worker). The worker has no list price in that plan,
   so `run.py` reports it under `unpricedModels` — do not read the cost column as
   complete until that is filled in or the pair changes.

Use a **dedicated** Host/profile for this: `run.py` sets the Fusion pair and the
default model before a round and restores them afterwards, which should not be
done against the GUI profile someone is working in.

## The two arms

The variable is the role prompts, not the plan: both arms run `F_fusion` with the
same code and the same pair, into separate result files. Prompts are read from
the plugin's `prompts/` directory when the combo plan resolves
(`src/dsh-fusion.ts` `resolveCombos`), and that resolution is cached — so restart
the Host after swapping the files, don't hope a stale cache re-reads them.

```bash
PLUGIN=/path/to/the/plugin/the/Host/loads
IDS=delgan__loguru-1451,holoviz__param-1117,sqlfluff__sqlfluff-7615,ucfopen__canvasapi-716   # the four clean tasks

# Arm A — the prompts as they were before this branch (96c5e3b).
git -C "$PLUGIN" show 96c5e3b:prompts/lead.md        > "$PLUGIN/prompts/lead.md"
git -C "$PLUGIN" show 96c5e3b:prompts/model-lead.md  > "$PLUGIN/prompts/model-lead.md"
git -C "$PLUGIN" show 96c5e3b:prompts/worker.md      > "$PLUGIN/prompts/worker.md"
git -C "$PLUGIN" show 96c5e3b:prompts/model-worker.md > "$PLUGIN/prompts/model-worker.md"
# restart the benchmark Host, then:
cd benchmark/rebench && python3 run.py --plan plan-phase5.json \
  --out results-p5-A.jsonl --only "$IDS" --concurrency 1 --budget-usd 40 --cleanup

# Arm B — this branch's prompts.
git -C "$PLUGIN" checkout -- prompts/
# restart the benchmark Host, then:
python3 run.py --plan plan-phase5.json \
  --out results-p5-B.jsonl --only "$IDS" --concurrency 1 --budget-usd 40 --cleanup
```

`--cleanup` deletes each workspace after grading; keep `diffStat` from the row
as the evidence.

## Reading the result

Per attempt the row carries: `resolved`, `grade`, `wallSeconds`, `costUsd`,
`unpricedModels`, `usage` (per-role requests, input/cache-read/output tokens,
tool calls, multi-command shell calls, turn-end kinds), `contamination` and
`suspect`. Compare arms on medians, not single attempts, and exclude any attempt
whose `contamination` or `suspect` is set — the round-devin-r1 write-up shows how
much a single leaked hidden test moves the headline.

Admission thresholds (§7.4), applied to the Worker-side counters:

| axis | threshold |
|---|---|
| resolved | no worse than arm A |
| Worker tool calls (median) | ≥ 30% lower |
| wall time (median) | ≥ 25% lower |
| total cost (median) | ≥ 15% lower |
| rework rounds | not higher |
| contamination / authority violations / unverified success claims | none new |

If arm B is faster but resolves less, the change does not merge: revert the
three rules one at a time (`fenced snippet`, `check damping`, `consolidated
rework`) to find which one costs correctness.

## What this is not

`reps: 1` over four tasks is a directional pilot with the same limits as
`docs/REBENCH_DEVIN.md`: it cannot rank the two arms statistically, and every
task is public, so training-data contamination is shared by both arms rather
than measured. Report the raw counts and name the pilot as such.