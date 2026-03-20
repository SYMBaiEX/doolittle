# Monorepo Layout

Eliza Agent is organized as a Bun workspace monorepo.

## Workspace roles

- root package
  - workspace manifest, shared scripts, root docs, and top-level toolchain config
- `packages/agent`
  - the primary Eliza Agent application source
  - runtime, CLI, API, gateway, and product-specific services
- `packages/plugins`
  - local Eliza Agent product plugins
- `packages/skills`
  - local Eliza Agent skill content and generated skills
  - organized by category for discoverability (`identity/`, `memory/`, `productivity/`, `automation/`, `platform/`, `browser/`, `media/`, `research/`, `generated/`)
- `packages/characters`
  - character definitions and persona data
- `packages/elizaos-official/*`
  - vendored official-compatible ElizaOS packages
  - preserve upstream package names where practical
  - carry the compatibility shims needed for the current runtime line

## Boundary rules

- keep product behavior in `packages/agent/src/`
  - gateway orchestration
  - operator flows
  - ACP surfaces
  - Eliza Agent identity and routing
- keep upstream-like compatibility work in `packages/elizaos-official/*`
  - avoid mixing product logic into vendored packages
  - prefer small shims and adapters over behavior rewrites
- keep workspace-level documentation at the repo root and under `docs/`

## Validation

Run the workspace quality pass from the repo root:

```bash
bun run check
```

## Bootstrap flow

For a fresh clone, use the Bun-first installer wrapper:

```bash
bash scripts/install.sh
```

That script installs workspace dependencies, creates `.env` from `.env.example` if needed, and seeds the local runtime directories under `.eliza-agent/`.

If you only need the bootstrap step again:

```bash
bun run bootstrap
```

Useful workspace commands:

```bash
bun run workspace:list
bun run lint:check
bun run typecheck
bun test
bun run build
```
