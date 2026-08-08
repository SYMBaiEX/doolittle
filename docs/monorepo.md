# Monorepo Layout

Doolittle is organized as a Nub workspace monorepo running on stock Node.js.

## Workspace roles

| Workspace | Role |
| --- | --- |
| Root package | Workspace manifest, exact ElizaOS release contract, shared scripts, documentation, and toolchain configuration. |
| `apps/desktop` | Electron lifecycle and native capabilities, context-isolated preload contract, and React operator UI. See the [desktop guide](./desktop.md). |
| `packages/agent` | Primary application: Eliza runtime assembly, CLI/cockpit, API, gateway, and product services. |
| `packages/acp` | Agent Client Protocol server and in-process bridge built on the official ACP SDK. |
| `packages/contracts` | Secret-free contracts shared across the agent, desktop, gateway, and plugins. |
| `packages/plugins` | Doolittle product facets plus the Claude Code and Devin provider bridges. Official Codex, Eliza Cloud, SQL, browser, MCP, messaging, and model plugins remain upstream-owned. |
| `packages/characters` | Character and persona data loaded by Eliza. |
| `packages/skills` | Curated and generated native skill documents. See the [skills index](../packages/skills/index.md). |
| `packages/skill-packs-optional` | Optional native skill documents kept outside the default curated tier. |
| `packages/app-training`, `packages/cloud-shared`, `packages/plugin-remote-manifest`, `packages/plugin-worker-runtime`, `packages/registry` | Explicit resolver shims for packages not published on the pinned beta train. They are guarded by the SDK release check and are not product-owned replacements for Eliza. |

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

See the [module structure guidelines](./module-structure-guidelines.md) for
folder, filename, entrypoint, and test-placement conventions.

## Validation

Run the workspace quality pass from the repo root:

```bash
nub run check
nub run check:acceptance
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
