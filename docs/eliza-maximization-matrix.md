# Eliza Maximization Matrix

Last updated: May 15, 2026

This matrix tracks where Doolittle is already strongly aligned with the
ElizaOS alpha stack and where native service ownership can still increase.

## Foundation

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Runtime core | `elizaos`, `@elizaos/core`, `@elizaos/agent`, `@elizaos/autonomous`, `@elizaos/skills` | Foundation packages still drive more audit and control-plane visibility than direct runtime behavior | `@elizaos/agent`, `@elizaos/autonomous`, `@elizaos/skills` |
| Native plugin assembly | [`packages/agent/src/runtime/native/plugin-registry/index.ts`](../packages/agent/src/runtime/native/plugin-registry/index.ts), `@elizaos/agent/services/registry-client`, `@elizaos/autonomous/services/plugin-manager-types` | Some plugin inventory and service ownership still flow through product summaries | Use exported registry/plugin-manager contracts before adding direct plugin-manager dependencies |
| Agent SDK usage | [`packages/agent/src/runtime/native/agent-sdk.ts`](../packages/agent/src/runtime/native/agent-sdk.ts), [`packages/agent/src/services/agent-sdk-service.ts`](../packages/agent/src/services/agent-sdk-service.ts) | Registry/catalog/compat data is not yet the dominant source for all runtime/operator decisions | `@elizaos/agent` |

## Knowledge and Identity

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Knowledge ingestion | `@elizaos/plugin-pdf`, `@elizaos/autonomous/api/knowledge-routes`, [`packages/agent/src/services/documents-service.ts`](../packages/agent/src/services/documents-service.ts) | Product memory and documents services still own too much of the ingest/recall flow | Move recall, ingest status, and document lifecycle closer to installed native knowledge APIs |
| Embeddings | `@elizaos/plugin-ollama`, ElizaOS local embedding support through installed provider packages | Doolittle should keep embedding ownership in official SDK/provider packages instead of workspace shadow packages | `@elizaos/plugin-ollama` plus exported local embedding support when it becomes a direct dependency |
| Personality | [`packages/plugins/doolittle-plugin/identity/personality`](../packages/plugins/doolittle-plugin/identity/personality), [`packages/agent/src/services/personality-service.ts`](../packages/agent/src/services/personality-service.ts) | Doolittle keeps product-specific personality behavior while exposing it as an Eliza service | Doolittle identity facet inside the consolidated product plugin; upstream only when ElizaOS publishes a matching service contract |
| User profiles and memory | [`packages/plugins/doolittle-plugin/identity/rolodex`](../packages/plugins/doolittle-plugin/identity/rolodex), [`packages/agent/src/services/user-profile/service/index.ts`](../packages/agent/src/services/user-profile/service/index.ts) | Profile flows are Doolittle-owned but exposed through a native service boundary | Doolittle profile facet inside the consolidated product plugin; upstream only when ElizaOS publishes a matching service contract |
| Session and experience | [`packages/plugins/doolittle-plugin/identity/experience`](../packages/plugins/doolittle-plugin/identity/experience), [`packages/agent/src/services/session/service/index.ts`](../packages/agent/src/services/session/service/index.ts) | Experience views are Doolittle-owned but exposed through a native service boundary | Doolittle experience facet inside the consolidated product plugin; upstream only when ElizaOS publishes a matching service contract |

## Execution and Orchestration

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Shell and execution | `@elizaos/autonomous/actions/terminal`, `@elizaos/agent/services/sandbox-engine`, [`packages/agent/src/services/terminal/service.ts`](../packages/agent/src/services/terminal/service.ts) | Runtime and operator surfaces still sometimes treat shell as a product capability first | Push command policy, sandbox selection, and execution receipts toward exported native execution contracts |
| Coding agent | [`packages/plugins/doolittle-plugin/coding-agent`](../packages/plugins/doolittle-plugin/coding-agent), `@elizaos/agent/services/coding-agent-context` | Doolittle coding behavior is product-owned but exposed as an Eliza plugin/service | Keep Doolittle UX and local-development semantics, but reuse exported coding-agent contracts where they match |
| Orchestrator | [`packages/plugins/doolittle-plugin/agent-orchestrator`](../packages/plugins/doolittle-plugin/agent-orchestrator), [`packages/agent/src/services/delegation/service/index.ts`](../packages/agent/src/services/delegation/service/index.ts), `@elizaos/agent/api/coding-agents-fallback-routes` | Delegation is product-owned but exposed through a native service boundary | Keep Doolittle supervision UX, but reuse exported orchestrator/coding-task contracts where they match |
| Scheduling | `@elizaos/autonomous/triggers/scheduling`, [`packages/agent/src/services/cron/service/index.ts`](../packages/agent/src/services/cron/service/index.ts) | Better than before, but product cron surfaces still outnumber native ones | Keep cron and heartbeat semantics aligned with `@elizaos/autonomous` trigger contracts |

## Browser, MCP, and Research

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Browser | `@elizaos/autonomous/services/browser-capture`, [`packages/agent/src/services/web/service.ts`](../packages/agent/src/services/web/service.ts) | Product web workflows still own most advanced behavior | Reuse exported native browser/capture contracts while keeping Doolittle's operator receipts |
| MCP | `@elizaos/autonomous/services/mcp-marketplace`, [`packages/agent/src/services/mcp/service.ts`](../packages/agent/src/services/mcp/service.ts) | Marketplace discovery is native, while local MCP execution remains product-owned | Push server discovery through the native marketplace helpers and keep execution receipts local until an execution plugin is a direct dependency |
| Skill synthesis and catalog | `@elizaos/skills`, `@elizaos/agent/services/skill-catalog-client`, `@elizaos/autonomous/services/skill-marketplace`, [`packages/agent/src/services/skills/service.ts`](../packages/agent/src/services/skills/service.ts) | Local/generated/catalog skills are still not unified enough under one native-first shape | Keep broad skill catalog behavior while using native skill manifests as the canonical shape |
| Trajectories | `@elizaos/core` trajectory context/logger APIs, `@elizaos/autonomous/runtime/trajectory-persistence`, [`packages/agent/src/services/trajectory/sdk-native.ts`](../packages/agent/src/services/trajectory/sdk-native.ts), [`packages/agent/src/services/trajectory/service/index.ts`](../packages/agent/src/services/trajectory/service/index.ts) | Research/operator flows still expose product trajectory concepts before native logger ownership in some places | Keep Doolittle-rich receipts while exporting Eliza-native training artifacts |

## Messaging and Control Plane

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Telegram | `@elizaos/plugin-telegram`, [`packages/agent/src/gateway/platforms/telegram-adapter/index.ts`](../packages/agent/src/gateway/platforms/telegram-adapter/index.ts) | Gateway and adapter logic still own more runtime behavior than the native messaging service | `@elizaos/plugin-telegram` |
| Discord | [`packages/agent/src/gateway/platforms/discord-adapter/index.ts`](../packages/agent/src/gateway/platforms/discord-adapter/index.ts) | Discord is gateway-owned until a direct native Discord dependency is added | Add an official native dependency only when the runtime uses it directly |
| Plugin inventory and tools | `@elizaos/agent/services/registry-client`, `@elizaos/autonomous/services/plugin-manager-types`, [`packages/agent/src/services/tools/service.ts`](../packages/agent/src/services/tools/service.ts) | Tool summaries and operator surfaces still partially recompute inventory instead of trusting registry-backed ownership | Let exported registry/plugin-manager contracts drive tool availability and `/status` inventory |

## Current Highest-Value Next Steps

1. Let exported registry and plugin-manager contracts drive more runtime/operator/tool inventory directly.
2. Let installed knowledge APIs, official embedding providers, rolodex, personality, and experience facets drive more memory and profile behavior directly.
3. Let exported coding-agent, orchestrator, sandbox, and terminal contracts drive more execution/delegation behavior directly.
4. Keep pushing Telegram further into native runtime ownership, and keep Discord clearly gateway-owned until a direct native dependency is added.
5. Keep expanding skills breadth and native skill catalog usage together.
