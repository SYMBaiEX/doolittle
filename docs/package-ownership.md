# Package Ownership and Eliza Migration Status

Last reviewed: August 11, 2026

This is the package-level companion to the runtime
[plugin inventory](plugin-inventory.md). Each workspace is classified by why it
exists and whether an official Eliza package can own the same behavior on the
pinned `2.0.3-beta.7` train.

| Workspace | Ownership | Status | Boundary |
|---|---|---|---|
| `apps/desktop` | Doolittle client over Eliza | Keep thin | Official `@elizaos/ui` `ElizaClient` owns ordinary REST request, timeout, retry, client-ID, response, and `ApiError` semantics. Electron retains only lifecycle, a context-isolated transport, its security allowlist, native capabilities, dedicated streams, and operator UX. |
| `packages/agent` | Doolittle product over Eliza | Keep thin | Composes `AgentRuntime`, official plugins, CLI/TUI, gateway, API, product projections, and isolated product-owned native utilities. Standard runtime lifecycles remain Eliza-owned; native utilities may call but never replace them. |
| `packages/acp` | Protocol adapter | Keep | Implements the Agent Client Protocol through the official ACP SDK; Eliza does not publish a replacement for Doolittle's ACP server boundary. |
| `packages/contracts` | Doolittle product contracts | Keep | Secret-free API, desktop, gateway, and operator records. These contracts must not shadow SDK lifecycle types. |
| `packages/characters` | Eliza configuration | Native data | Character JSON is loaded by Eliza and contains no competing runtime implementation. |
| `packages/plugins` | Workspace aggregator | Keep | Groups shared plugin dependencies and contains the namespaced `doolittle-plugin` product actions and projections. Official service identifiers stay reserved for upstream owners. |
| `packages/plugins/plugin-sql` | Doolittle relationship projection | Keep while needed | Wraps official `@elizaos/plugin-sql` without replacing its persistence lifecycle, adding only normalized tag and metadata merge-on-write semantics that the official create API intentionally does not provide. |
| `packages/plugins/plugin-claude-code` | Provider fallback | Keep narrow | Official `@elizaos/plugin-anthropic` owns linked OAuth inference, account-pool rotation, native tools, structured responses, streaming, and prompt caching. This package retains only schema-constrained local Claude CLI fallback with nested-tool suppression, which the pinned official CLI mode does not expose. |
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

`packages/agent/src/native-tools` is a deliberately narrower boundary for
standalone Doolittle utilities compiled with ScriptC. These sources cannot
import Eliza packages or recreate model, provider, plugin, task, memory,
gateway, skill, or runtime-service ownership. See
[Doolittle native tools](native-tools.md).

## Migration results

- Removed the local `@doolittle/plugin-codex` workspace and its duplicate HTTP,
  SSE, OAuth refresh, and model-registration code.
- Registered official `@elizaos/plugin-codex-cli` directly and routed provider
  selection through its native `codex-cli` model owner.
- Stopped projecting a Codex subscription token into `OPENAI_API_KEY`; the
  official plugin reads and refreshes the Codex CLI OAuth file itself.
- Removed Codex from Doolittle's provider publishing pipeline because the
  package is now upstream-owned.
- Routed linked Claude OAuth through official `@elizaos/plugin-anthropic`,
  including account-pool rotation, native tool/response contracts, streaming,
  and prompt caching. The Doolittle Claude package now contains only the
  explicit structured local-CLI fallback missing from the pinned plugin.
- Replaced Doolittle's copied Anthropic OAuth refresh client identity and HTTP
  exchange with the official `@elizaos/agent/auth/anthropic` helper.
- Made official `@elizaos/agent/auth/credentials` subscription status the
  default-machine readiness source for Codex and Claude accounts, including
  macOS Keychain and CLI discovery. Doolittle retains only the product
  projection that distinguishes native model credentials from explicit Claude
  CLI fallback, plus path-aware readers for isolated homes and tests.
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
