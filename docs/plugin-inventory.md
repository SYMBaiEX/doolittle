# Plugin Inventory

This file is generated from the native runtime plugin catalog plus workspace package inspection.
Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.

Canonical runtime source: `@/runtime/native/plugin-catalog.ts`.

| Runtime ID | Package | Category | Kind | Maturity | Persistence | Source | Workspace Path | Owner | Publish Intent | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| foundation.agent | @elizaos/agent | foundation | vendored | alpha | none | official | (external) | upstream | upstream-dependency | external | Standalone Eliza agent package used for native runtime and ecosystem alignment. |
| foundation.autonomous | @elizaos/autonomous | foundation | vendored | alpha | none | official | (external) | upstream | upstream-dependency | external | Selective architectural source for native Eliza alignment. |
| foundation.skills | @elizaos/skills | foundation | vendored | alpha | none | official | (external) | upstream | upstream-dependency | external | First-party skills package used for native stack alignment. |
| providers.sql | @elizaos/plugin-sql | providers | provider | production | none | official | packages/plugins/plugin-sql | doolittle-runtime | public-provider-bridge | covered | Primary SQL persistence plugin on the current runtime line. |
| providers.pdf | @elizaos/plugin-pdf | providers | provider | production | none | official | (external) | upstream | upstream-dependency | external | Official PDF ingestion plugin. |
| providers.elizacloud | @elizaos/plugin-elizacloud | providers | provider | alpha | none | custom | packages/plugins/plugin-elizacloud | doolittle-runtime | public-provider-bridge | covered | Workspace-native Eliza Cloud provider plugin for managed ElizaOS inference and cloud-native defaults. |
| providers.ollama | @elizaos/plugin-ollama | providers | provider | alpha | none | official | (external) | upstream | upstream-dependency | external | Official local/self-hosted Ollama provider for offline text, object, and embedding model routing. |
| providers.codex | @elizaos/plugin-codex | providers | provider | alpha | none | custom | packages/plugins/plugin-codex | doolittle-runtime | public-provider-bridge | covered | Workspace-native Codex provider plugin for ChatGPT-backed Codex workflows. |
| providers.claude-code | @elizaos/plugin-claude-code | providers | provider | alpha | none | custom | packages/plugins/plugin-claude-code | doolittle-runtime | public-provider-bridge | covered | Workspace-native Claude Code provider plugin for Claude-native workflows. |
| providers.devin | @elizaos/plugin-devin | providers | provider | alpha | none | custom | packages/plugins/plugin-devin | doolittle-runtime | public-provider-bridge | covered | Workspace-native Devin CLI provider plugin for SWE model workflows. |
| providers.openai | @elizaos/plugin-openai | providers | provider | production | none | official | (external) | upstream | upstream-dependency | external | Official OpenAI provider plugin. |
| providers.anthropic | @elizaos/plugin-anthropic | providers | provider | production | none | official | (external) | upstream | upstream-dependency | external | Official Anthropic provider plugin. |
| messaging.telegram | @elizaos/plugin-telegram | messaging | adapter | alpha | none | official | (external) | upstream | upstream-dependency | external | Official Telegram transport plugin. |
| research.action-bench | @doolittle/plugin-action-bench | research | vendored | alpha | none | vendored | packages/plugins/doolittle-plugin | doolittle-runtime | vendored-workspace-package | covered | Workspace-native benchmark plugin for evaluation and coverage drills. |
| research.autocoder | @doolittle/plugin-autocoder | research | adapter | experimental | injected | vendored | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Workspace-native autocoder plugin for research, planning, GitHub, and secrets-backed workflows. Execution remains experimental and planning-only flows are explicitly non-mutating. |
| execution.local-sandbox | @doolittle/plugin-local-sandbox | execution | adapter | alpha | none | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle local sandbox service with E2B-compatible methods for autocoder support. |
| execution.forms | @doolittle/plugin-forms | execution | adapter | alpha | injected | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle forms adapter used by autocoder and guided workflow flows. Consolidated into doolittle-plugin. |
| execution.coding-agent | @doolittle/plugin-coding-agent | execution | adapter | alpha | none | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle coding agent service bridging workspace, repository, shell, and delegation. Consolidated into doolittle-plugin. |
| execution.agent-orchestrator | @doolittle/plugin-agent-orchestrator | execution | adapter | alpha | none | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle delegation orchestrator with supervision and queue management. Consolidated into doolittle-plugin. |
| execution.planning | @doolittle/plugin-planning | execution | adapter | alpha | injected | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle planning adapter linking native delegation tasks and workflow graphs. Consolidated into doolittle-plugin. |
| product.doolittle-runtime | doolittle-runtime | product | adapter | alpha | injected | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-product-layer | covered | Product-specific Doolittle runtime layer. |
