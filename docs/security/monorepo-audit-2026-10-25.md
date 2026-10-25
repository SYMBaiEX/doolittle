# Workspace audit coverage follow-up — October 25, 2026

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

The corrected scan examined 36 dependency roots against 2,629 lockfile packages.
No critical findings were reported. The existing review policy rejects newly
reported IDs affecting body-parser, Electron, fast-uri, ip-address, markdown-it,
serialize-javascript, TOML, Undici and Zod. Registry version findings and actual
shipped runtime evidence are separate: the packaged runtime inventory/policy
check still runs independently, including existing version-preserving patches.

Consequently, the earlier complete release-gate result is superseded. Runtime,
terminal and native desktop behavior passed, but release certification remains
blocked by unreviewed dependency advisories. No allowlist entries were added to
hide the newly visible findings. Remediation must preserve the exact ElizaOS
beta train and review compatibility before changing transitive major versions.

Primary advisory examples:

- [body-parser compressed-body denial of service](https://github.com/advisories/GHSA-27r3-jxmh-p828)
- [Undici excessive content encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c)
- [TOML array-of-tables parsing](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p)
- [Zod oversized collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
