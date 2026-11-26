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
Electron journeys. `test:e2e` runs both lanes with one build of each app.
`test:all` starts with the boundary suite.

These fixtures use private temporary profiles and workspaces. They exercise
real ownership and transport behavior with offline model conditions; they do
not measure live-provider quality. A skipped or environment-gated case does
not count as passed coverage.

## Privileged and external actions

| Area               | Local acceptance                                                                                                                                                                                                      | Live verification                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Connectors         | Signed and authenticated fixture events travel through routing, delivery adapters, and durable receipts for Telegram, Discord, Slack, WhatsApp, Signal, Matrix, email, SMS, Mattermost, Home Assistant, and DingTalk. | Each deployment still needs an account, matching permissions, and a controlled recipient.               |
| Wallet             | Disposable EVM and Solana chains verify approvals, cancellation, signed transfers, amount, and receipts. Swap simulation uses a stub quote and a real local RPC.                                                      | Live swaps, bridge settlement, and exchange or wallet accounts need their respective test environments. |
| Automation         | Native Desktop verifies schedule edits, pause and resume, loopback HTTP delivery, trace retention, deletion, and approval for named bot jobs.                                                                         | External delivery requires a configured endpoint or account.                                            |
| Privileged actions | Native Desktop verifies project grants and Git confirmation. Real workers verify scoped writes and staging, including denied read-only and cross-chat attempts.                                                       | Device-specific permission dialogs and hosted execution depend on each environment.                     |

The wallet tests require `anvil` and `solana-test-validator` on `PATH`. They
generate disposable signers and use loopback RPC endpoints.

```sh
nub run test:scope tests/boundary/gateway-connector-delivery.test.ts tests/boundary/execution-approval-flow.test.ts
DOOLITTLE_WALLET_LOCALNET=1 nubx vitest run --config vitest.integration.config.ts tests/integration/wallet-localnets.e2e.test.ts
```

For reload-supervisor changes, use:

```sh
nub run test:scope tests/boundary/desktop-dev-reload.test.ts
nub run test:dev:desktop
```

The dev journey temporarily edits uniquely tagged fixture content in the
checkout and starts real Electron. Inspect its prerequisites and cleanup behavior
in [`desktop-dev.pw.ts`](../tests/e2e/desktop-dev.pw.ts) before running it.

## Populated dev profile for visual audits

The offline dev profile starts empty, which leaves automations, review,
activity, sessions, and media surfaces unaudited. To populate the dev profile
with rich fixture content (long scrollbacks, markdown edge cases, mixed
automation states, review comments, execution approvals, and log lines):

```sh
DOOLITTLE_OFFLINE_BOOTSTRAP=true nub run desktop:dev -- --remote-debugging-port=9223
node scripts/seed-visual-audit.mjs            # in a second shell
```

The seeder discovers the backend URL over CDP (or accepts `--api URL`), seeds
through the HTTP API and the runtime filesystem, and prints a verification pass
at the end. It is dev-only — it refuses profiles outside `desktop-dev` unless
`--force` is passed. Reruns skip existing entities where the API allows;
`--clean` best-effort deletes seeded automations first. See the header of
[`seed-visual-audit.mjs`](../scripts/seed-visual-audit.mjs) for exactly what is
and is not idempotent.

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

### Desktop startup benchmarks

```sh
nub scripts/benchmark-desktop-boot.ts --runs 5 /path/to/baseline /path/to/candidate
nub scripts/benchmark-desktop-boot.ts --runs 5 --profile both /path/to/baseline /path/to/candidate
```

Pass packaged executables or built source checkout directories for a comparison.
With no targets, the benchmark uses the current build. It alternates target order
and uses private offline profiles. The default measures fresh profiles.
`--profile reopened` (also `--warm`) measures the second launch of each profile,
and `--profile both` reports both launches separately.

Compare the median and range for the visible workbench, verified worker API,
Eliza core, and completed runtime hydration. The benchmark listens for the API
readiness event and records when an initial snapshot already showed readiness.
Eliza milestones use timestamps from `/runtime/status` so the polling interval
doesn't count toward boot time. Run on the same host with comparable signing and
build settings. Filesystem caches stay warm between launches, and provider
response latency is outside this benchmark.
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

To test the installed desktop without rebuilding it:

```sh
DOOLITTLE_RUN_LIVE_CODING=true \
DOOLITTLE_DESKTOP_EXECUTABLE=/Applications/Doolittle.app/Contents/MacOS/Doolittle \
nubx playwright test --config playwright.live.config.ts --grep 'desktop chat repairs'
```

This uses **This computer** to open a temporary copy of committed Doolittle
sources, checks that the agent runs the scoped test successfully, and reruns
the tests independently. Set `DOOLITTLE_LIVE_CODEX_MODEL` to select a different
linked Codex model.

The installed multi-file journey uses a caller-prepared clone with dependencies
installed. Use an absolute, canonical `doolittle-fresh-workspace-*` directory
under the system temporary directory. The clone must match this checkout's
committed HEAD and have a clean working tree, zero remotes, and no local
environment files. The clone remains available for inspecting the edits.

```sh
DOOLITTLE_RUN_LIVE_CODING=true \
DOOLITTLE_LIVE_CODEX_MODEL=gpt-6.2-sol \
DOOLITTLE_DESKTOP_EXECUTABLE=/Applications/Doolittle.app/Contents/MacOS/Doolittle \
DOOLITTLE_LIVE_CODING_WORKSPACE="$scratch" \
nubx playwright test --config playwright.live.config.ts --grep 'desktop cleans up multiple'
```

One chat uses **This computer** to edit three renderer test files and run the
stock `nub run test` command through ElizaOS's terminal action. The verifier
checks the local command receipt, confirms the test bodies were preserved,
reruns the suite independently, and records peak PGlite and WAL allocation
while the desktop is active. It uses the installed app's default command
timeout.

Evaluation tools under `packages/evals` compare task evidence and reports.
Follow their [package guide](../packages/evals/README.md) and the
[evaluation guide](evaluations.md). Keep fixture identity, suite/evaluator
versions, route settings, repeated samples, and human review coverage explicit.

## Release gate and reporting

`nub run check:release:static` combines lint, types, builds,
repository/security checks, and runtime preparation/audit. `nub run check:release`
adds boundary tests, reuses those app builds for source and native desktop
acceptance, then builds and tests a clean-HEAD package. `check:all` aliases the
complete release gate. Use these at release or integration milestones.

Report exactly which commands ran and their results. Distinguish static checks,
unit/DOM tests, real process or Electron journeys, packaged acceptance, and live
provider execution. Include failures and untested surfaces; a successful build
is not evidence for every product behavior.

### Reclaim space in a local ElizaOS profile

Quit Doolittle and any CLI workers using the profile, then pass the absolute
PGlite directory to the operator utility:

```sh
nub scripts/compact-local-pglite.ts "/absolute/path/to/runtime/pglite"
```

It fingerprints the trajectory rows, compacts only the trajectory tables on a
staged copy, then reopens and verifies the copy before replacing the database.
It prints the original cluster's rollback path. Keep that copy until the app
reopens its conversations and memory. Rewriting takes extra disk space.

An interrupted transaction leaves a sibling `.repair-in-progress` directory.
Keep all runtimes stopped. If it contains `original`, move any cluster at the
normal path aside, then move `original` back to that path. Move the repair
directory aside after verifying the normal path contains the intended cluster.
