import type { NativePluginCatalogSeed } from "./types";

export const EXECUTION_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "execution.native-forms",
    packageName: "@elizaos/plugin-form",
    category: "execution",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    persistence: "injected",
    notes:
      "Official conversational FormService with the FORM restore action and Doolittle default template bridge.",
  },
  {
    id: "execution.local-sandbox",
    packageName: "@doolittle/plugin-local-sandbox",
    category: "execution",
    source: "custom",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Doolittle local sandbox service with E2B-compatible methods for autocoder support.",
  },
  {
    id: "execution.github",
    packageName: "@elizaos/plugin-github",
    category: "execution",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Official GitHub PR, issue, and notification actions; Doolittle repository creation and deletion remain planned-only.",
  },
  {
    id: "execution.forms",
    packageName: "@doolittle/plugin-forms",
    category: "execution",
    source: "custom",
    kind: "adapter",
    maturity: "alpha",
    persistence: "injected",
    enablement: "always",
    notes:
      "Doolittle forms adapter used by autocoder and guided workflow flows. Consolidated into doolittle-plugin.",
  },
  {
    id: "execution.coding-agent",
    packageName: "@doolittle/plugin-coding-agent",
    category: "execution",
    source: "custom",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Doolittle coding workspace adapter for project files, repository inspection, and shell execution. Delegation remains owned by the official agent orchestrator.",
  },
  {
    id: "execution.agent-orchestrator",
    packageName: "@elizaos/plugin-agent-orchestrator",
    category: "execution",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Official agent orchestrator registered for native delegation and worker supervision.",
  },
  {
    id: "execution.mcp",
    packageName: "@elizaos/plugin-mcp",
    category: "execution",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Official MCP service, provider, and action for validated persistent server connections, resources, discovery, and tool calls.",
  },
  {
    id: "execution.planning",
    packageName: "@doolittle/plugin-planning",
    category: "execution",
    source: "custom",
    kind: "adapter",
    maturity: "alpha",
    persistence: "injected",
    enablement: "always",
    notes:
      "Doolittle planning adapter linking native delegation tasks and workflow graphs. Consolidated into doolittle-plugin.",
  },
];
