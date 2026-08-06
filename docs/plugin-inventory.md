# Plugin Inventory

This file is generated from the native runtime plugin catalog plus workspace package inspection.
Do not edit it by hand; run `nub scripts/sync-doc-truth.ts --write`.

Canonical runtime source: `@/runtime/native/plugin-catalog.ts`.

| Runtime ID | Package | Category | Kind | Maturity | Persistence | Source | Workspace Path | Owner | Publish Intent | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| foundation.agent | @elizaos/agent | foundation | vendored | alpha | none | official | (external) | upstream | upstream-dependency | external | Standalone Eliza agent package used for native runtime and ecosystem alignment. |
| foundation.autonomous | elizaos | foundation | vendored | alpha | none | official | (external) | upstream | upstream-dependency | external | Selective architectural source for native Eliza alignment. |
| foundation.skills | @elizaos/skills | foundation | vendored | alpha | none | official | (external) | upstream | upstream-dependency | external | First-party skills package used for native stack alignment. |
| providers.sql | @elizaos/plugin-sql | providers | provider | production | none | official | packages/plugins/plugin-sql | doolittle-runtime | public-provider-bridge | covered | Primary SQL persistence plugin on the current runtime line. |
| providers.pdf | @elizaos/plugin-pdf | providers | provider | production | none | official | (external) | upstream | upstream-dependency | external | Official PDF ingestion plugin. |
| providers.elizacloud | @elizaos/plugin-elizacloud | providers | provider | alpha | none | custom | packages/plugins/plugin-elizacloud | doolittle-runtime | public-provider-bridge | covered | Doolittle-owned Eliza Cloud provider bridge for managed ElizaOS inference and cloud defaults. |
| providers.ollama | @elizaos/plugin-ollama | providers | provider | alpha | none | official | (external) | upstream | upstream-dependency | external | Official local/self-hosted Ollama provider for offline text, object, and embedding model routing. |
| providers.codex | @elizaos/plugin-codex | providers | provider | alpha | none | custom | packages/plugins/plugin-codex | doolittle-runtime | public-provider-bridge | covered | Doolittle-owned Codex provider bridge for ChatGPT-backed Codex workflows. |
| providers.claude-code | @elizaos/plugin-claude-code | providers | provider | alpha | none | custom | packages/plugins/plugin-claude-code | doolittle-runtime | public-provider-bridge | covered | Doolittle-owned Claude Code provider bridge for linked-account Claude workflows. |
| providers.devin | @elizaos/plugin-devin | providers | provider | alpha | none | custom | packages/plugins/plugin-devin | doolittle-runtime | public-provider-bridge | covered | Doolittle-owned Devin CLI provider bridge for SWE model workflows. |
| providers.openai | @elizaos/plugin-openai | providers | provider | production | none | official | (external) | upstream | upstream-dependency | external | Official OpenAI provider plugin. |
| providers.anthropic | @elizaos/plugin-anthropic | providers | provider | production | none | official | (external) | upstream | upstream-dependency | external | Official Anthropic provider plugin. |
| messaging.telegram | @elizaos/plugin-telegram | messaging | adapter | alpha | none | official | (external) | upstream | upstream-dependency | external | Official Telegram transport plugin. |
| research.action-bench | @doolittle/plugin-action-bench | research | vendored | alpha | none | vendored | packages/plugins/doolittle-plugin | doolittle-runtime | vendored-workspace-package | covered | Doolittle-owned Eliza benchmark plugin for evaluation and coverage drills. |
| research.autocoder | @doolittle/plugin-autocoder | research | adapter | experimental | injected | vendored | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle-owned Eliza plugin for research, planning, GitHub, and secrets-backed workflows. Execution remains experimental and planning-only flows are explicitly non-mutating. |
| execution.local-sandbox | @doolittle/plugin-local-sandbox | execution | adapter | alpha | none | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle local sandbox service with E2B-compatible methods for autocoder support. |
| execution.forms | @doolittle/plugin-forms | execution | adapter | alpha | injected | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle forms adapter used by autocoder and guided workflow flows. Consolidated into doolittle-plugin. |
| execution.coding-agent | @doolittle/plugin-coding-agent | execution | adapter | alpha | none | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle coding workspace adapter for project files, repository inspection, and shell execution. Delegation remains owned by the official agent orchestrator. |
| execution.agent-orchestrator | @elizaos/plugin-agent-orchestrator | execution | adapter | alpha | none | official | (external) | upstream | upstream-dependency | external | Official agent orchestrator registered for native delegation and worker supervision. |
| execution.planning | @doolittle/plugin-planning | execution | adapter | alpha | injected | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-adapter | covered | Doolittle planning adapter linking native delegation tasks and workflow graphs. Consolidated into doolittle-plugin. |
| product.doolittle-runtime | doolittle-runtime | product | adapter | alpha | injected | custom | packages/plugins/doolittle-plugin | doolittle-runtime | internal-product-layer | covered | Product-specific Doolittle runtime layer. |
