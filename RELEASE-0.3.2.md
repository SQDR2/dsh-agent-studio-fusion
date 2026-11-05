# @sqdr2/dsh-fusion 0.3.2

Verification release. No runtime behaviour changed from 0.3.0.

0.3.1 was meant to be this release, but its CI run failed before publishing: `tests/status-index.spec.ts` timed out at
5000ms while finishing in a fraction of a second locally. The fixture built 600 rows with one autocommit each, which a
CI runner's disk cannot absorb inside a limit meant for unit tests. Those fixtures now use a single transaction, and the
two tests that migrate and backfill a real database declare a 60s budget.

The package is otherwise identical to 0.3.0 apart from the version field. Install `@sqdr2/dsh-fusion` as usual.
