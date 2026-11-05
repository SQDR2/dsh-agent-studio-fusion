# @sqdr2/dsh-fusion 0.3.1

Verification release. No runtime behaviour changed from 0.3.0.

0.3.0 was published by hand with a granular token, before this repository could publish from CI: Actions are disabled by
default on forks, and a trusted publisher can only be added to a package that already exists. Both are now in place, so
0.3.1 exists to prove the OIDC path end to end — the tag-push workflow builds, tests and publishes without any stored
token, and the result carries a provenance attestation naming the commit it was built from.

The package is otherwise byte-identical to 0.3.0 apart from the version field. Install `@sqdr2/dsh-fusion` as usual.
