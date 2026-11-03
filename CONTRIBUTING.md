# Contributing

Read the [developer handbook](docs/README.md), then follow the
[setup guide](docs/setup.md) and [development loop](docs/development.md).
Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Changes

Keep a change focused on one behavior. Match surrounding TypeScript style and
package boundaries. Use ElizaOS SDK primitives for agent-engine behavior and
keep Doolittle's client and product behavior in its existing owners; see
[architecture](docs/architecture.md).

Add or extend behavior tests under `tests/` for changes to runtime wiring,
permissions, cancellation, state, or user workflows. Use the smallest relevant
verification command from [testing](docs/testing.md). Format changed paths with
Biome; avoid unrelated formatting changes.

Doolittle-owned model prompts use the shared
[prompt-cache layer](packages/agent/src/runtime/prompt-cache/README.md).
Secrets, user content, and per-request data must not be marked cache-stable.
Follow the [interface conventions](docs/interface.md) for desktop work.

## Pull requests

Describe the problem, resulting behavior, checks actually run, and material
unverified behavior. Include screenshots for visual changes when useful.
Keep dependency changes and lockfile updates together. All `@doolittle/*`
workspace versions follow the root product version; official package versions
follow the root `elizaSdk` contract and its explicit exceptions.

## Documentation

Update the relevant handbook chapter with the code change. Keep documentation
current, practical, and developer-facing. Link to implementation or package
manifests for detailed inventories. Use `CHANGELOG.md` for release notes;
audit logs, dated cleanup reports, and planning transcripts do not belong in
`docs/`.

Run `nub run check:local-links` after changing documentation or moving files.
Report vulnerabilities through [Security](SECURITY.md).
