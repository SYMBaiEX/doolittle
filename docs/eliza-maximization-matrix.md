# Eliza Maximization Matrix

Last updated: July 28, 2026

This matrix tracks where Doolittle is already strongly aligned with the
ElizaOS beta-targeted runtime stack and where native service ownership can still
increase.

## Foundation

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Runtime core | `@elizaos/core` `AgentRuntime` + `DefaultMessageService`, `@elizaos/agent`, `@elizaos/skills` | The product still owns the outer CLI/API/desktop harness and runtime boot policy | Evaluate the top-level `ElizaOS` harness only when it preserves Doolittle's provider and local-runtime guarantees |
| Native plugin assembly | [`packages/agent/src/runtime/native/plugin-registry/index.ts`](../packages/agent/src/runtime/native/plugin-registry/index.ts), `@elizaos/agent/services/registry-client` | Some plugin inventory and service ownership still flow through product summaries | Use exported registry/plugin-manager contracts before adding direct plugin-manager dependencies |
| Agent SDK usage | [`packages/agent/src/runtime/native/agent-sdk.ts`](../packages/agent/src/runtime/native/agent-sdk.ts), [`packages/agent/src/services/agent-sdk-service.ts`](../packages/agent/src/services/agent-sdk-service.ts) | Registry/catalog/compat data is not yet the dominant source for all runtime/operator decisions | `@elizaos/agent` |

## Knowledge and Identity

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Knowledge ingestion | The registered `@elizaos/plugin-pdf` `pdf` service owns PDF conversion; [`packages/agent/src/services/documents-service.ts`](../packages/agent/src/services/documents-service.ts) only resolves workspace paths/base64 and projects extraction into product UX | The installed runtime does not expose a generic document-memory knowledge service; Doolittle file memory remains product-owned instead of pretending an unpublished service exists | Keep PDF extraction service-native; adopt a generic knowledge service only when a direct registered dependency provides its public contract |
| Embeddings | `@elizaos/plugin-ollama`, ElizaOS local embedding support through installed provider packages | Doolittle should keep embedding ownership in official SDK/provider packages instead of workspace shadow packages | `@elizaos/plugin-ollama` plus exported local embedding support when it becomes a direct dependency |
| Personality | [`packages/plugins/doolittle-plugin/identity/personality`](../packages/plugins/doolittle-plugin/identity/personality), [`packages/agent/src/services/personality-service.ts`](../packages/agent/src/services/personality-service.ts) | Doolittle keeps product-specific personality behavior while exposing it as an Eliza service | Doolittle identity facet inside the consolidated product plugin; upstream only when ElizaOS publishes a matching service contract |
| User profiles and memory | [`packages/plugins/doolittle-plugin/identity/rolodex`](../packages/plugins/doolittle-plugin/identity/rolodex), [`packages/agent/src/services/user-profile/service/index.ts`](../packages/agent/src/services/user-profile/service/index.ts) | Profile flows are Doolittle-owned but exposed through a native service boundary | Doolittle profile facet inside the consolidated product plugin; upstream only when ElizaOS publishes a matching service contract |
| Session and experience | [`packages/plugins/doolittle-plugin/identity/experience`](../packages/plugins/doolittle-plugin/identity/experience), [`packages/agent/src/services/session/service/index.ts`](../packages/agent/src/services/session/service/index.ts) | Experience views are Doolittle-owned but exposed through a native service boundary | Doolittle experience facet inside the consolidated product plugin; upstream only when ElizaOS publishes a matching service contract |

## Execution and Orchestration

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Shell and execution | Eliza action contracts and `ActionResult`, `@elizaos/agent/services/sandbox-manager`, [`packages/agent/src/services/terminal/service.ts`](../packages/agent/src/services/terminal/service.ts) | Doolittle retains approval, backend selection, and operator receipts around SDK execution primitives | Keep product policy at the boundary and avoid reintroducing a parallel execution lifecycle |
| Coding agent | [`packages/plugins/doolittle-plugin/coding-agent`](../packages/plugins/doolittle-plugin/coding-agent), native action/provider/service registration | Doolittle coding behavior remains product-owned where the beta SDK has no matching high-level workflow | Keep repository UX local while using published action, service, sandbox, and orchestrator contracts |
| Orchestrator | [`@elizaos/plugin-agent-orchestrator`](https://www.npmjs.com/package/@elizaos/plugin-agent-orchestrator), [`packages/agent/src/services/delegation/service/index.ts`](../packages/agent/src/services/delegation/service/index.ts) | Official plugin owns the native service boundary; Doolittle retains product delegation and supervision UX | Extend through the official service contract rather than restoring the removed local shadow |
| Scheduling | `@elizaos/agent/triggers/runtime`, `@elizaos/agent/triggers/scheduling`, [`packages/plugins/doolittle-plugin/trigger-runtime-service.ts`](../packages/plugins/doolittle-plugin/trigger-runtime-service.ts) | Trigger Tasks are canonical; Doolittle still owns operator-friendly automation definitions, conditions, actions, and receipts | Keep product automation UX projected onto SDK tasks and upstream reusable receipt fields when available |

## Browser, MCP, and Research

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Browser | Eliza browser service boundary, [`packages/agent/src/services/web/service.ts`](../packages/agent/src/services/web/service.ts), explicit web and research actions | Product web workflows still own capture and evidence behavior because the installed beta exposes no adopted high-level capture service | Keep web access action-native and preserve URL, approval, and evidence policy at the product boundary |
| MCP | `@elizaos/agent/services/mcp-marketplace`, [`packages/agent/src/services/mcp/service.ts`](../packages/agent/src/services/mcp/service.ts) | Marketplace discovery is native, while local MCP execution remains product-owned | Push server discovery through the native marketplace helpers and keep execution receipts local until an execution plugin is a direct dependency |
| Skill synthesis and catalog | `@elizaos/skills` and the official agent-skills service own the loaded inventory used by prompts, diagnostics, status, and automations; [`packages/agent/src/services/skills/service.ts`](../packages/agent/src/services/skills/service.ts) supplies matching workspace metadata and startup fallback | Marketplace compatibility and generated-skill distribution are not yet unified under one published beta contract | Keep native skill manifests canonical and retire compatibility adapters as the SDK publishes equivalent exports |
| Trajectories | `@elizaos/core` trajectory context/logger APIs, `@elizaos/agent/runtime/trajectory-persistence`, [`packages/agent/src/services/trajectory/sdk-native.ts`](../packages/agent/src/services/trajectory/sdk-native.ts), [`packages/agent/src/services/trajectory/service/index.ts`](../packages/agent/src/services/trajectory/service/index.ts) | Research/operator flows still expose product trajectory concepts before native logger ownership in some places | Keep Doolittle-rich receipts while exporting Eliza-native training artifacts |

## Messaging and Control Plane

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Telegram | `@elizaos/plugin-telegram`, [`packages/agent/src/gateway/platforms/telegram-adapter/index.ts`](../packages/agent/src/gateway/platforms/telegram-adapter/index.ts) | Gateway and adapter logic still own more runtime behavior than the native messaging service | `@elizaos/plugin-telegram` |
| Discord | [`packages/agent/src/gateway/platforms/discord-adapter/index.ts`](../packages/agent/src/gateway/platforms/discord-adapter/index.ts) | Discord is gateway-owned until a direct native Discord dependency is added | Add an official native dependency only when the runtime uses it directly |
| Plugin inventory and tools | Eliza's registered actions own executable tool availability through [`service-resolution/tool-inventory.ts`](../packages/agent/src/runtime/native/service-bridge/service-resolution/tool-inventory.ts); `@elizaos/agent/services/registry-client` and the plugin manager own plugin inventory; [`packages/agent/src/services/tools/service.ts`](../packages/agent/src/services/tools/service.ts) supplies control-plane metadata and startup fallback | The product catalog still describes non-action control-plane capabilities that have no direct registered-action equivalent | Keep executable availability action-native and preserve the product catalog only as labeled metadata/fallback |

## Current Highest-Value Next Steps

1. Keep PDF extraction on the registered native service and evaluate the official knowledge graph only for entity/relationship use cases it actually implements.
2. Keep execution, automation, orchestration, and mutation proof on their SDK-owned contracts; remove compatibility facades when their final callers disappear.
3. Keep Telegram moving into native runtime ownership, and keep Discord clearly gateway-owned until a direct native dependency is installed.
4. Retire skill marketplace compatibility code as `@elizaos/skills` and the official agent-skills plugin publish matching catalog APIs.
