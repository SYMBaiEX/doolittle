# Repository scripts

Run scripts from the repository root with Nub. The root `package.json` and each
workspace manifest are the authoritative command lists.

- Install and onboarding: `scripts/install.sh`, `scripts/install.ps1`,
  `scripts/bootstrap.ts` and its `bootstrap/` modules; `sandbox-setup.sh`
  prepares the optional container environment.
- Development and verification: `build-cli.ts`, `vitest-scope.ts`, the
  `check-*` scripts, and `sync-doc-truth.ts` support the commands in
  [development and testing](fast-development.md). Acceptance helpers under
  `scripts/acceptance/` support the coding evaluation workflow.
- SDK qualification: `build-eliza-source.ts`, `prepare-eliza-source.ts`, and
  their policy modules maintain the pinned upstream builds. See
  [source qualification](../../tooling/eliza-source/README.md).
- Release and distribution: `create-desktop-release.ts`,
  `run-desktop-packaged-tests.ts`, `publish-provider-packages.ts`,
  `audit-production.ts`, and the desktop workspace's packaging and provenance
  scripts support artifact verification and publication. See the
  [desktop guide](../desktop.md) and [release notes](../releases/v0.1.0.md).

These categories include operational scripts as well as release scripts: local
onboarding, development, testing, and source preparation also depend on them.
The release check is `nub run check:release`; it is a deliberate broad gate,
not a routine edit check. Publishing or packaging requires the credentials and
platform prerequisites described in the relevant guides.
