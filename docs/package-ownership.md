# Package Ownership and Eliza Migration Status

Last reviewed: August 7, 2026

This is the package-level companion to the runtime
[plugin inventory](plugin-inventory.md). Each workspace is classified by why it
exists and whether an official Eliza package can own the same behavior on the
pinned `2.0.3-beta.7` train.

| Workspace | Ownership | Status | Boundary |
|---|---|---|---|
| `apps/desktop` | Doolittle product | Keep | Electron shell, renderer, local API supervision, and operator UX are application behavior rather than an Eliza plugin. |
| `packages/agent` | Doolittle product over Eliza | Keep thin | Composes `AgentRuntime`, official plugins, CLI/TUI, gateway, API, and product projections. Standard runtime lifecycles remain Eliza-owned. |
| `packages/acp` | Protocol adapter | Keep | Implements the Agent Client Protocol through the official ACP SDK; Eliza does not publish a replacement for Doolittle's ACP server boundary. |
| `packages/contracts` | Doolittle product contracts | Keep | Secret-free API, desktop, gateway, and operator records. These contracts must not shadow SDK lifecycle types. |
| `packages/characters` | Eliza configuration | Native data | Character JSON is loaded by Eliza and contains no competing runtime implementation. |
| `packages/plugins` | Workspace aggregator | Keep | Groups shared plugin dependencies and contains the namespaced `doolittle-plugin` product actions and projections. Official service identifiers stay reserved for upstream owners. |
| `packages/plugins/plugin-sql` | Narrow compatibility patch | Temporary | Wraps official `@elizaos/plugin-sql` only for the pinned relationship-write beta defect; remove when the target release contains the fix. |
| `packages/plugins/plugin-claude-code` | Provider gap | Keep for now | Preserves linked-account direct inference, structured Claude CLI output, explicit effort, and nested-tool suppression. The official CLI-inference package does not expose the full contract. |
| `packages/plugins/plugin-devin` | Provider gap | Keep for now | Adapts the sanctioned Devin CLI; no official Eliza Devin provider exists on the pinned release. |
| `packages/plugins/provider-transport` | Shared Doolittle adapter | Keep while used | Down-converts Eliza generation inputs only for the remaining custom Claude Code and Devin transports. |
| `packages/app-training` | Resolver shim | Temporary | Exact beta package is unpublished. The SDK release gate declares and validates the shim. |
| `packages/cloud-shared` | Resolver shim | Temporary | Exact beta package is unpublished. The SDK release gate declares and validates the shim. |
| `packages/plugin-remote-manifest` | Resolver shim | Temporary | Exact beta package is unpublished. The SDK release gate declares and validates the shim. |
| `packages/plugin-worker-runtime` | Resolver shim | Temporary | Exact beta package is unpublished. The SDK release gate declares and validates its public error contract. |
| `packages/registry` | Resolver shim | Temporary | Supplies curated registry JSON subpaths required by desktop packaging until the exact beta artifact is public. |
| `packages/benchmarks` | Test data | Keep | Evaluation fixtures, not runtime code. |
| `packages/distributions` | Distribution data | Keep | Product distribution metadata, not an SDK implementation. |
| `packages/modeling` | Model data | Keep | Model capability metadata, not a provider transport. |
| `packages/skills` | Eliza skill assets | Native data | Skill manifests are consumed by official `@elizaos/skills` and Agent Skills services. |
| `packages/skill-packs-optional` | Distribution assets | Keep | Optional curated skill content; installation and catalog lifecycle remain Eliza-owned. |

`packages/plugins/doolittle-plugin` is source inside the private
`@doolittle/plugins` workspace rather than an additional package. It remains the
home for product-only actions and service projections.

## Completed in this sweep

- Removed the local `@doolittle/plugin-codex` workspace and its duplicate HTTP,
  SSE, OAuth refresh, and model-registration code.
- Registered official `@elizaos/plugin-codex-cli` directly and routed provider
  selection through its native `codex-cli` model owner.
- Stopped projecting a Codex subscription token into `OPENAI_API_KEY`; the
  official plugin reads and refreshes the Codex CLI OAuth file itself.
- Removed Codex from Doolittle's provider publishing pipeline because the
  package is now upstream-owned.

## Enforcement

`nub run check:eliza-sdk` scans every workspace manifest, enforces the exact
official package train, rejects undeclared local packages in the `@elizaos/*`
namespace, checks installed versions, and validates the five resolver-shim
exports. `nub run check:plugin-boundaries` guards runtime ownership and prevents
retired custom SDK facades from returning.
