#!/usr/bin/env python3
"""Compare two arms of the phase-5 A/B and apply the thresholds from the plan.

    python3 compare_arms.py results-p5-A.jsonl results-p5-B.jsonl [--label-a A] [--label-b B]

Arm A is the baseline (the prompts as they were), arm B the change. Both files must come
from the same plan, task list and pair: the only intended difference is `prompts/`.

Metrics per attempt, taken from the row `run.py` already writes:

- resolved      `grade.resolved`
- wall time     `wallSeconds`
- worker tool calls  sum of `usage.tools["worker:*"]` (the execution side; the Lead's calls
                     are judgement, not turnover)
- delegation rounds  `usage.delegations` (a re-delegation is a whole extra handoff)
- rework rounds      `usage.tools["lead:fusion_rework"]`
- cost           `costUsd` at list prices, with `unpricedModels` named

Attempts flagged `suspect` or carrying `contamination` are excluded and counted, never
silently dropped: a leaked hidden test moves the headline more than any prompt change.
"""
import argparse, json, statistics, sys

FIELDS = ('resolved', 'wall', 'workerCalls', 'delegations', 'reworks', 'cost')


def contaminated(row):
    """`contamination` is always a record; only its verdict flags exclude an attempt."""
    record = row.get('contamination') or {}
    return bool(record.get('contaminated') or record.get('flagged') or record.get('hiddenTestExposed'))


def load(path):
    rows = [json.loads(line) for line in open(path) if line.strip()]
    kept, excluded = [], []
    for row in rows:
        if row.get('suspect') or contaminated(row):
            excluded.append(row)
        else:
            kept.append(row)
    return kept, excluded


def metrics(row):
    usage = row.get('usage') or {}
    tools = usage.get('tools') or {}
    return {
        'resolved': bool((row.get('grade') or {}).get('resolved')),
        'wall': row.get('wallSeconds') or 0,
        'workerCalls': sum(v for k, v in tools.items() if k.startswith('worker:')),
        'delegations': usage.get('delegations') or 0,
        'reworks': tools.get('lead:fusion_rework') or 0,
        'cost': row.get('costUsd') or 0.0,
        'unpriced': tuple(sorted(row.get('unpricedModels') or [])),
    }


def aggregate(rows):
    if not rows:
        return None
    per = [metrics(row) for row in rows]
    return {
        'n': len(per),
        'resolved': sum(m['resolved'] for m in per),
        'wall': statistics.median(m['wall'] for m in per),
        'workerCalls': statistics.median(m['workerCalls'] for m in per),
        'delegations': statistics.median(m['delegations'] for m in per),
        'reworks': statistics.median(m['reworks'] for m in per),
        'cost': statistics.median(m['cost'] for m in per),
        'unpriced': sorted({name for m in per for name in m['unpriced']}),
    }


def change(base, arm):
    if not base or not arm or not base:
        return None
    return (arm - base) / base if base else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a'); ap.add_argument('b')
    ap.add_argument('--label-a', default='A (baseline)'); ap.add_argument('--label-b', default='B (change)')
    args = ap.parse_args()
    a_rows, a_excluded = load(args.a)
    b_rows, b_excluded = load(args.b)
    a, b = aggregate(a_rows), aggregate(b_rows)
    if not a or not b:
        sys.exit(f'need at least one usable row per arm (A={len(a_rows)} B={len(b_rows)})')

    print(f'{"metric":<18}{args.label_a:>26}{args.label_b:>26}{"change":>10}')
    print('-' * 80)
    print(f'{"attempts (used)":<18}{a["n"]:>26}{b["n"]:>26}{"":>10}')
    print(f'{"excluded":<18}{len(a_excluded):>26}{len(b_excluded):>26}{"":>10}')
    print(f'{"resolved":<18}{a["resolved"]:>26}{b["resolved"]:>26}{"":>10}')
    for key, label in (('wall', 'wall s (median)'), ('workerCalls', 'worker calls (med)'),
                       ('delegations', 'delegations (med)'), ('reworks', 'rework rounds (med)'),
                       ('cost', 'cost USD (median)')):
        delta = change(a[key], b[key])
        shown = 'n/a' if delta is None else f'{delta:+.0%}'
        print(f'{label:<18}{a[key]:>26.1f}{b[key]:>26.1f}{shown:>10}')
    unpriced = sorted(set(a['unpriced']) | set(b['unpriced']))
    if unpriced:
        print(f'\nunpriced in cost column: {", ".join(unpriced)} — treat cost as a lead-only lower bound')

    # Thresholds from docs/DEVIN-LOCAL-FUSION.md 7.4.
    verdicts = []
    verdicts.append(('resolved not worse', b['resolved'] >= a['resolved']))
    for key, label, need in (('workerCalls', 'worker tool calls ≥30% lower', 0.70),
                             ('wall', 'wall time ≥25% lower', 0.75),
                             ('cost', 'cost ≥15% lower', 0.85)):
        ratio = b[key] / a[key] if a[key] else float('inf')
        verdicts.append((label, ratio <= need))
    verdicts.append(('rework rounds not higher', b['reworks'] <= a['reworks']))
    print('\nthresholds (docs/DEVIN-LOCAL-FUSION.md §7.4):')
    for label, ok in verdicts:
        print(f'  {"PASS" if ok else "FAIL"}  {label}')
    print(f'\n{args.label_a} rows: {args.a}\n{args.label_b} rows: {args.b}')
    print('n per cell is the pilot limit: these are observations, not rates.')


if __name__ == '__main__':
    main()