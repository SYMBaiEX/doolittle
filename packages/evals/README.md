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
- Bump the eval manifest's `evaluatorVersion` when grader behavior changes;
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
a 300-second execution timeout and up to two seconds of process-tree shutdown
grace; timeout and output-limit failures remain visible as failed runs.
Temporary workspaces are removed after the run. Use the
[agent quality evaluation checklist](../../docs/engineering/agent-quality-eval-checklist.md)
to plan comparable runs, score human-facing quality, and interpret timing
without confusing process completion, objective checks, and model latency.

Aggregate repeat samples only when they use the same schema-v4 route, evaluator,
suite, task set, objective checks, and clean source revision. Reports with the
same run timestamp are rejected so a copied report cannot count as another
sample:

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
