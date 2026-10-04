# Doolittle evaluation suites

`@doolittle/evals` owns versioned task suites, deterministic receipt graders,
private reports, and strict baseline comparisons. It is a development workspace;
the desktop runtime does not depend on it.

## Start here

```sh
nub run eval:list
nub run test:coding-evals
nub run test:headless-evals
```

The first frozen suite, `coding-harness-v1`, contains a Next.js + shadcn + Bun
build-and-launch task. Run that prompt through Doolittle Desktop, then evaluate
its run receipt and trajectory events:

```sh
nub run eval:coding -- \
  --gateway http://127.0.0.1:PORT \
  --journal "$HOME/Library/Application Support/@doolittle/desktop/runtime/trajectories/trajectory-events.jsonl" \
  --workspace /absolute/path/to/a-fresh-fixture \
  --suite coding-harness-v1 \
  --fixture STARTER_GIT_SHA \
  --task-run nextjs-shadcn-blog=RUN_ID \
  --route-label codex-model-effort
```

Use a fresh workspace reset to the same starter revision for every comparison.
The `--fixture` value is an operator-supplied immutable ID for that starting
tree (normally its Git commit SHA). Never point the evaluation at an unrelated
workspace: the evaluator reads receipts, it does not dispatch the task.

Reports are written with owner-only permissions under
`${XDG_STATE_HOME:-~/.local/state}/doolittle/evals` by default. Set
`DOOLITTLE_EVAL_HOME` or pass `--report-dir` to choose another directory. List
reports with `nub run eval:reports`; compare two reports with:

```sh
nub run eval:compare -- --baseline /path/to/baseline.json --candidate /path/to/candidate.json
```

Comparison refuses reports with different suite versions, fixture IDs, task
sets, acceptance cases, or task IDs. Quality pass rate and normalized score are
shown separately from wall time, first-action latency, action count, and build
recoveries. Route labels describe the configuration; a score delta does not by
itself prove that a model or effort change caused it.

Reports contain run IDs, task IDs, check outcomes, summary metrics, and SHA-256
digests of workspace identity and evidence. They do not copy prompts, model
responses, tool output, shell commands, or absolute workspace paths. Treat run
IDs and local trace journals as private operational data.

Human quality ratings can be recorded separately from a scored report with
`nub run eval:review -- --report REPORT.json --input RATINGS.json --out REVIEW.json`.
Verify an existing sidecar with `nub run eval:review -- --verify REVIEW.json --report REPORT.json`.
The input requires explicit human attestation and six anchored 1–5 ratings per
task; coding reports also require exact run IDs. See the
[human-review evidence contract](../../docs/engineering/human-review-evidence.md)
for the JSON format, critical-failure codes, privacy rules, and supported
report schemas. A sidecar is not an automatic score or a quality conclusion.

## Versioning and grading boundaries

- Do not change a published suite's prompt, task IDs, or acceptance intent in
  place. Add a new suite version so previous reports remain interpretable.
- Bump the eval manifest's `evaluatorVersion` when grading, timing, or execution
  lifecycle behavior changes;
  keep its workspace `version` aligned with the root product version.
  Comparisons reject reports produced by different evaluator versions. Bump
  the report schema only when the persisted report shape or meaning changes.
- Keep deterministic telemetry checks in code; add a new `CodingEvalCase` only
  when the receipt contract can support it and its failure behavior has tests.
- Browser-rendered quality, request coverage, accessibility, conversation
  coherence, and final-response honesty are human-review dimensions. Record
  them separately; the gateway receipts do not prove them.
- `--case` with explicit `--run` IDs remains available for one-off historical
  analysis. Those ad hoc reports are intentionally not eligible for comparison.
- The coding receipt grader never calls a provider or mutates the target
  workspace. The separately named headless runner below intentionally dispatches
  one-shot tasks into disposable workspaces.

## Headless workflow evaluations

### Representative baseline

`headless-representative-v3` is a separate suite (canonical ID
`headless-representative`, version 3), not a rewrite of the historical workflow
suites. It broadens coverage to project continuity over three turns, a seeded
multi-file regression repair, conflicting local research sources, a contained
fallback artifact, and the unchanged original SDK web-source task. Every task
requires actual human review; the suite name does not establish general agent
quality.

The full suite defines **5 tasks, 7 planned CLI turns and 18 deterministic
checks**, with human review required for all 5 tasks. Failed execution can stop
follow-up turns; report actual invocation counts separately:

| Task ID | CLI turns | Check IDs |
| --- | --- | --- |
| `conversation-project-handoff-v2` | 3 | `complete-three-turn-exchange`, `retains-constraints-and-corrected-facts`, `no-recorded-actions` |
| `coding-seeded-invoice-regression-v1` | 1 | `fixture-scope-preserved`, `preserved-regression-passes`, `final-contract-unattested` |
| `research-local-reconciliation-v2` | 1 | `fixture-scope-preserved`, `reconciliation-artifact-exact`, `final-contract-unattested` |
| `reliability-local-fallback-v1` | 1 | `fixture-scope-preserved`, `fallback-status-artifact-exact`, `recorded-action-started`, `final-artifact-contract` |
| `research-codex-web-search-options-v1` | 1 | `original-search-returned-data`, `original-primary-source-retrieved`, `literal-answer-agrees-with-retrieval`, `citation-agrees-with-retrieval`, `original-execution-integrity` |

```sh
nub run eval:headless -- --suite headless-representative-v3
nub run eval:headless -- --suite headless-representative-v3 \
  --task coding-seeded-invoice-regression-v1
```

Do not enable configured Cloud research for the full suite: its SDK-web task
uses the original `WEB_SEARCH`/`WEB_FETCH` protocol and refuses that opt-in.
The local tasks use synthetic fixtures, not private project or research data.
Default reports still omit raw prompts, responses, commands and workspace paths.

Deterministic code behavior is grader-executed evidence, not proof that the
agent ran verification. Local citation/content and artifact checks do not attest
tool chronology or an original failure-and-recovery sequence. A positive
recorded-action count is only a proxy, not proof of a particular action. The
SDK task proves its bounded one-source contract, not broad current-web research.
Keep these limits separate from full trajectory/artifact human review.

`final-contract-unattested` requires the coding reply's
`agentVerification: "UNATTESTED"` or local research reply's
`readProof: "UNATTESTED"`, respectively. These explicit response fields are not
execution receipts. Coding also requires a nonempty summary and limitations
(each at most 500 characters). Local research returns the complete reconciled
claims, dates, three quotes and unknown fact plus `readProof`, matching its
artifact. Fallback returns the complete status fields plus `artifact`, not a
tiny receipt-only answer. Seeded tasks use closed code-defined fixtures; scope
checks preserve the protected inputs and identity files and allow only the task's
named writable file. Coding behavior is evaluated from the preserved test graph
in a bounded Node VM subprocess with permissions enabled, not by trusting a
replacement test file. This grader containment is not an OS sandbox or proof of
the agent's own tests or global side-effect safety.

The preserved `headless-representative-v1` conversation prompt did not specify
the exact `project` and `rollbackTrigger` strings required by its strict oracle.
Two source-frozen conversation pilots at `2acdcc6` each recorded 2/3 checks:
completion and no recorded actions passed, while semantic string variants
failed exact equality. Preserve those original grades; this is an underspecified
benchmark contract, not a demonstrated agent-quality defect. Version 2 specifies
the exact literals and keeps strict grading; the other four tasks are reused
unchanged. Do not pool v1 and v2, or retroactively rescore captured v1 answers.

The full-cohort preflight found the analogous local-research ambiguity before
launch: its v1 task allowed an unknown date as a string or null and any phrase
naming the unavailable fact, while the strict oracle required `null` and
`"pilot start date"`. Version 3 adds `research-local-reconciliation-v2` with
those literal constraints explicit in both artifact and reply. Its checks
remain strict; the other four v2 task objects and both earlier suites remain
unchanged. No v1 research grade is retrospectively changed. A new source-frozen
cohort is required; do not pool across suite or task versions.

The two conversation pilots took 17.6s and 19.8s launcher wall time for three
turns each. Provider-reported totals were 9,157 and 9,159 tokens; USD cost and
effective/worker routes were unavailable. These are descriptive baseline
observations, not a speed, overhead, billing or quality improvement. The short
blinded final-response review is awaiting actual human ratings; complete
trajectory review and the full five-task live cohort remain pending.

Evaluator 0.2.15 requires a new source-frozen baseline; do not compare or pool it
with 0.2.14 or earlier reports. Freeze source and executable identities before
dispatch, predeclare repetitions and limits, and retain failures. No v3 live
runs or human ratings are established by adding the suite or by green unit/UI
tests. Quality, cost and speed improvements require compatible paired repeats
and the corresponding human and measurement evidence. See the checklist's
[source-frozen baseline protocol](../../docs/engineering/agent-quality-eval-checklist.md#source-frozen-baseline-protocol),
including the limits of short blinded final-response-only review.

### Optional synthetic final-response capture

```sh
nub run eval:headless -- --suite headless-representative-v3 \
  --capture-synthetic-responses --report-dir /private/eval-evidence
```

`--capture-synthetic-responses` is an explicit default-off review option and
cannot be combined with `--show-responses`. It uses the integrated
`runSyntheticReviewEval` wrapper to observe actual responses silently and bind
the capture to that original runner return after closure. CLI output contains
capture status/path metadata, never capture contents. Task selection and other
configuration flags retain their existing meaning.

The separate privileged `*.responses.json` sidecar intentionally contains
bounded final responses from code-defined public synthetic tasks: at most
8 KiB of UTF-8 response bytes per turn and 64 KiB total, excluding JSON framing,
with all declared turns matched to the exact report hash. It is exclusively
created with mode `0600` in private storage. Prompts,
tool logs and credentials are not intentionally retained, but unexpected secrets
in an answer are **not sanitized**. Keep the capture private; it is not an
ordinary content-free report, automatically blinded review, human rating or
tool chronology. Unsafe, incomplete, oversized or conflicting capture evidence
is refused and cleared without changing objective grades; runner errors discard
the capture. Completed executions with failed objective checks remain eligible
for review capture. Do not recover historical discarded answers to fill missing data.

Capture adds the `synthetic-review-capture-v1` execution override, so capture
and default runs are incompatible for pooling/comparison. The low-level capture
factory binds content to a report, not a unique invocation; use the integrated
wrapper for direct association with the original returned run. The private
storage boundary assumes trusted same-UID writers and quiescent owned paths,
not tamper-proof provenance. See
[human-review evidence](../../docs/engineering/human-review-evidence.md#synthetic-final-response-capture)
for review coverage limits and the separate ratings format.

### Historical workflow suites

`headless-workflows-v2` dispatches isolated Doolittle CLI runs without opening
the desktop app. It covers clarification and response formatting, workspace
file mutation, cited research, and draft-only behavior. `headless-workflows-v3`
preserves those cases and adds a two-turn session-memory check, behaviorally
graded code generation, and a no-side-effect reliability check:

```sh
nub run eval:headless -- --show-responses --enable-configured-cloud-research
nub run eval:headless -- --task coding-exact-file-v2 --route-label codex-gpt6-luna-medium
nub run eval:headless -- --suite headless-workflows-v3 --task reliability-no-side-effect-v3
```

`headless-workflows-v4` preserves the v3 tasks, versions their IDs, and corrects
the coding workspace check to ignore only regular `AGENTS.md` and `CLAUDE.md`
ACP identity files. Other extra files or directories still fail the check. Use
it for new coding reliability samples:

```sh
nub run eval:headless -- --suite headless-workflows-v4 --task coding-function-behavior-v4
```

`headless-workflows-v5` preserves v4 and adds an explicit trajectory check that
the no-side-effect reliability task started no agent actions. Missing or
malformed action telemetry fails the check instead of being treated as zero.
This detects recorded action use; it does not identify the action or prove
that it caused a workspace side effect.

`headless-workflows-v6` keeps the v5 prompts and zero-action contract, but
separates the no-change statement from the two-step plan structure. The v5
combined check required the literal word `plan` or `step`, incorrectly rejecting
some valid numbered plans. V6 requires an explicit no-change statement plus
exactly two sequential numbered steps or two list bullets; this remains a
structural smoke check, not a score of usefulness or coherence. Evaluator 0.2.8
records this new grading behavior. V5's checks and prior reports are unchanged;
v5 and v6 reports are not eligible for direct score comparison.

`headless-workflows-v7` preserves the other v6 task contracts and replaces its
lexical coding verification check with `coding-original-verifier-v1`. The
parent CLI turn must run one exact public verifier after creating `math.mjs`;
worker verification does not qualify. Grading separately checks behavior,
file scope, one successful original runtime receipt, and the exact final JSON
matching that receipt. Responses are not normalized. The receipt travels only
through the live top-level CLI JSON stream, not task journals, job replay,
run snapshots or report bodies. Missing, duplicate, inconsistent, late or
truncated evidence fails closed. Human quality and honesty review remain required.

Evaluator 0.2.12 adds this contract while retaining schema 5 and the historical
v2-v6 prompts/checks. It forms a new comparison baseline, not a retroactive
upgrade of old lexical passes. The eval-only runtime flag is default-off and
is enabled only for the new coding strategy; legacy tasks explicitly disable it.
This is original execution observation within a cooperative process boundary,
not an OS sandbox or cryptographic attestation against malicious same-UID code.

The first two frozen v7 coding diagnostics at revision `b3bc84d4` scored 3/4
and 2/4: both created the correct scoped implementation, but original
verification failed in both, and exact final JSON/receipt agreement failed
in the second. Each action projection recorded two failed shell completions;
it does not identify commands or establish their cause. Keep these failed
samples, not replacements, when checking a native CLI/SHELL integration repair.

Two predeclared serial samples at CLI/SHELL repair revision `24c21810` scored
2/4 and 3/4. Both passed behavior and file scope. The first timed out at the
300-second child bound, leaving original verification and final agreement
unconfirmed. The second supplied successful original verification but failed
exact final JSON/receipt agreement. Raw discarded responses were not recovered;
action-category counts cannot identify commands or establish a failure cause.
Across the two baseline and two candidate samples, checks remained 5/8, while
mean CLI time increased from 127.5555s to 193.9865s and mean reported tokens from
426,202.5 to 843,609. Keep these negative outcomes; they do not demonstrate a
speed, billing or overall-quality improvement. A separate post-run audit found
matching advertised and requested routes within each pair, but the frozen helper
did not enforce advertised-route equality or recheck binary pins per launch.
Current binaries matching setup are not per-launch or effective-route attestation.
Keep source revisions separate when pooling repetitions. Source inspection also
identified verified terminal-result re-synthesis as an independent preservation
conflict, not a proven cause of either live failure. Human review remains pending.

```sh
nub run eval:headless -- --suite headless-workflows-v7 --task coding-original-verifier-v1
```

Evaluator 0.2.9 updates coding receipts, not the frozen suite prompts: verified
file changes survive a failed worker, literal Bun `--cwd` commands are recognized,
parent verification must follow coding, and stale managed-app readiness is
rejected. Install/build checks exclude dry runs and failure-masking shell syntax.
The same tested runtime environment helper isolates data, gateway and hooks
for each headless task and validates canonical configuration names. It also
pins SDK ACP task/session storage, audit logs, Eliza account state and PGlite
under the experiment root, and clears remote SQL URLs. Existing linked provider
sign-in and repository skills remain configured inputs. Check for zero prior SDK
tasks/sessions before dispatch; fresh Doolittle directories alone are insufficient.
Treat this
as a new evaluation baseline; earlier evaluator versions remain incompatible.

Evaluator 0.2.10 changes headless cleanup, not the frozen suite prompts. Each
task retains its isolated state through every follow-up, callback, and grading
step, then removes that state before the next task only after shutdown and the
original directory identities are verified. Unsafe or unconfirmed cleanup
aborts the suite without writing a shortened report and retains private state.
On POSIX, shutdown confirmation covers the owned detached process group, not
descendants that escape it; Windows shutdown is unconfirmed and fails closed.
Per-task filesystem cleanup is excluded from suite wall time. New reports form
a separate baseline; do not pool them with evaluator 0.2.9 measurements.

Evaluator 0.2.11 writes schema-v5 headless reports. The advertised route is a
configuration expectation, not the effective model: provider and effort are
allowlisted, model names and optional operator labels are hashed. Per-task
request-journal evidence identifies requested parent-turn model digests and
its missing, partial, mixed, or conflicting coverage. Requested effort,
effective model/effort, and worker routes remain unavailable. Schema-v4 reports
remain readable as legacy/unattested evidence; do not pool them with v5.

V5 directly times preflight, task setup, response processing, grading, task
cleanup, report preparation, and final cleanup as separate phases. Child
execution remains a composite; no wall-minus-provider overhead is inferred.
Completed serialization and report-write durations are stored in an optional
owner-only `REPORT.json.measurement.json` receipt bound to the report's SHA-256.
Receipt-write time and inter-phase bookkeeping are untimed; a missing receipt
does not change grading. Verify the report hash before using receipt timings.

```sh
nub run eval:headless -- --suite headless-workflows-v6 --task reliability-no-side-effect-v6
```

For a one-off local investigation, `--show-action-labels` prints up to 32
action-start labels to the terminal. Only known static identifier shapes are
shown; other labels are redacted. This opt-in diagnostic is never written to
reports and does not affect grading:

```sh
nub run eval:headless -- --suite headless-workflows-v5 --task reliability-no-side-effect-v5 --show-action-labels
```

`--record-action-diagnostics` separately writes an owner-only, exclusive-create
`REPORT.json.actions.json` receipt. Its schema-1 projection contains only fixed
action-category counts, byte/event limits, rejected records, truncation and
unavailable coverage. Verify its report SHA-256 and numeric `reportRunIndex`
against the exact report before use. Unknown action names map to `other`; labels,
arguments, results, errors, IDs, commands and URLs are never exported. Counts are
journal-event occurrences, including duplicates—not distinct worker commands,
failure causes or effective-route evidence. The reader runs only after confirmed
child shutdown, rejects symlink/nonregular inputs, and bounds data read rather
than synchronous filesystem latency. Optional diagnostic failures do not change
grading or cleanup; trusted synchronous hooks must return promptly.

Default mode adds no action journal read, receipt or execution override. Opt-in
reading contributes to grading time and adds an explicit execution override;
schema-v5 aggregation and paired comparison require equal ordered overrides.
Do not pool on/off samples. Action diagnostics do not change report schema 5
or the evaluator version; historical default-mode v5 reports remain readable
and schema-v4 comparison policy is unchanged.

```sh
nub run eval:headless -- --suite headless-workflows-v6 --task coding-function-behavior-v6 --record-action-diagnostics
```

Every task gets a fresh temporary data directory and workspace with a minimal
onboarding marker. Eliza Cloud is disabled in subprocesses by default;
`--enable-configured-cloud-research` explicitly enables the configured provider
for research-domain tasks only. The harness prefers an Eliza Cloud API key in
the current environment, then reads the key from the configured Doolittle auth
profile. It strips both supported API-key variables from every task process and
passes the key only to opted-in research subprocesses. Set `DOOLITTLE_DATA_DIR`
or `DOOLITTLE_DATA_PATH` to select the profile when running from another
checkout. Keys are never written to reports. Reports are owner-only and include
task IDs, evaluator version, phase and provider-call timings, provider-reported
token counts when available, response digests, objective check outcomes, and
sanitized model-trace and action start/completion/success/failure counts plus
source revision/cleanliness—not prompts,
responses, commands, or workspace paths. Trace summaries include request,
response, error, and mutation-continuation counts plus prompt-length statistics;
the journal itself remains temporary. Codex
per-call USD cost is unavailable and is recorded as null, not inferred from
subscription usage. Raw answers are printed only when `--show-responses` is
explicitly requested. Each
task still requires human quality review; deterministic checks are only
smoke/acceptance evidence, not a model-quality score. Each CLI invocation has
a 300-second execution timeout and bounded shutdown confirmation;
timeout and output-limit failures remain visible as failed runs when cleanup
can be confirmed. Unconfirmed shutdown retains state and aborts without a
report. Temporary workspaces are removed per task only when safe. Use the
[agent quality evaluation checklist](../../docs/engineering/agent-quality-eval-checklist.md)
to plan comparable runs, score human-facing quality, and interpret timing
without confusing process completion, objective checks, and model latency.

### Optional planner alias exposure intervention

`--deduplicate-planner-alias-tools` opts the child invocations into Doolittle's
default-off, public-SDK duplicate alias advertisement policy. Canonical tools
and the SDK's original admission/legacy dispatch stay intact. The runner writes
`DOOLITTLE_PLANNER_DEDUP_ALIAS_TOOLS=true` or `false` on every child, shadowing
ambient values, and retains only a fixed ON marker in schema-v5 overrides.
Prompts, graders, task identities and default behavior are unchanged.

```sh
nub run eval:headless -- --suite headless-workflows-v6 \
  --task coding-function-behavior-v6 --deduplicate-planner-alias-tools
```

Default pairing still rejects unequal overrides. For a **predeclared** single
OFF-to-ON intervention at the same clean source revision and declared route,
use the explicit comparator mode:

```sh
nub run eval:headless:compare -- \
  --baseline /path/to/planner-off.json \
  --candidate /path/to/planner-on.json \
  --planner-alias-intervention
```

Only that exact marker may be appended; every other ordered override, available
requested-route signature, task/check identity, schema and evaluator must
match. Missing/dirty/different source, reversed arms, copied timestamps or other
context changes are refused. Equally unavailable requested signatures do not
prove execution, and effective/worker routes remain unavailable. This is not a
generic override exemption. Repeat aggregation never mixes the two arms.
Synthetic tool/schema reductions alone do not prove latency or quality gains;
keep live failures, repeated timing spread and human review visible.

The October 3 two-pair-per-domain diagnostic did not establish a dependable
speed gain: coding mean CLI time rose from 75.0465s OFF to 105.214s ON, despite
lower reported token usage, and both arms failed every research citation
check. The experiment remains default-off. This is a descriptive small sample,
not a quality, billing or effective-route conclusion.

In the frozen v3-v6 coding task, `truthful-test-report` only checks a filename
and verification keyword; the harness independently executes behavior checks.
Do not promote its pass to original agent-run test or honesty evidence. The
separate v7 original-verification contract does not rewrite historical reports
or grading.

The pinned core beta.7 patch repairs one proven citation-loss mechanism:
generic document `data.url` values are no longer stripped as delivered media
unless explicitly typed image/video/audio. Named media URL behavior is
preserved. The public-SDK regression suite is synthetic and network-blocked.
Two subsequent clean-source SDK-web repetitions at `37403cf3` passed 5/5
checks each, including exact citations. They are descriptive new-source
samples, not a matched comparison or a substitute for human-quality review
and broader research coverage. Earlier failed reports remain unchanged.

Task-local journal evidence assumes cooperative, trusted same-UID writers.
Ownership and descriptor checks do not authenticate rows an evaluated shell
can rewrite before reading. A content-free projection is not tamper-proof
execution attestation, and the existing transient task journal may contain
sanitized action text/output until confirmed cleanup removes owned state.

Aggregate repeat samples only when they use the same schema (v4 or v5), declared
route, evaluator, suite, task set, objective checks, and clean source revision.
V5 additionally requires matching available requested-route signatures; mixed
or conflicting routes are not comparison-eligible, but remain reviewable.
V5 also requires equal ordered execution overrides, including diagnostic mode.
Unavailable effective/worker evidence stays unavailable. Reports with the same
run timestamp are rejected so a copied report cannot count as another sample:

```sh
nub run eval:headless:aggregate -- \
  --report /path/to/repeat-1.json \
  --report /path/to/repeat-2.json \
  --json
```

The aggregate reports descriptive completion/check pass rates and per-task
median, nearest-rank p90, range, and mean for execution duration, exec-start to
the first model request, exec-start to first non-empty assistant-text progress,
harness invocations, Codex telemetry, and sanitized model request/response/error
and continuation counts, plus agent-action start/completion/success/failure
counts. Action telemetry contains counts only: no action names, arguments,
results, or workspace paths. First-model-request timing is a startup and
prompt-preparation signal, not pure harness overhead. First-text timing includes
CLI startup and output transport; it is neither model-only TTFT nor rendered UI
latency. A missing telemetry field remains unavailable. These statistics do
not establish human-facing quality or causal model improvement; raw report paths
and contents are not included in the aggregate output.
