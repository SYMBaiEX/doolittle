# Monorepo Layout

Doolittle is organized as a Bun workspace monorepo.

## Workspace roles

- root package
  - workspace manifest, shared scripts, root docs, and top-level toolchain config
- `packages/agent`
  - the primary Doolittle application source
  - runtime, CLI, API, gateway, and product-specific services
- `packages/plugins`
  - local Doolittle product plugins and provider bridge packages
  - includes the consolidated Doolittle plugin plus first-party provider bridges such as `plugin-codex`, `plugin-claude-code`, `plugin-devin`, `plugin-elizacloud`, and `plugin-sql`
- `packages/skills`
  - local Doolittle skill content and generated skills
  - organized by category for discoverability (`identity/`, `memory/`, `productivity/`, `automation/`, `platform/`, `browser/`, `media/`, `research/`, `generated/`)
- `packages/characters`
  - character definitions and persona data
## Boundary rules

- keep product behavior in `packages/agent/src/`
  - gateway orchestration
  - operator flows
  - ACP surfaces
  - Doolittle identity and routing
- keep provider bridges and product plugin facets in `packages/plugins/*`
  - avoid claiming official plugin workspaces unless they are actual workspace packages
  - prefer direct ElizaOS SDK imports over local compatibility shims
- keep workspace-level documentation at the repo root and under `docs/`

See [module-structure-guidelines.md](./module-structure-guidelines.md) for the naming and folder rules the repo is converging toward during the stabilization pass.

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

That script installs workspace dependencies, creates `.env` from `.env.example` if needed, and seeds the local runtime directories under `.doolittle/`.

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
