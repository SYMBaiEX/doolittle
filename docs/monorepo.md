# Monorepo Layout

Doolittle is organized as a Nub workspace monorepo running on stock Node.js.

## Workspace roles

- root package
  - workspace manifest, shared scripts, root docs, and top-level toolchain config
- `apps/desktop`
  - Electron-owned local runtime lifecycle and native capabilities
  - context-isolated preload contract and React chat surface
  - see [desktop.md](./desktop.md) for the process and security boundaries
- `packages/agent`
  - the primary Doolittle application source
  - runtime, CLI, API, gateway, and product-specific services
- `packages/plugins`
  - local Doolittle product plugins and provider bridge packages
  - includes the consolidated Doolittle plugin plus first-party provider bridges such as `plugin-codex`, `plugin-claude-code`, `plugin-devin`, `plugin-elizacloud`, and `plugin-sql`
- `packages/skills`
  - local Doolittle skill content and generated skills
  - see [the skills index](../packages/skills/index.md) for the active direct-child taxonomy and generated-skill bookkeeping
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
nub run check
```

## Bootstrap flow

For a fresh clone, use the Nub-powered installer wrapper:

```bash
bash scripts/install.sh
```

That script installs workspace dependencies, creates `.env` from `.env.example` if needed, and seeds the local runtime directories under `.doolittle/`.

If you only need the bootstrap step again:

```bash
nub run bootstrap
```

Useful workspace commands:

```bash
nub run workspace:list
nub run lint:check
nub run typecheck
nub run test
nub run build
```
