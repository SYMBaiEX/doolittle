# Workspace audit coverage follow-up — October 25, 2026

Current status: the [dependency replacements](dependency-replacements-2026-10-25.md) remove all six
remaining advisory sources and eight backport files. Audit inventories are clean;
the release policy now requires zero advisories. The details below describe the
earlier remediation snapshot.


The monorepo refactor moves runtime dependencies into their owning workspaces.
Nub's audit command inspects the current lockfile importer rather than all
workspace importers. Running it against the new tooling-only root printed
`No dependencies to audit`; the former review command then accepted an empty
advisory report. That result did not establish production dependency coverage.

`scripts/audit-production.ts` now gathers every declared workspace's locked
production and optional dependency roots, excluding local links because each
linked workspace contributes its own roots. It projects those roots into
private temporary lockfile importers, retaining the original package/snapshot
bytes. Conflicting locked versions receive separate scopes. It neither
installs nor updates packages and refuses missing importers, empty graphs,
invalid reports and registry failures. Regression tests cover the tooling-only
root, local links, optional dependencies, version conflicts and unchanged
snapshots. Unknown advisories still fail the review policy.

The initial corrected scan examined 36 dependency roots against 2,629 lockfile
packages. It found no critical advisories, but exposed previously hidden
findings in body-parser, Electron, fast-uri, ip-address, markdown-it,
serialize-javascript, TOML, Undici and Zod. That superseded the earlier release
result; the tooling-only audit had never established full workspace coverage.

## Remediation snapshot

The follow-up updates those affected release lines and refreshes the direct app,
protocol and development dependencies, including Electron 45, ACP SDK 2.0.2,
React 19.3.1 and Nub 0.9.7. The emitted-runtime verifier enforces the updated
parser/networking floors, with before/after regression cases. New SDK packages
advance independently where their published files and APIs work with Doolittle;
see [the package compatibility record](../engineering/sdk-package-upgrades.md).

Zod 4 uses 4.6.7. The remaining v3 consumers require the v3 API, whose newest
publication is 3.25.76. Tracked patches backport the upstream collection-size
fix to that package and the legacy v3 entrypoints still shipped inside 4.6.7.
Seventeen tests exercise installed CommonJS/ESM consumers, early rejection,
async parsing, nested paths, maps, sets and valid transformations. The advisory
policy records that tested remediation with its exact ID, range and severity;
it does not suppress the scanner result or describe a patched v3 publication
that does not exist.

The corrected production advisory review now passes. Version-only findings for
these legacy backports remain visible. Full release verification separately
checks source behavior, native desktop journeys, runtime inventory and a
clean-HEAD packaged app; a successful advisory review alone is not certification.

Primary advisory examples:

- [body-parser compressed-body denial of service](https://github.com/advisories/GHSA-27r3-jxmh-p828)
- [Undici excessive content encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c)
- [TOML array-of-tables parsing](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p)
- [Zod oversized collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
