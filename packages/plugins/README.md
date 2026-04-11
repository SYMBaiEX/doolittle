# Plugin Workspace

This workspace mixes three different kinds of package-shaped code:

- public provider bridges such as [`plugin-codex`](./plugin-codex) and [`plugin-claude-code`](./plugin-claude-code)
- vendored compatibility packages kept local for the current ElizaOS alpha line
- internal adapters that expose Doolittle runtime services through plugin contracts

## Canonical Truth

Human-readable truth now lives in generated docs backed by the runtime catalog:

- [`docs/plugin-inventory.md`](../../docs/plugin-inventory.md)
- [`docs/capability-truth.md`](../../docs/capability-truth.md)

Runtime truth is exposed directly from:

- `GET /runtime/plugins`
- `GET /browser/status`
- `GET /runtime/media`

## Working Rule

- Product-specific orchestration belongs in `packages/agent/src/` or [`doolittle-plugin`](./doolittle-plugin).
- Public provider bridges should stay honest about readiness and publish intent.
- Internal adapters should not present themselves as independent subsystems when they are thin wrappers over runtime services.
- Vendored compatibility work should stay close to the package boundary instead of leaking runtime-line patches deeper into the product.

## Linked Providers

The intentionally user-facing provider bridges are:

- [`plugin-codex`](./plugin-codex)
- [`plugin-claude-code`](./plugin-claude-code)
- [`plugin-elizacloud`](./plugin-elizacloud)

Suggested runtime flow:

- `/accounts connect codex`
- `/accounts connect claude-code`
- `/accounts connect elizacloud`
- `/accounts doctor`
- `/accounts use codex`
- `/accounts use claude-code`
- `/accounts use elizacloud`
