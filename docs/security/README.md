# Security documentation

For private vulnerability reporting, the supported-version policy, and the
operator hardening checklist, start with [SECURITY.md](../../SECURITY.md).
[CONTRIBUTING.md](../../CONTRIBUTING.md) describes the development workflow.

## Local checks

Run checks appropriate to the change and interpret their results for the exact
checkout and environment tested:

```sh
nub run test:scope tests/boundary/project-access.test.ts
nub run audit:production:critical
nub run audit:production:high
nub run check:runtime-advisory-policy
```

The workspace production audit inspects locked production and optional
dependencies across workspaces, and fails if it cannot obtain a usable report.
The selected severity controls the finding threshold; `critical` does not
establish that lower-severity findings are absent. Runtime advisory policy uses the same workspace production audit and requires
an empty advisory inventory at every severity. Packaged runtime checks are
separate. For a deliberate
release milestone, [development and testing](../engineering/fast-development.md)
describes the broader release checks. An audit result is time-sensitive and is
not proof that the application has no vulnerabilities.

## Historical evidence

The following files retain findings and validation from their named dates and
revisions. Paths, dependency patches, advisory counts, and status claims in
these reports may have changed; none is a live scan or current release status.

- [October 11 CodeQL review](code-scanning/README.md), its linked alert
  snapshots, triage ledgers, and follow-up documents.
- [October 11 remediation report](security_best_practices_report.md).
- [October 25 workspace audit](monorepo-audit-2026-10-25.md) and
  [dependency replacement record](dependency-replacements-2026-10-25.md).

Keep source evidence and scanner snapshots together when updating the archive;
record a new dated assessment instead of rewriting historical counts as current.
