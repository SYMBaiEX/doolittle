# Plugin Workspace

This workspace contains provider bridges and product adapters:

- the public provider bridge [`plugin-claude-code`](./plugin-claude-code); Codex is supplied directly by `@elizaos/plugin-codex-cli`
- internal adapters that expose Doolittle runtime services through plugin contracts

## Canonical Truth

Human-readable truth is generated from the runtime catalog:

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
- Consume published SDK modules directly; do not recreate unpublished packages in the SDK namespace.

## Linked Providers

The intentionally user-facing provider bridges are:

- [`plugin-claude-code`](./plugin-claude-code)
- `@elizaos/plugin-codex-cli` is consumed directly from the official ElizaOS release rather than vendored here.
- `@elizaos/plugin-elizacloud` is consumed directly from the official ElizaOS release rather than vendored here.

Shared Doolittle-only provider implementation stays in
[`provider-transport`](./provider-transport). The private
[`doolittle-plugin`](./doolittle-plugin) contains product-specific actions and
service projections.

Suggested runtime flow:

- `/accounts connect codex`
- `/accounts connect claude-code`
- `/accounts connect elizacloud`
- `/accounts doctor`
- `/accounts use codex`
- `/accounts use claude-code`
- `/accounts use elizacloud`
