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
