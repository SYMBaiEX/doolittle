# Coding task evaluations

The maintained suite catalog, task prompts, receipt grader, report schema, and
comparison commands live in the `@doolittle/evals` workspace. See
[`packages/evals/README.md`](../../packages/evals/README.md) for operator
commands and privacy details. The checks are intentionally stricter than chat's
terminal status: a run is not a success just because a worker returned, files
changed, or the provider emitted a confident summary.

The frozen first task suite is `coding-harness-v1`; its reference task asks
Doolittle to build and launch a one-page Next.js/shadcn blog with Bun. Run it
through Desktop against a fresh, repeatable project fixture, then join the
explicit run ID to its trajectory events. The evaluation command only reads
telemetry; it does not launch an agent or mutate the target project.

## Cases

| Case | Required evidence |
| --- | --- |
| `coding-change-v1` | Verified implementation/configuration changes in the exact workspace, a parent-shell production build with exit code 0, and a terminal-complete run. |
| `coding-app-handoff-v1` | Everything in `coding-change-v1`, plus a managed-app receipt in `ready` state with an HTTP(S) URL and working directory matching the requested workspace. A `starting` receipt is not ready. |
| `coding-bun-app-handoff-v1` | Everything in `coding-app-handoff-v1`, plus a successful parent-shell `bun install` receipt scoped to the requested workspace (110 points total). |
| `app-start-v1` | A managed-app receipt in `ready` state with an HTTP(S) URL and working directory matching the requested workspace. Use when starting an existing app without requesting code changes. |
| `api-runtime-fix-v1` | Everything in `coding-change-v1`, plus a successful parent-shell HTTP smoke command against a local API route, using fail-on-HTTP-error and returning parseable JSON. |
| `verified-noop-v1` | No mutation required, but a parent-shell production build and terminal-complete run are still required. Use only when the request can be satisfied without edits. |

Workspace paths must be supplied explicitly; never infer the requested target
from the selected project or silently retarget the run. A verified delegated
receipt contributes its full changed-file list even when that worker failed or
was cancelled. Those fingerprints prove file changes, not task completion. A final run summary's shallow
mutation projection is not treated as a complete file manifest.

## How to run against a desktop gateway

Use the live runtime gateway and its trajectory journal. Provide exact run IDs so
receipts from other projects or chats cannot leak into the evaluation:

```sh
nub run eval:coding -- \
  --gateway http://127.0.0.1:64493 \
  --journal "$HOME/Library/Application Support/@doolittle/desktop/runtime/trajectories/trajectory-events.jsonl" \
  --workspace /absolute/path/to/fresh-project-fixture \
  --suite coding-harness-v1 \
  --fixture STARTER_GIT_SHA \
  --task-run nextjs-shadcn-blog=RUN_ID \
  --route-label codex-model-effort
```

The command reads each selected run receipt from `GET /chat/runs/:id` and joins
it to local `action.completed` trajectory records. Explicit IDs prevent
cross-project/chat leakage. Reports are private by default; `nub run
eval:reports` lists them and `nub run eval:compare -- --baseline PATH
--candidate PATH` compares only identical task sets and fixture IDs. An ad hoc
historical run can still be evaluated with `--case coding-change-v1 --run
RUN_ID`, but it cannot be compared until it is mapped to a versioned task suite.
A failed evaluation exits nonzero by design. `nub run test:coding-evals` runs
deterministic fixtures without starting a provider or changing a workspace.

## Evidence dimensions

Automated checks cover target-path containment, source/config mutations (not
just `.sqlite`, `.tsbuildinfo`, or other generated artifacts), parent-owned
build verification from a shell working directory evidenced inside the target
workspace, API HTTP/JSON smoke receipts from that workspace, managed-app
readiness, and whether a terminal-complete run meets its selected case. Failed
build attempts followed by a successful parent build are reported as recovered.
Worker narrative is useful context but is never substituted for a parent build
receipt or a ready app URL. The gateway receipt does not expose the final chat wording,
so response honesty is left to the human conversation review below.

Runtime completion uses the managed server's HTTP readiness receipt, not a
specific launch-script name: `bun run start` can be a valid handoff after a
production build. That receipt must identify a running managed session, its
nonempty launch command, the exact workspace, and a verified local URL. Bun
installation and build requirements remain separate checks. Readiness alone
does not establish rendered quality or functional request coverage.

Evaluator 0.2.9 shares literal command inspection with the runtime. It recognizes
`bun --cwd /absolute/workspace run build` and `bun run --cwd /absolute/workspace
build`, including quoted paths, without inventing a launch directory. A `cd`
changes the following commands' directory; Bun's `--cwd` changes only that Bun
invocation. Flags after a script name are script arguments, not cwd evidence.
Dry runs, filtered workspaces, quoted command text, redirects, pipelines and
failure-masking shell chains are not accepted as install/build proof. Complex
commands can still execute, but do not automatically satisfy this receipt grader.
The native SHELL adapter recovers launch cwd only by matching its SDK run ID,
command and exit status to an actual local terminal-history record.

Parent operations must follow the last coding attempt in that exact workspace,
including failed attempts. Bun installation must precede the passing Bun package
build; a later successful build can recover an earlier ordering/build failure.
App handoff must follow verification and identify a running managed session with
a local credential-free HTTP(S) URL. A later stop or unhealthy observation
invalidates that session's old readiness. Historical reports remain unchanged;
different evaluator versions are not directly score-compatible.

## Disposable-runtime preflight

The root `patchedDependencies` entry applies
`patches/@elizaos+plugin-agent-orchestrator@2.0.3-beta.7.patch` during Nub install.
It corrects the published ESM and CJS health checks without replacing the SDK
service or changing its version: native ACP protocol IDs have no acpx state
files, and a tracked CLI process is not an orphan. Native operation no longer
scans the shared legacy acpx directory. Genuine native transport errors,
restart-orphan errors, CLI file-loss failures and terminal-session cleanup
remain visible. The CJS bundle's two workspace-service imports also resolve
from the installed bundle instead of its embedded build-host path. The
regression test loads both installed SDK bundles without a loader substitute;
retire the patch only after an upstream release passes the same tests. A patch
change is a new harness revision, not directly attributable speed evidence.

The second pinned patch,
`patches/@elizaos+plugin-codex-cli@2.0.3-beta.7.patch`, preserves user image parts
in the official Codex backend's Responses request. It accepts HTTP(S) image
URLs without embedded credentials, supported image data URLs, and PNG/JPEG/
WebP/GIF bytes (with explicit MIME or a recognized signature). Base64 strings
require a supported MIME. It never reads local paths or fetches the image
itself. Unsupported image inputs or non-user image roles fail before provider
authentication and do not echo image data in errors. Text-only grouping,
prompt deduplication, tool correlation, OAuth and SSE remain SDK-owned.
The public-backend regression test uses synthetic auth and fetch to inspect
actual request serialization; that is not proof of model vision or screenshot
capture. Record both SDK patch hashes for comparisons, and retire each patch
only after an upstream release passes its regression coverage. The image wire
format follows the [official image-input guide](https://developers.openai.com/api/docs/guides/images-vision).

### Native rendered evidence

The desktop starts a capture-only Electron bridge and passes its ephemeral
loopback capability to its child runtime. Public `@elizaos/plugin-browser`
workspace helpers open, snapshot and close hidden private windows. Capture is
restricted to ready managed apps under the selected workspace, revalidated
before and after pixel capture. No existing browser profile, arbitrary script,
keyboard/click input, clipboard, connector account or form submission is exposed.
Own-origin read requests and a small HTTPS image/font allowlist are permitted;
other resources are blocked and counted. Do not interpret an incomplete asset
load as the app's intended design.

Before capture, the bridge cooperatively waits up to 1500ms for fonts and
visible image decoding, rediscovers changes among the first 200 image candidates,
and allows 250ms of unchanged image-set settling plus animation frames. This is
a bounded heuristic, not a guarantee that every asset or layout has painted;
individual renderer work cannot be preempted by its own timer. The returned
facts retain those limitations, including the discovery cap. CSS backgrounds,
arbitrarily delayed content and images beyond the cap are not promised complete.

The focused real-Electron first-PNG regression avoids booting a provider or the
full desktop API server:

```sh
nubx playwright test --config playwright.rendered.config.ts
```

The same fixture spec is discovered by the regular E2E suite. It checks owned
complete/async/lazy/late raster images in hidden private windows, not arbitrary
site readiness or interactive accessibility. Retain the actual platform result:
local macOS and hosted Linux are separate checks; Windows coverage is not implied.

`/browser/capture` records real viewport PNGs, hashes and bounded DOM facts when
that capability succeeds. `/browser/analyze` attaches the desktop and available
narrow PNG bytes to the selected model through the shared prompt-cache layer;
it returns `modelEvidence=rendered-pixels`. Text capture remains an explicit
fallback with `captureReady=false`; PNG text cards are never relabeled as
rendered pages. Comparison workflows remain text-based. A viewport critique
does not establish interaction, motion, reduced-motion or full accessibility.

The registered `DOOLITTLE_BROWSER_ANALYZE` action exposes that review to the
coding planner. It requires desktop/CLI owner access and a ready managed origin
in the selected workspace, returns bounded untrusted critique and pixel metadata,
and continues the action chain for scoped corrections. It does not grant page
input, editing, app startup or remote-channel host access. Text-only results must
not be reported as visual verification. The coding completion gate requires a
review attempt after the latest visual mutation, production build and verified
ready-app receipt. Further changes invalidate that review. A review attempt is
not a quality pass: retain its findings and disclose pixels, text-only evidence
or failed/unavailable review. Stop the managed app before rebuilding after a
correction; restart and re-review only when the user permits server startup.
If startup or restart is forbidden, review an already verified ready app when
available; otherwise preserve the changes and disclose that browser review was
unavailable and not attempted, without claiming rendered quality or completion.

Run the isolated synthetic acceptance check with:

```sh
nub scripts/acceptance/rendered-browser-smoke.ts
nub scripts/acceptance/rendered-browser-smoke.ts --live-analysis
nub scripts/acceptance/rendered-browser-smoke.ts --agent-analysis
```

The default check uses no model. The explicit live option uses the configured
linked Codex input with the test's fixed `gpt-6-luna`/`medium` route; it checks
two actual image inputs, one physical provider request, reported usage and
identification of known fixture defects. Internal SDK model dispatch count is
not the physical request count. This is a canary, not a coding benchmark or a
human score. `--agent-analysis` instead invokes the real registered action with
the normal local-owner connection bootstrap, checks coding-planner inclusion,
bounded nonterminal findings and the same real image/provider evidence. It does
not prove the planner chooses the action or corrects a real coding task.
The check retains only bounded diagnostic facts and deletes its exact
private synthetic state after owned children stop; a shutdown failure preserves
state and fails the check. Billable USD remains unavailable. For a coding
evaluation, still freeze the source, accept the real task once, verify the
agent actually uses and responds to rendered feedback, then review the result.

For controlled desktop-owner backend experiments, use the tested
`createEvalRuntimeEnvironment` helper in
[`packages/evals/src/runtime-environment.ts`](../../packages/evals/src/runtime-environment.ts).
It validates canonical environment names with the actual runtime schema and
directory resolver before any provider dispatch. `mode: "api"` binds to loopback
on an ephemeral port; transient data, gateway and hooks each live below the
private experiment root. The SDK's ACP task/session store, audit log, Eliza
account state and PGlite directory are explicitly scoped there too; remote SQL
URL inputs are cleared. Doolittle's directories alone do not isolate SDK state.
Headless CLI evaluations use the same helper. Repository
skills and linked account authentication remain existing configured inputs, not
newly isolated or fabricated credentials.

Before accepting a coding run, verify the fresh fixture's files/hash, configured
provider/model/effort, selected workspace, zero existing accepted runs, and zero
existing SDK delegation tasks/sessions. Confirm
the actual route from the first `model.request` and model-usage capture from the
first completed provider call. Missing capture is unavailable, never zero tokens.

Managed worker receipts expose separate `usage` evidence from exact-session SDK
`usage_update` events, when the provider transport emits them. This is not part
of the 110-point acceptance grade. Deduplication and coverage counters remain
visible, no raw event IDs or labels are copied into the usage receipt, and
missing worker usage or USD remains null. Do not add reasoning/cache counts to
input/output tokens or combine partial parent/worker telemetry into a claimed
whole-workflow bill. The coding report's current metrics still omit worker
usage; retain the bounded receipt summary in private run diagnostics.
Use `message` in `POST /chat/runs`, with explicit run identity, workspace and
desktop source. This exercises desktop-owner backend semantics, not the rendered
desktop UI. An invalid preflight/setup sample is an operational diagnostic, not
a controlled performance comparison. Poll the accepted run ID through transient
observation failures; do not dispatch a replacement just because a poll timed out.
Close only experiment-owned managed apps and the runtime, then preserve private
reports and recoverably remove temporary state.

The following dimensions require a separate human or browser review; do not turn
them into a telemetry-derived score:

- **Request coverage:** every named route, component, interaction, and constraint
  is implemented; unrelated existing work remains intact.
- **Rendered quality:** hierarchy, alignment, spacing, typography, responsive
  behavior, and visual consistency are checked in the actual browser. Apply the
  [frontend quality contract](./frontend-quality-contract.md) to brand direction,
  composition/depth, purposeful motion and human visual-polish review; none is
  inferred from the 110-point receipt grade.
- **Interaction/accessibility:** primary flows work by mouse and keyboard;
  controls have labels, focus states, useful errors, and predictable state.
- **Conversation quality:** progress is coherent and correctly ordered; retry,
  stop, navigation, and concurrent chats preserve run isolation; the final
  response distinguishes verified results from blockers.
- **Maintainability:** changes fit the host project's patterns and remove the
  root cause rather than layering on a workaround.

## Today's comparison protocol

For a regression baseline, select only runs from the intended workspace/session,
apply the same case and target path, and preserve each criterion's evidence.
Compare acceptance pass rate separately from action count, duration, recovery
attempts, and human-reviewed quality. Do not average these into one opaque score.
When a run is missing a telemetry field, mark the criterion unknown/incomplete;
do not infer a pass from the final wording.

## Baseline: 2026-09-23 local session

The selected receipts were all scoped to `/Users/symbiex/dev/austin/test`. The
event journal is written in UTC, so the late-evening local activity appears on
September 24 in the raw timestamps.

| Evaluation set | Result | What the evidence says |
| --- | --- | --- |
| `coding-change-v1` | 0/7 pass; 200/560 points (35.7%) | Five runs had in-scope implementation edits but no successful parent-shell production build. Two attempts stopped before any verified file change because the selected Codex model was unavailable to the installed/account-linked adapter. Median wall time was 150.1s, median first action 24.5s, and median observed actions 2. |
| `api-runtime-fix-v1` | 0/1 pass; 70/100 points | The API route and database source changed in the intended folder and the parent `npm run build` exited 0. A live local API smoke was blocked by a sandbox port-bind denial and was not retried outside that worker; therefore the JSON runtime behavior remains unverified. |
| `app-start-v1` | 0/1 pass; 0/30 points | The run completed after shell activity, but no managed-app `ready` receipt and URL for the selected workspace were recorded. |

Main failure patterns: child-side dependency installation/build failures were not
consistently recovered by the parent turn; complete runs frequently lacked a
parent build receipt; model/adapter compatibility failed before implementation;
and a requested app-start was not represented by a ready managed-server receipt.
The API fix is a partial, build-verified change—not a verified live repair.

The trace also exposed a receipt projection defect: delegated agents returned a
fingerprint-verified list of all changed files, while the run mutation ledger
kept only the first file. Version 1 now expands that complete delegated list
into the run ledger, and its regression test covers the behavior. Past receipts
remain unchanged. The test workspace is not a Git repository, so worktree and
commit behavior was not evaluated. Browser-rendered quality and the final
assistant wording were not gradeable from the retained run receipts and remain
human-review items.
