# Testing

Maintained tests live under `tests/`. Choose coverage for the behavior you
changed; the default suite and native acceptance have separate purposes.

## Boundary tests

```sh
nub run test:scope tests/boundary/project-access.test.ts
nub run test:related packages/agent/src/actions/coding-action.ts
nub run test:watch:scope tests/boundary/workspace-refresh.test.ts
nub run test
```

`test` runs the boundary tests selected by
[`vitest.config.ts`](../vitest.config.ts). `check` uses the same lane.
`test:essential` and `test:release` are compatibility aliases for it.
The scope runner takes direct file filters; no matching tests is a failure.
Related mode follows static imports and cannot establish dynamic registration.

Extend existing behavior journeys for permissions, persistence, cancellation,
ownership, and recovery. Keep tests under `tests/` and avoid assertions that
only mirror source layout or private implementation details.

## Types, lint, and boundaries

```sh
nub run typecheck
nub run lint:check
nub run check:monorepo
nub run check:plugin-boundaries
nub run check:eliza-sdk
nub run check:local-links
```

Typechecks and static checks complement execution tests. They do not prove a
provider round trip, a working desktop interaction, or a valid release artifact.
Run dependency and security checks when their inputs or trust boundaries change.

## Runtime and native desktop acceptance

Prepare Electron and browser fixtures after a scriptless dependency install:

```sh
nub run desktop:runtime:install
nubx playwright install chromium
```

On Linux, `nubx playwright install --with-deps chromium` also installs the
required system libraries. Electron journeys need a graphical session.

```sh
nub run test:integration
nub run test:e2e:desktop-workbench
nub run test:e2e
nub run test:all
```

`test:integration` builds the CLI and sets `DOOLITTLE_RUN_RUNTIME_E2E=1` for
[`vitest.integration.config.ts`](../vitest.integration.config.ts). Its fixtures
exercise real processes, workers, and isolated browser protocols.
`test:e2e:desktop-workbench` builds the CLI and desktop, then runs the native
Electron journeys. `test:e2e` runs both; `test:all` adds the boundary suite.

These fixtures use private temporary profiles and workspaces. They exercise
real ownership and transport behavior with offline model conditions; they do
not measure live-provider quality. A skipped or environment-gated case does
not count as passed coverage.

For reload-supervisor changes, use:

```sh
nub run test:scope tests/boundary/desktop-dev-reload.test.ts
nub run test:dev:desktop
```

The dev journey temporarily edits uniquely tagged fixture content in the
checkout and starts real Electron. Inspect its prerequisites and cleanup behavior
in [`desktop-dev.pw.ts`](../tests/e2e/desktop-dev.pw.ts) before running it.

## Packaged desktop

Commit the verified source before building and testing an automatic repository
package:

```sh
nub run desktop:package:dir
nub run test:e2e:desktop-packaged
```

The packaged runner verifies source revision, artifact provenance, and
`app.asar` identity before launching. It requires an artifact built from clean
HEAD. `DOOLITTLE_DESKTOP_EXECUTABLE` selects an explicit executable when needed;
the release gate clears that override to test its own repository artifact.
A passing package smoke test does not establish installation, signing, or
notarization on every target platform.

## Live coding and evaluations

```sh
nub run test:live:coding
nub run eval:list
```

The live coding command sets `DOOLITTLE_RUN_LIVE_CODING=true`, uses existing
linked Codex authentication, and may consume a subscription or paid model
quota. It is separate from the offline release gate. Traces, screenshots, and
video are disabled for this journey; failed private fixtures may remain for
diagnosis.

Evaluation tools under `packages/evals` compare task evidence and reports.
Follow their [package guide](../packages/evals/README.md) and the
[evaluation guide](evaluations.md). Keep fixture identity, suite/evaluator
versions, route settings, repeated samples, and human review coverage explicit.

## Release gate and reporting

`nub run check:release:static` combines lint, types, boundary tests, builds,
repository/security checks, and runtime preparation/audit. `nub run check:release`
adds native and packaged acceptance. `check:all` aliases the complete release
gate. Use these deliberately at release or integration milestones.

Report exactly which commands ran and their results. Distinguish static checks,
unit/DOM tests, real process or Electron journeys, packaged acceptance, and live
provider execution. Include failures and untested surfaces; a successful build
is not evidence for every product behavior.
