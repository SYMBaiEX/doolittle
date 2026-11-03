# Evaluations

`packages/evals` contains task suites, receipt graders, the headless runner,
report comparisons, and human-review sidecars. It is a development workspace;
it is not shipped as a desktop runtime dependency.

## Find and run tasks

```sh
nub run eval:list
nub run eval:coding -- --help
nub run eval:headless -- --help
```

The [coding suites](../packages/evals/src/coding/cases.ts) grade completed runs
from gateway receipts and trajectory evidence. They do not dispatch work or
modify the target workspace. A typical receipt evaluation is:

```sh
nub run eval:coding -- --gateway http://127.0.0.1:PORT \
  --journal /private/evidence/trajectory-events.jsonl \
  --workspace /absolute/path/to/fixture --suite coding-harness-v1 \
  --fixture STARTER_COMMIT --task-run nextjs-shadcn-blog=RUN_ID \
  --route-label provider-model-effort
```

The [headless suites](../packages/evals/src/headless/cases.ts) dispatch one-shot
CLI tasks into disposable workspaces. Running them can use configured providers
and incur usage. Inspect each suite's task and provider requirements first:

```sh
nub run eval:headless -- --suite headless-representative-v3 \
  --task coding-seeded-invoice-regression-v1
```

Use private fixture and evidence directories. Never run a mutation task in an
unrelated working repository. For source-frozen evaluations, commit the source,
build the CLI, use the same fixture revision, predeclare repetitions and limits,
and retain failed runs as well as successful ones.

## Reports and comparison

Reports default to `${XDG_STATE_HOME:-~/.local/state}/doolittle/evals`.
`DOOLITTLE_EVAL_HOME` or `--report-dir` selects another location.

```sh
nub run eval:reports
nub run eval:compare -- --baseline BASELINE.json --candidate CANDIDATE.json
nub run eval:headless:compare -- --baseline BASELINE.json --candidate CANDIDATE.json
nub run eval:headless:aggregate -- --report REPEAT_1.json --report REPEAT_2.json --json
```

Comparators enforce report, evaluator, suite, fixture, task, and route
compatibility. Do not change frozen suite prompts or grading intent in place;
add a suite version and update the evaluator version when grading behavior
changes. The [comparison code](../packages/evals/src/headless/compare.ts) is the
precise compatibility contract.

Objective checks establish their specific receipt or artifact contract. They do
not establish visual quality, response honesty, effective model identity, cost,
or broad agent quality. Missing measurements stay unavailable; a route label
alone does not attest the executed route.

## Human review and response capture

Record explicit human ratings separately:

```sh
nub run eval:review -- --report REPORT.json --input RATINGS.json --out REVIEW.json
nub run eval:review -- --verify REVIEW.json --report REPORT.json
```

The [sidecar validator](../packages/evals/src/review/sidecar.ts) defines the input
schema, anchored ratings, and critical-failure codes. Sidecars bind to a report;
they do not change deterministic grades.

`--capture-synthetic-responses` is an opt-in headless option for bounded final
responses from synthetic tasks. It cannot be combined with `--show-responses`.
Capture files contain response content and are not sanitized for unexpected
secrets; retain them privately. Capture and default runs have different execution
overrides and cannot be pooled. See the
[capture implementation](../packages/evals/src/headless/response-capture.ts) for
size limits and refusal behavior. Neither capture nor a final-response-only
review proves tool chronology or complete workflow quality.
