# Doolittle evaluations

This workspace owns versioned task suites, receipt graders, private reports,
headless CLI runs, and report comparisons. It is a development dependency.

See the [evaluation guide](../../docs/evaluations.md) for commands, fixtures,
report compatibility, human review, and private response-capture rules.

Suite definitions live in [coding/cases.ts](src/coding/cases.ts) and
[headless/cases.ts](src/headless/cases.ts). The package manifest records the
current evaluator version. Keep published suite semantics stable and version
changes to prompts, task contracts, or grading behavior.
