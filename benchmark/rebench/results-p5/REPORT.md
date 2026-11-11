# Phase 5 A/B result — the prompt change is faster but not safe to merge as-is

Pilot, 4 tasks × 1 attempt per arm, same committed code, same Fusion pair
(`gz/gpt-6-astra` high + `gz/deepseek-v4.1-flash` high), same bench Host and
profile. The only variable is `prompts/`: arm A is `96c5e3b` (before this
branch), arm B is `facbd4b` (this branch).

Data: `results-p5/results-p5-A.jsonl`, `results-p5/results-p5-B.jsonl`.
Compare with `python3 compare_arms.py results-p5-A.jsonl results-p5-B.jsonl`.
No attempt was excluded: 0 suspect, 0 contaminated, no infrastructure errors.

## Headline

| metric | A (old prompts) | B (new prompts) | change | threshold | verdict |
|---|---|---|---|---|---|
| resolved | **3/4** | **2/4** | −1 task | not worse | **FAIL** |
| wall s (median) | 1559 | 869 | **−44%** | ≥25% lower | PASS |
| worker tool calls (median) | 84 | 54.5 | **−35%** | ≥30% lower | PASS |
| rework rounds (median) | 1 | 2 | +100% | not higher | FAIL |
| cost USD (median) | 0.80 | 0.79 | −1% | ≥15% lower | FAIL |

Per task:

| task | A | B |
|---|---|---|
| delgan__loguru-1451 | OK 26m, 66 worker calls, 1 rework, 81 lines | OK 21m, 55 calls, 3 reworks, 50 lines |
| holoviz__param-1117 | OK 27m, 102 calls, 1 rework, 85 lines | OK 10m, 54 calls, 2 reworks, 72 lines |
| sqlfluff__sqlfluff-7615 | FAIL 25m, 105 calls, 1 rework, 90 lines | FAIL 18m, 82 calls, 2 reworks, 48 lines |
| ucfopen__canvasapi-716 | **OK** 7m, 56 calls, 1 rework, 79 lines | **FAIL** 5m, 31 calls, 0 reworks, 52 lines |

The speed win is real and large — the same pattern the Devin comparison pointed
at (fewer execution rounds, not fewer tokens). The correctness regression is one
task, and it is the *cheapest* task in the set.

## The one regression, as far as the data shows

`ucfopen__canvasapi-716`, `tests/test_util.py::TestUtil::test_obj_or_str_invalid_obj_type`
is the only failing FAIL_TO_PASS test in arm B; every PASS_TO_PASS test still
passes (60/60), so this is an incomplete fix, not a broken regression.

What differs between the arms on this task:

- arm A: Lead made 11 tool calls, Worker 56, 19 parallel turns, 1 rework, and the
  final diff touched `canvasapi/util.py` with 43 changed lines (56 insertions /
  23 deletions overall).
- arm B: Lead made 18 tool calls, Worker 31, 8 parallel turns, **0 reworks**, and
  `canvasapi/util.py` changed 16 lines (52 insertions / 8 deletions overall).

So arm B's Lead investigated more itself and handed over a narrower edit, the
Worker did less, and nobody ran a verification round on the branch the hidden
test exercises. That is consistent with the rule this branch added — "once you
have settled an edit, pass the exact file, location and a fenced snippet" — being
read as "the snippet *is* the whole change": it suppresses the rework that would
have caught the missed case. It is one attempt, so this is a hypothesis about the
mechanism, not a demonstrated cause.

## What this means for the plan

`docs/DEVIN-LOCAL-FUSION.md` §7.4 says a change that is faster but resolves less
does not merge, and the three prompt rules must then be reverted one at a time to
find which one costs correctness. That is where this stands:

1. **Do not merge `facbd4b` as-is.** The efficiency rules (check damping,
   consolidated rework, mid-handoff steering) are separable from the
   brief-shape rule; the evidence points at the brief-shape rule.
2. Next round (needs a new budget decision): arm C = arm B minus the
   "exact file/location/fenced snippet" instruction, keeping check damping and
   batch-rework. Same 4 tasks, same pair. If C is ~as fast as B and resolves like
   A, the brief-shape rule is the one to drop.
3. Keep the safety work regardless: the authority guard (`4212638`) and the
   runtime declaration (`43a106f`) are not implicated by this pilot.

## Limits

- n=1 per cell, 4 public tasks. These are observations, not rates; neither arm
  can be ranked against the other statistically.
- `deepseek-v4.1-flash` has no list price in `plan-phase5.json`, so the cost
  column is a lead-only lower bound (`unpricedModels` names it in every row).
- Wall time here was measured serially (`--concurrency 1`), which is why the
  medians are comparable; the round-devin-r1 protocol ran DSH concurrently and
  reported that as a confound.
- One earlier smoke attempt on `delgan__loguru-1451` died with `PI_AI_ERROR`
  ("Upstream response stream was interrupted") in the Worker's second turn. It is
  not counted in either arm; the rerun resolved normally.