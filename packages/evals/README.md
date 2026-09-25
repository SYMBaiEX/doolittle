# Doolittle evaluation suites

`@doolittle/evals` owns versioned task suites, deterministic receipt graders,
private reports, and strict baseline comparisons. It is a development workspace;
the desktop runtime does not depend on it.

## Start here

```sh
nub run eval:list
nub run test:coding-evals
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

## Versioning and grading boundaries

- Do not change a published suite's prompt, task IDs, or acceptance intent in
  place. Add a new suite version so previous reports remain interpretable.
- Bump the eval package version when grader behavior changes; comparisons reject
  reports produced by different evaluator versions. Bump the report schema only
  when the persisted report shape or meaning changes.
- Keep deterministic telemetry checks in code; add a new `CodingEvalCase` only
  when the receipt contract can support it and its failure behavior has tests.
- Browser-rendered quality, request coverage, accessibility, conversation
  coherence, and final-response honesty are human-review dimensions. Record
  them separately; the gateway receipts do not prove them.
- `--case` with explicit `--run` IDs remains available for one-off historical
  analysis. Those ad hoc reports are intentionally not eligible for comparison.
- The evaluator never calls a provider, sends chat messages, or mutates the
  target workspace.
