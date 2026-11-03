# Doolittle evaluations

`@doolittle/evals` owns versioned task suites, receipt graders, private reports,
headless CLI runs, human-review sidecars, and report comparisons. It is a
development dependency and is not part of the desktop runtime closure.

## Run

From the repository root:

```sh
nub run eval:list
nub run eval:coding -- --help
nub run eval:headless -- --help
nub run eval:reports
nub run --cwd packages/evals typecheck
```

The [coding suites](src/coding/cases.ts) grade evidence from completed runs.
The [headless suites](src/headless/cases.ts) dispatch tasks into disposable
workspaces and may use configured providers. Inspect the suite and its fixture
requirements before launching work.

See the [evaluation guide](../../docs/evaluations.md) for fixture selection,
report paths, comparison commands, privacy, and human-review boundaries.

## Development

[`package.json`](package.json) defines public exports and the evaluator version.
Keep published suite semantics stable. Add a suite version when prompts or task
contracts change, and update the evaluator version when grading or execution
semantics change. Comparisons must retain compatible fixtures, task/check sets,
routes, and source identities.

Reports and captured responses are private evidence. A deterministic pass
establishes its specific receipt or artifact contract, not broad quality,
original tool chronology, effective-route identity, or billing accuracy.
Keep failed runs and unavailable measurements explicit.
