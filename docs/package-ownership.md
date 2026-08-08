# Package Ownership and Eliza Migration Status

Last reviewed: August 7, 2026

This is the package-level companion to the runtime
[plugin inventory](plugin-inventory.md). Each workspace is classified by why it
exists and whether an official Eliza package can own the same behavior on the
pinned `2.0.3-beta.7` train.

| Workspace | Ownership | Status | Boundary |
|---|---|---|---|
| `apps/desktop` | Doolittle client over Eliza | Keep thin | Official `@elizaos/ui` `ElizaClient` owns ordinary REST request, timeout, retry, client-ID, response, and `ApiError` semantics. Electron retains only lifecycle, a context-isolated transport, its security allowlist, native capabilities, dedicated streams, and operator UX. |
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
| `packages/skills` | Eliza skill assets | Native data | Skill manifests are consumed by official `@elizaos/skills` and Agent Skills services. |
| `packages/skill-packs-optional` | Distribution assets | Keep | Optional curated skill content; installation and catalog lifecycle remain Eliza-owned. |

`packages/plugins/doolittle-plugin` is source inside the private
`@doolittle/plugins` workspace rather than an additional package. It remains the
home for product-only actions and service projections.

## Migration results

- Removed the local `@doolittle/plugin-codex` workspace and its duplicate HTTP,
  SSE, OAuth refresh, and model-registration code.
- Registered official `@elizaos/plugin-codex-cli` directly and routed provider
  selection through its native `codex-cli` model owner.
- Stopped projecting a Codex subscription token into `OPENAI_API_KEY`; the
  official plugin reads and refreshes the Codex CLI OAuth file itself.
- Removed Codex from Doolittle's provider publishing pipeline because the
  package is now upstream-owned.
- Replaced the custom `secrets-manager` runtime with the official core
  `SECRETS` service and retained only a namespaced `@elizaos/vault` persistence
  mirror for global-secret restart durability and legacy plaintext import.
- Namespaced the remaining Doolittle-owned coding, code-generation, forms,
  local-sandbox, personality, rolodex, and experience services so official
  Eliza identifiers remain reserved for upstream owners.
- Declared the official Form and GitHub packages in the workspaces that import
  them directly instead of relying on root dependency hoisting.
- Replaced the desktop renderer's custom JSON request helper and duplicate
  route-type union with the official `@elizaos/ui` `ElizaClient` plus a narrow,
  structured-clone-safe Electron `AgentRequestTransport` adapter. Non-streaming
  API failures now retain native Eliza `ApiError` metadata.

## Enforcement

`nub run check:eliza-sdk` scans every workspace manifest, enforces the exact
official package train, rejects undeclared local packages in the `@elizaos/*`
namespace, checks installed versions, and validates the five resolver-shim
exports. `nub run check:plugin-boundaries` guards runtime ownership and prevents
retired custom SDK facades from returning.
