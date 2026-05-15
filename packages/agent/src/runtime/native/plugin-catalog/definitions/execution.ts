import type { NativePluginCatalogSeed } from "./types";

export const EXECUTION_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
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
      "Doolittle coding agent service bridging workspace, repository, shell, and delegation. Consolidated into doolittle-plugin.",
  },
  {
    id: "execution.agent-orchestrator",
    packageName: "@doolittle/plugin-agent-orchestrator",
    category: "execution",
    source: "custom",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Doolittle delegation orchestrator with supervision and queue management. Consolidated into doolittle-plugin.",
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
