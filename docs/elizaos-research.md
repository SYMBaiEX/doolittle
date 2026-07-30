# ElizaOS Research Notes

This document captures framework-level findings that matter for keeping Doolittle aligned with the current ElizaOS 2.x architecture.

## Package Status Observed On July 27, 2026

Current npm metadata is not lockstep across the ElizaOS package family, so Doolittle tracks package-by-package with explicit `2.0.3-beta.7` pins.

| Package | npm `latest` | npm `beta` | Doolittle strategy |
| --- | --- | --- | --- |
| `elizaos` | `1.7.2` | `2.0.3-beta.7` | Use explicit beta |
| `@elizaos/core` | `1.7.2` | `2.0.3-beta.7` | Use explicit beta |
| `@elizaos/agent` | `0.25.9` | `2.0.3-beta.7` | Use explicit beta |
| `@elizaos/skills` | `2.0.0-alpha.77` | `2.0.3-beta.7` | Use explicit beta |
| `@elizaos/autonomous` | `2.0.0-alpha.77` | `2.0.3-beta.7` | Keep aligned with beta runtime train through `@elizaos/agent` where ownership is centralized |
| `@elizaos/plugin-openai` | `1.6.0` | `2.0.3-beta.7` | Use explicit beta |
| `@elizaos/plugin-sql` | `1.7.2` | `2.0.3-beta.7` | Keep the workspace wrapper for Doolittle metadata normalization and duplicate recovery |

Implications:

- `npm` dist-tags are mixed across packages, and the visible `latest` values may still point to older major lines; do not rely on `latest` for compatibility.
- The runtime migration target is the verified `2.0.3-beta.7` install line, with explicit pins.
- Several official plugins remain at different publish streams, so the workspace wrapper remains for SQL compatibility while still consuming the beta stream where supported.
- Workspace wrappers are still valuable where Doolittle needs compatibility patches or plugins that are not published as official npm packages.

## Current Architecture Findings

### 1. The New `ElizaOS` Orchestrator Is An Upstream Harness Option

The current runtime docs show `ElizaOS` handling plugin resolution, multi-agent orchestration, `addAgents`, `startAgents`, `handleMessage`, streaming callbacks, events, and health checks.

Doolittle does not currently construct this top-level `ElizaOS` class. Its
production boot creates `AgentRuntime` directly, installs official plugins and
services, and hands normal turns to `DefaultMessageService`. This section is an
upstream option to evaluate, not a description of committed architecture.

What that means for Doolittle:

- Doolittle should keep shrinking toward a harness around ElizaOS runtime orchestration.
- Local CLI, gateway, browser, account linking, and diagnostics should wrap the runtime instead of becoming a parallel agent framework.
- The Doolittle value layer is operator ergonomics, provider/account bridges, native local execution, and harness policy.

### 2. Runtime-Centered Design Is Still Correct

ElizaOS is still centered around `AgentRuntime` and plugin-loaded runtime capabilities.

What that means for Doolittle:

- character, plugins, model settings, memory, and message processing should remain the center of the app
- HTTP, CLI, gateway, and scheduling layers should adapt into runtime messages and services
- app code should avoid duplicating runtime orchestration where the SDK now owns it

### 3. Services Are The Native Long-Running Integration Model

Official docs register services through plugins and expose them with `runtime.getService(...)`.

Implication for Doolittle:

- gateway lifecycles, browser/MCP bridges, platform adapters, account refreshers, and background coordination should continue moving into ElizaOS plugin services
- standalone app services should be treated as harness adapters unless they truly belong outside the runtime

### 4. Plugins Are Broader Than Actions

Current plugin docs cover actions, providers, evaluators, services, routes, events, and model handlers.

Implication for Doolittle:

- the Doolittle plugin surface should prefer native plugin components over app-only extension points
- plugin-provided routes are bridged through the Node harness with Eliza's
  canonical `dispatchRoute`; `/health` and `/features` are now owned by the
  Doolittle runtime plugin instead of parallel server handlers
- model/provider wrappers should stay plugin-native so they can benefit from SDK routing and model selection

## Application Direction For Doolittle

### Good Current Alignment

- runtime-centered bootstrapping
- custom Doolittle plugin for actions/providers/evaluators/models
- SQL-backed runtime initialization
- canonical message processing path for chat requests
- workspace wrappers where official package versions lag or Doolittle needs compatibility patches

### Highest-Value Next Refactors

1. Treat Doolittle as the harness around ElizaOS rather than a replacement agent runtime.
2. Evaluate replacing remaining harness boot logic with the top-level `ElizaOS`
   orchestrator only where the installed beta SDK supports it without losing
   desktop, provider, or local-first lifecycle guarantees.
3. Promote gateway lifecycle and account/provider bridges into real ElizaOS `Service` classes where they are still app-bound.
4. Continue moving runtime-owned HTTP surfaces through the established plugin
   route bridge when the ownership boundary is clear.
5. Keep package audit/version tooling explicit about `latest` versus `beta`,
   because npm dist-tags are mixed across the ecosystem.

### Boot Ownership On The Pinned Beta Line

The public runtime documentation now shows a top-level `ElizaOS` orchestrator,
but `@elizaos/core@2.0.3-beta.7` does not export that class. The pinned SDK does
export `createRuntimes`. Doolittle no longer maintains a pre-initialize PGlite
recovery loop: the pinned `@elizaos/agent` runtime owns typed lock, corruption,
and manual-reset failures, and Doolittle preserves those failures instead of
parsing database prose or resetting data directories itself.

Doolittle therefore keeps direct `AgentRuntime` construction on this exact
beta line. This is a compatibility boundary, not permission to maintain a
second service lifecycle: Doolittle-owned runtime capabilities must be
registered through plugin `services`, actions, providers, evaluators, routes,
or events. The advanced-memory adapter now follows that rule; it is part of
the Doolittle plugin and no longer mutates `AgentRuntime` registration maps.
Gateway creation follows the same invariant: bootstrap requires the
`doolittle_gateway` service and resolves its runner exclusively through that
service instead of silently constructing a parallel product-owned runner. The
gateway, scheduler, workflow dispatch, and automation services are validated
as critical plugin services before the runtime is exposed.
The self-awareness registry also starts through the plugin-owned
`doolittle_awareness` service; the provider resolves that service at turn time
instead of relying on run-progress initialization side effects.
Local command execution follows the same boundary: the Doolittle plugin
registers the canonical `shell` service, delegates policy and backend work to
the existing terminal implementation, and makes actions resolve execution
through the runtime service instead of bypassing Eliza service ownership.
Workspace and repository inspection follow the same invariant through the
hot `coding_agent` service. Planner-selected workspace/repository actions and
operator commands resolve that service from the runtime; they no longer
capture the full product service graph or silently execute through a parallel
fallback when native service registration is broken.
Browser capture and evidence operations are likewise registered as the
canonical `browser` service. CLI commands, API routes, and runtime diagnostics
resolve that service first while the existing web implementation retains
truthful browser-versus-placeholder behavior behind the plugin boundary.
MCP discovery and invocation now use the same model: official Eliza marketplace
helpers remain the source for server discovery, while the canonical `mcp`
service owns runtime resolution and delegates configured local execution,
tool caching, and receipts to the existing implementation.
Skills use the same ownership split. The official `AgentSkillsService` owns
loaded inventory, catalog search, details, synchronization, and installation.
Doolittle's `SkillsService` only projects workspace metadata for the desktop
and startup path; it no longer exposes a second catalog facade. The generic
`AgentSdkService` catalog/search methods and the skills-hub catalog snapshot
were removed as duplicate clients. Generated families, manifests, and portable
bundles consume read-only official-service projections and remain product
distribution views.
Telegram follows the same ownership rule. The official plugin's `telegram`
service owns bot lifecycle, inbound processing, message persistence, retries,
chunking, sends, and edits. The gateway adapter resolves that live service and
adds only Doolittle routing, health, and delivery-journal projection; it no
longer carries a second raw Bot API implementation.
The API harness likewise dispatches registered Eliza plugin routes before
product-only handlers; the initial health and feature inventory routes are
defined by the Doolittle plugin.
Its Responses-compatible projection now follows the official semantic stream
lifecycle: one stable response ID is created before output, events carry
monotonic sequence numbers, text is represented through output-item and
content-part events, and each stream terminates with completed or failed
state. The underlying turn still runs through the Eliza-owned gateway/runtime
rather than a second API-only model loop.
Re-evaluate the top-level orchestrator when the pinned runtime train exports
that public lifecycle; until then direct `AgentRuntime` construction remains
the smallest supported composition boundary.

## Sources Consulted

Primary sources:

- ElizaOS core runtime docs: https://docs.elizaos.ai/runtime/core
- ElizaOS services docs: https://docs.elizaos.ai/runtime/services
- ElizaOS project docs: https://docs.elizaos.ai/projects/overview
- ElizaOS plugin reference: https://docs.elizaos.ai/plugins/reference
- OpenAI streaming Responses guide: https://developers.openai.com/api/docs/guides/streaming-responses
- npm package metadata via `npm view` for `elizaos`, `@elizaos/core`, `@elizaos/agent`, `@elizaos/skills`, `@elizaos/autonomous`, `@elizaos/plugin-openai`, and `@elizaos/plugin-sql`
