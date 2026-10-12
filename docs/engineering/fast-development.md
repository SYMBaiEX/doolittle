# Fast development

Doolittle's routine loop is scoped behavior feedback. Broad checks and live
runtime evidence remain available, but are deliberate operations rather than a
mandatory restart after every edit. Use Nub, the repository's pinned runner.

## Pick the smallest useful check

```sh
# One changed behavior (file paths also work as Vitest filters):
nub run test:scope packages/agent/src/services/run-controller-service.test.ts

# Existing Vitest dependency selection, no custom change detector:
nub run test:related packages/agent/src/services/process-execution.ts
nub run test:changed --changed=origin/main

# Keep a worker alive while editing one area:
nub run test:watch:scope packages/agent/src/services/run-controller-service.test.ts

# Shared fast safety baseline:
nub run test
nub run check
```

`test:scope`, `test:related`, and `test:watch:scope` require a path/filter. A tiny
argument guard rejects missing filters and literal `--` before Vitest starts;
Nub forwards `--` to Vitest, which can hide subsequent file filters. Do not put
`--` between these script names and paths. `test:watch` without a filter watches
only the eight essentials. `test:related` follows static imports, not dynamic service,
plugin, or IPC registration. Pick an explicit behavioral test for those edges.
No matching tests is a failed check; do not hide missing coverage with
`--passWithNoTests`. A changed-test selection is evidence for that selection,
not the entire product.

Desktop tests reuse the root aliases and run from the repository root, so their
runtime imports and file-based fixtures resolve consistently:

```sh
nub run desktop:test apps/desktop/src/main/execution-admission.test.ts
# Desktop watch/related commands can be run in apps/desktop with root-relative paths:
nub run --cwd apps/desktop test:watch apps/desktop/src/main/execution-admission.test.ts
```

For the [shared agent engine](shared-agent-engine.md), opt into the two-bot
offline SDK boundary (real workers, no paid provider call) with:

```sh
nub run build
DOOLITTLE_SHARED_ENGINE_E2E=1 nub run test:scope apps/desktop/src/main/shared-engine.e2e.test.ts
```

The source test launches the built `dist/index.js` for both the lead and its
worker threads, so rebuild after runtime changes. To exercise the staged macOS
app runtime under Electron's embedded Node instead, prepare a fresh directory
package and select the fixed repo-owned artifact:

```sh
nub run desktop:package:dir
DOOLITTLE_SHARED_ENGINE_E2E=1 DOOLITTLE_SHARED_ENGINE_E2E_TARGET=packaged nub run test:scope apps/desktop/src/main/shared-engine.e2e.test.ts
```

Packaged mode requires `apps/desktop/release/mac-arm64/Doolittle.app/Contents/Resources/runtime`.
Without the opt-in, the E2E is skipped; it does not load 50 SDK runtimes.

## Essential behavior coverage

The exact eight-file list lives in `vitest.essential.config.ts`. It intentionally
tests behavior and includes:

| Boundary | Coverage |
| --- | --- |
| Routed process execution | argv/environment propagation, abort before start, local and Windows cancellation, observable cancellation failure |
| Turn ownership | one owner per session/workspace, targeted and emergency cancellation, no abort after completion |
| Durable run state | terminal receipts after restart, honest interruption errors, monotonic journal with one terminal event |
| Execution permissions | approval consumption, denial, expiry, owner/workspace checks before backend selection |
| Transcript integrity | stable terminal anchors, ordered pagination, rollback on insertion failure, search-index consistency |
| Filesystem/mutation scope | containment, shared mutation seats, overlap rejection and lease release |

Four isolated workers bound process/transform pressure. Isolation and normal
timeouts remain enabled; the fast path does not share global mocks across files
or mask failures. Add regression tests alongside changed behavior, even when
they are not part of this curated baseline.

The first measured default run passed 8 files / 56 tests: 592 ms reported by
Vitest, 1.23 s wall-clock (`/usr/bin/time -p nub run test`) on the local macOS
Nub-managed Node 26.5.0 workspace (verified with a preload of the actual `nubx`
Vitest process; the shell's unrelated Node 26.10.0 is not the test runtime).
This is one local measurement, not a CI or full-suite benchmark. The
no-matching-scope failure probe exited 1 without executing tests.

## Release gate and deliberate broad checks

```sh
nub run check:release:static     # dirty-worktree-friendly preflight; no live E2E
nub run check:release            # static gate, then serial source/workbench/packaged E2E
nub run test:all                 # all repository Vitest sources, once
nub run check:all                # lint, types, all tests, agent build
nub run test:integration         # discovers integration files; opt-ins still apply
nub run test:integration:workers # real isolated offline worker processes
nub run test:sandbox:integration # real Docker sandbox (requires sandbox:setup)
nub run test:e2e                 # desktop build + real Electron/Playwright smoke
```

`test:release` uses the explicit 22-file `vitest.release.config.ts` selection:
the eight essentials plus bot character/profile, process registry, session
routing, host RPC on both sides, server auth, and the agent/desktop knowledge
broker pair. Five renderer/workflow regression files also cover scoped approval
decisions and stale feedback, partial worker-inventory failure and conflicting
owners, hydration readiness after scope changes and retry, named-bot workspace
routing and claim recovery, and negative workflow-security cases.
`check:release:static` runs lint, application/desktop types, those tests, the
agent build, acceptance/security gates, runtime advisory policy, and runtime
preparation/audit. It can be run while source is uncommitted; it is not a
release-ready result by itself.

`check:release` then rebuilds and opts into the source shared-engine worker
E2E, builds and runs the native Electron workbench Playwright suite, builds a
host directory package, and runs packaged-app Playwright acceptance. These
stages are serial and fail closed; no skipped integration test is counted as
native evidence.
The packaged path requires a clean, committed worktree and a package manifest
matching the current HEAD and app artifact. Commit the verified source before
running the complete gate. For a pre-commit edit, run `check:release:static`
and report the native gate as pending, not passed. The package stage does not
install, publish, or deploy an app, and does not certify notarization.

`test:all` includes the desktop and eval unit tests but is no longer an implicit
release prerequisite; `check:all` preserves the full local suite on demand.
Integration files retain their existing environment opt-ins, so a skipped test
is not a live pass. Coding/headless eval and harness commands (`eval:*`,
`test:*-evals`, `test:*-harness`, `check:alpha`)
remain separate and unchanged. Actual provider or platform capability needs
live evidence, not a successful mock or source assertion.

On PRs and pushes, CI's lightweight `validate` job runs lint,
application/desktop types, the 22 release-critical test files, the agent
build, and acceptance gates. A separate `native_acceptance` job then runs the
opted-in shared-engine source worker test, the real Electron new-chat and run
lifecycle journeys, and a clean-HEAD Linux directory package's named-bot
first-message and preload/offline-chat cases under Xvfb. The package runner
checks artifact provenance; a skipped suite cannot satisfy the job. Manual
CI's `full_validation` input substitutes `test:all` for the curated unit
selection and additionally runs the Docker sandbox setup and broad Playwright
smoke as diagnostics; the separate native acceptance job still runs.
The full local `check:release` additionally covers the wider workbench
navigation and packaged profile suites. Platform packaging and publication
workflows are unchanged. Cancelled obsolete CI runs do not promote or publish
anything.

## Baseline and limits

At the October 2026 workflow audit, source inventory contained 1,049 test/spec
files: 558 agent, 365 desktop, 66 scripts, 20 evals, and 40 across other packages
and E2E helpers. The old unfiltered default discovered that entire tree, and
the former `check:release` then discovered desktop files again. These are file counts,
not executed-test counts or full-suite duration measurements.

Repeated cold Vitest processes transform imports, initialize fixtures/mocks,
and discover a large dependency graph; desktop scripts and eval harness imports
also expand that graph. Those are configuration-derived cost drivers, not a
claim that every test is slow. Large shared source files can still make related
selection expensive. Prefer a direct file run when the responsible behavior is
known. Do not replace this with another verification framework.

When a check fails, retain its nonzero exit status and narrow to the failing
file. Confirm its normal path, one failure case, and recovery/rollback case.
After configuration changes, verify selection before executing broad checks:
`nubx vitest list --config vitest.essential.config.ts --filesOnly` or
`nubx vitest list --config vitest.release.config.ts --filesOnly`.
Report the commands, timing, failures/skips, and remaining live boundaries.
To recover the previous breadth, use `test:all` or `check:all`; no test source
has been removed by this workflow change.
