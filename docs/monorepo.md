# Monorepo Layout

Eliza Agent is organized as a Bun workspace monorepo.

## Workspace roles

- root package
  - the primary Eliza Agent application package
  - owns the runtime, CLI, API, gateway, docs, characters, skills, and product-specific services
- `packages/elizaos-official/*`
  - vendored official-compatible ElizaOS packages
  - preserve upstream package names where practical
  - carry the compatibility shims needed for the current runtime line

## Boundary rules

- keep product behavior in `src/`
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

Useful workspace commands:

```bash
bun run workspace:list
bun run lint:check
bun run typecheck
bun test
bun run build
```
