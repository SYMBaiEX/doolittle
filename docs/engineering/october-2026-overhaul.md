# October 2026 lean overhaul

## Architecture assessment

Retain the installed ElizaOS message service as the execution owner. Doolittle
owns product-level session identity, permissions, cancellation, receipts and
presentation, not a second agent loop. The current risk is overlapping planner
completion and outer continuation budgets, plus a verification lane that mixes
unit behavior, source-text assertions, integration fixtures and evaluations.

The interface already has a coherent warm-neutral messenger direction. Extend
its shared surfaces with purposeful liquid motion, preserving readable text,
resource ownership, reduced motion and interruptibility.

## Implementation DAG

| Task                                              | Owner / files                                                                          | Depends on                               | Output / small completion check                                    | State                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| A: architecture + bounded primary-source research | harness_architecture; harness decision doc, planner advertisement, core security patch | Existing source / prior research         | Concrete SDK-boundary choices with sources                         | Complete                                         |
| B: shared runtime foundations                     | runtime_harness; runtime + native execution/plugin context                             | A findings, D dogfood feedback           | Execution/context improvements; focused regressions                | Complete                                         |
| C: fast development loop                          | developer_workflow; scripts/config/CI/AGENTS, provider readiness, lock metadata        | Current test inventory                   | Related/watch + essential checks; one timed run                    | Complete                                         |
| D: real product dogfood                           | integration owner; existing CLI/API                                                    | Existing runnable product, then B        | Bounded repository tasks with actual receipts                      | Complete; external launcher limit recorded below |
| E: safe debloat                                   | repository_debloat; unused sources/docs/tests outside B/F                              | C retained-check list; traced references | Recoverable deletions with concise inventory                       | Complete                                         |
| F: crafted liquid interface                       | liquid_product_ui; UI package + desktop renderer                                       | Existing interface design                | Reusable motion/materials; focused UI check                        | Complete; native visual spot-check passed        |
| G: integration + local release                    | integration owner; release/build artifacts                                             | B, C, E, F                               | One integration milestone, committed runnable build, local install | Complete; local macOS delivery                   |

A feeds B; C feeds E; D feeds B. B, C, E and F converge at G. Owners share a
checkout with disjoint edit boundaries; conflicting ownership must be resolved
before edits. Isolated worktrees are reserved for actual overlapping changes.
Do not repeatedly run unchanged checks at handoff. No generated release output
or credentials are committed.

## Delivery record

### Architecture and cleanup

The ElizaOS message service remains the execution owner. A shared request-local
tool budget now spans outer native passes and nested settings scopes; public SDK
planner limits and compaction receive the selected model context policy. Native
limit refusal is distinguishable from provider unavailability. Canonical tool
advertisement removes only proved identical aliases, with an explicit rollback
flag and unchanged SDK tool admission. CLI completion now follows the owned
terminal receipt, and shutdown cancellation reaches one-shot execution.

Optional Ollama embedding handlers are omitted when startup readiness fails,
leaving the SDK embedding queue disabled instead of repeatedly queuing doomed
requests. Text handlers remain available; restart is required after restoring
Ollama. This does not change mid-run outage recovery.

Cleanup removed 27 obsolete source/test files and reduced one brittle CSS
assertion, for 2,809 net removed lines in that cleanup scope. Active behavior,
accessibility, persistence, fixture and permission checks remain. Reference
tracing found no residual relative imports across 3,223 tracked source files.
See [cleanup inventory](october-2026-cleanup.md) and the bounded primary-source
[harness choices](october-2026-harness-decisions.md), covering OpenCode, Codex,
Claude Code, Gemini CLI, OpenHands and Aider.

The orchestration skill informed disjoint ownership and the DAG. Animation
guidance informed reusable, interruptible movement with accessible fallbacks,
not a separate workflow or animation dependency. All work converged in this
checkout; no additional worktrees or disconnected implementation branches were
created. Source removals remain recoverable through Git. User state and
credentials were not removed or committed.

### Fast feedback and integration evidence

`test` and `check` now select eight essential behavior files. The measured first
run passed 56 tests in 592 ms Vitest time / 1.23 s wall time. Direct, related and
persistent scoped commands are available; full Vitest, Electron, Docker and
evaluation lanes remain deliberate opt-ins. Routine CI and repository guidance
use that split. See [fast development](fast-development.md) for exact commands,
coverage and measurement caveats.

During dogfood follow-up, a literal `--` forwarded by Nub unexpectedly bypassed
Vitest's path filter and started broad discovery. That process was stopped,
not treated as a full-suite result. The scoped commands now reject that argument
and missing filters before spawning Vitest. No unchanged suite was rerun to
certify this delivery.

Integration evidence before packaging: application/UI/desktop typechecks,
scoped runtime and CLI regressions, 96 selected UI tests, Biome, the agent build,
desktop build and renderer bundle budget passed. Nine existing Biome suppression
warnings remain. Repository hygiene, workflow security, plugin boundaries, SDK
alignment, documentation truth, local links and dependency reachability passed.
The final critical audit exposed Handlebars 4.7.9 in the SDK; the dependency is
pinned to 4.7.10 and the pinned SDK patch routes bundled rendering to that fixed
external dependency. Both forward application to the pristine published package
and reverse application to installed bundles were checked. Six actual SDK
compiler calls across node/browser/edge used that external dependency. The
critical production audit then passed, and a copied-workspace frozen/offline
lockfile check left the lock byte-identical without resolving unrelated packages.
A final narrow CLI review found and fixed JSON success during resolved
cancellation; both changed files passed ten checks in 97 ms Vitest time. This
is not a claim that every test, live platform or long-session path has been
exercised.

### Work performed through Doolittle

These were real source-CLI/provider runs against this repository, not fixtures
or tasks performed solely by the surrounding development agents:

| Useful task                                                            | Actual result                                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect the one-shot prompt command and identify a correctness problem | After fixing false mutation intent, one `READ_FILE` completed the task in 9.1 s and identified cancellation reporting as successful completion.           |
| Implement a cancellation regression with Doolittle's own tools         | `READ_FILE` and `PATCH_FILE` added the resolved-cancellation test to `prompt-command.test.ts` in 19.2 s. Doolittle honestly said it had not run the test. |
| Run that regression using the product's shell tool                     | One `SHELL` action ran the scoped command; all seven tests in that file passed, with a successful receipt in 6.2 s.                                       |

Earlier dogfood also exposed twelve repeated reads for a read-only request and
failed execution being presented as completed by the CLI. Those findings drove
the mutation-intent and terminal-status fixes. The main runtime, cleanup,
workflow and UI overhaul was implemented by the surrounding development agents;
it was not wholly authored by Doolittle.

### UI and remaining limits

Shared floating materials and liquid/bubble motion now cover the composer,
menus, dialogs, inspector, loading and conversation surfaces. The composer moves
between welcome and dock positions without remounting or scaling text. Closing
surfaces become inert immediately; reopening cancels dismissal. Reduced motion,
reduced transparency, forced colors, zero-motion themes and narrow layouts have
explicit fallbacks. Live frame-rate and VoiceOver certification remain outside
this scoped delivery.

The next highest-value harness task is external coding-agent launch diagnostics.
One real `TASKS_SPAWN_AGENT` failed in 467 ms before a child became ready, with
`CODING_AGENT_LAUNCH_FAILED`, no observed child tools and no user-file mutation.
Retained evidence does not establish whether authentication, adapter arguments
or another startup condition caused it. Failure is now reported truthfully;
external delegation is not certified working. The large outer completion tree
still merits extraction, and live long-session compaction, mid-run embedding
outage recovery, Windows/Linux packaging and assistive-technology review remain
unverified.

### Local delivery

Implementation commit: `be630e873e73ac44c19caa71acae6eebf1dd01e8`, on
`sym/october-2026-lean-overhaul`. This record is updated after delivery without
changing the packaged implementation.

The clean committed source produced a verified macOS arm64 directory package.
The agent build, desktop main/preload/renderer build, renderer budget and embedded
runtime preparation passed. Package verification reported a 29.6 MiB app archive,
16 packaged modules, 474 complete artifact dependencies and four native runtime
packages. The standard transactional local installer completed with ad-hoc
signing, not a notarized public release.

Installed location: `/Applications/Doolittle.app`. Built and installed
`app.asar` SHA-256 both equal
`333ad4b352f24266f9c82907565ab408e9b9aee65fdc506db2e10081a842e8b3`.
`codesign --verify --deep --strict` passed. The previous app was copied to
`/Users/symbiex/.local/state/doolittle/local-install/october-2026-czZNaj/Doolittle-before-overhaul.app`
before replacement, independently of the installer's temporary rollback copy.

The installed native app launched and reached Ready. Native UI inspection
confirmed the centered new-chat composer, readable existing conversation bubbles,
inspector open/close, floating project menu and Escape dismissal. A real installed
chat turn returned the requested short response and reached Complete; the
composer then docked at the bottom. The app is left open for hands-on use. This
is a native macOS spot-check, not an animation frame-rate, VoiceOver,
cross-platform or full-suite certification.
