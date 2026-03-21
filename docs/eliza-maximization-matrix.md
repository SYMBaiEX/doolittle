# Eliza Maximization Matrix

Last updated: March 21, 2026

This matrix tracks where Eliza Agent is already strongly aligned with the
ElizaOS alpha stack and where native service ownership can still increase.

## Foundation

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Runtime core | `elizaos`, `@elizaos/core`, `@elizaos/agent`, `@elizaos/autonomous`, `@elizaos/skills` | Foundation packages still drive more audit and control-plane visibility than direct runtime behavior | `@elizaos/agent`, `@elizaos/autonomous`, `@elizaos/skills` |
| Native plugin assembly | [`packages/agent/src/runtime/native/plugin-registry.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/runtime/native/plugin-registry.ts) | Some plugin inventory and service ownership still flow through product summaries | `@elizaos/plugin-plugin-manager` |
| Agent SDK usage | [`packages/agent/src/runtime/native/agent-sdk.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/runtime/native/agent-sdk.ts), [`packages/agent/src/services/agent-sdk-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/agent-sdk-service.ts) | Registry/catalog/compat data is not yet the dominant source for all runtime/operator decisions | `@elizaos/agent` |

## Knowledge and Identity

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Knowledge ingestion | [`packages/plugins/plugin-knowledge`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-knowledge), [`packages/agent/src/services/documents-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/documents-service.ts) | Product memory and documents services still own too much of the ingest/recall flow | `@elizaos/plugin-knowledge` |
| Embeddings | [`packages/plugins/plugin-local-embedding`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-local-embedding) | Offline vector support exists, but higher-level recall flows do not consistently rely on the native service | `@elizaos/plugin-local-embedding` |
| Personality | [`packages/plugins/plugin-personality`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-personality), [`packages/agent/src/services/personality-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/personality-service.ts) | Personality state is still exposed through product wrappers first in some places | `@elizaos/plugin-personality` |
| User profiles and memory | [`packages/plugins/plugin-rolodex`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-rolodex), [`packages/agent/src/services/user-profile-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/user-profile-service.ts) | Rolodex-style native ownership is present but not yet dominant across all profile flows | `@elizaos/plugin-rolodex` |
| Session and experience | [`packages/plugins/plugin-experience`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-experience), [`packages/agent/src/services/session-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/session-service.ts) | Experience views still mix native and product summaries rather than preferring native end-to-end | `@elizaos/plugin-experience` |

## Execution and Orchestration

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Shell and execution | [`packages/plugins/plugin-shell`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-shell), [`packages/agent/src/services/terminal-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/terminal-service.ts) | Runtime and operator surfaces still sometimes treat shell as a product capability first | `@elizaos/plugin-shell` |
| Coding agent | [`packages/plugins/plugin-coding-agent`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-coding-agent) | Still vendored by design and not yet owning enough workflow behavior directly | `@elizaos/plugin-coding-agent` |
| Orchestrator | [`packages/plugins/plugin-agent-orchestrator`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-agent-orchestrator), [`packages/agent/src/services/delegation-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/delegation-service.ts) | Delegation still drives the mental model more than the native orchestrator contract | `@elizaos/plugin-agent-orchestrator` |
| Scheduling | [`packages/plugins/plugin-cron`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-cron), [`packages/agent/src/services/cron-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/cron-service.ts) | Better than before, but product cron surfaces still outnumber native ones | `@elizaos/plugin-cron`, `@elizaos/autonomous` |

## Browser, MCP, and Research

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Browser | [`packages/plugins/plugin-browser`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-browser), [`packages/agent/src/services/web-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/web-service.ts) | Native browser service exists, but product web workflows still own most advanced behavior | `@elizaos/plugin-browser` |
| MCP | [`packages/plugins/plugin-mcp`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-mcp), [`packages/agent/src/services/mcp-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/mcp-service.ts) | Native service exists, but MCP still routes through product descriptions and control surfaces often | `@elizaos/plugin-mcp` |
| Skill synthesis and catalog | [`packages/plugins/plugin-agent-skills`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-agent-skills), [`packages/agent/src/services/skills-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/skills-service.ts) | Local/generated/catalog skills are still not unified enough under one native-first shape | `@elizaos/plugin-agent-skills`, `@elizaos/skills` |
| Trajectories | [`packages/plugins/plugin-trajectory-logger`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-trajectory-logger), [`packages/agent/src/services/trajectory-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/trajectory-service.ts) | Research/operator flows still expose product trajectory concepts before native logger ownership in some places | `@elizaos/plugin-trajectory-logger` |

## Messaging and Control Plane

| Subsystem | Current Eliza usage | Not native enough yet | Next package or service to push |
|---|---|---|---|
| Telegram | [`@elizaos/plugin-telegram`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/package.json), [`packages/agent/src/gateway/platforms/telegram-adapter.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/gateway/platforms/telegram-adapter.ts) | Gateway and adapter logic still own more runtime behavior than the native messaging service | `@elizaos/plugin-telegram` |
| Discord | [`packages/plugins/plugin-discord`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-discord), [`packages/agent/src/gateway/platforms/discord-adapter.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/gateway/platforms/discord-adapter.ts) | Native transport ownership is stronger now, but the gateway still mediates a lot of behavior directly | `@elizaos/plugin-discord` |
| Plugin inventory and tools | [`packages/plugins/plugin-plugin-manager`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/plugins/plugin-plugin-manager), [`packages/agent/src/services/tools-service.ts`](/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/agent/src/services/tools-service.ts) | Tool summaries and operator surfaces still partially recompute inventory instead of trusting plugin-manager-backed ownership | `@elizaos/plugin-plugin-manager` |

## Current Highest-Value Next Steps

1. Let `plugin-manager` drive more runtime/operator/tool inventory directly.
2. Let `knowledge`, `local-embedding`, `rolodex`, `personality`, and `experience` drive more memory and profile behavior directly.
3. Let `agent-orchestrator`, `coding-agent`, and `shell` drive more execution/delegation behavior directly.
4. Keep pushing Telegram and Discord further into native runtime ownership.
5. Keep expanding skills breadth and native skill catalog usage together.
