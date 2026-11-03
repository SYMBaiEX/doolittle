# Local desktop dependency policy

The root `package.json` and `nub.lock` define the current dependency graph and
SDK versions. The repository uses pinned, unmodified ElizaOS source archives
and published package exceptions; see [SDK upgrades](sdk-package-upgrades.md).
Do not assume a dated vulnerability inventory describes the current graph.

`nub run check:runtime-advisory-policy` audits production workspace importers
and requires a valid inventory with **zero advisories at every severity**. It
has no backport exceptions. `nub run check:acceptance` also runs the critical
production audit alongside the repository, SDK, and documentation checks. A
registry audit result can change without a source change; report the date and
actual result rather than treating an old clean scan as current evidence.

Desktop runtime preparation and artifact verification inspect the emitted and
copied runtime dependencies separately from the source graph. The verifier's
current policy lives in `apps/desktop/scripts/verify-package.ts`; consult it
when qualifying a dependency change. Source-graph audit success is not proof
that a packaged binary contains the expected files, and an artifact inventory
is not a substitute for a production dependency audit.

Before a local install, prepare and audit the runtime, package a clean commit,
and run the applicable packaged acceptance described in
[development and testing](fast-development.md). Local ad-hoc signing does not
certify notarization. Preserve a separate previous application if rollback is
needed; profile downgrade compatibility is not guaranteed.

The [October 25 dependency replacement record](../security/dependency-replacements-2026-10-25.md)
describes the historical remediation and verification, not current audit status.
