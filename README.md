# Doolittle

Desktop and CLI clients for ElizaOS coding and daily assistance. Doolittle owns
client UX, transport, workspace access, and product integrations; ElizaOS owns
the agent engine.

## Development

Use the Node version in [`.node-version`](.node-version) and Nub version in
[`package.json`](package.json). From the repository root:

```sh
nub run deps:install -- --frozen-lockfile --ignore-scripts
cp .env.example .env
nub run bootstrap
nub run desktop:runtime:install
nub run desktop:dev
```

For terminal development, run `nub run dev`. The installer wrapper
`bash scripts/install.sh` can install the toolchain, link the CLI, and run setup.
See [setup](docs/setup.md) for platform requirements and configuration.

## Developer documentation

Start with the [developer handbook](docs/README.md).

- [Architecture](docs/architecture.md): packages, runtime ownership, and extension points.
- [Development](docs/development.md): CLI and desktop feedback loops.
- [Testing](docs/testing.md): focused tests, native journeys, and verification boundaries.
- [Interface](docs/interface.md): UI implementation and interaction conventions.
- [SDK dependencies](docs/sdk.md): pinned ElizaOS source builds and upgrades.
- [Evaluations](docs/evaluations.md): task suites, reports, and comparisons.
- [Security](docs/security.md): developer security boundaries and local checks.
- [Releases](docs/releases.md): packaging, provenance, and release checks.

Commands are defined in the root and workspace manifests. Runtime plugin and
capability definitions live in code; the developer handbook links to those
sources instead of copying their inventories.

Read [Contributing](CONTRIBUTING.md) before changing the workspace, and
[Security](SECURITY.md) for private vulnerability reporting.

Licensed under the [MIT license](LICENSE).
