import type { NativePluginCatalogSeed } from "./types";

export const EXECUTION_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "execution.shell",
    packageName: "@elizaos/plugin-shell",
    category: "execution",
    source: "official",
    kind: "adapter",
    maturity: "production",
    enablement: "always",
    notes: "Official shell execution service on the alpha line.",
  },
  {
    id: "execution.e2b",
    packageName: "@elizaos/plugin-e2b",
    category: "execution",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Official E2B sandbox service for secure code execution and autocoder support.",
  },
  {
    id: "execution.forms",
    packageName: "@elizaos/plugin-forms",
    category: "execution",
    source: "vendored",
    kind: "adapter",
    maturity: "alpha",
    persistence: "injected",
    enablement: "always",
    notes:
      "Workspace-native forms plugin used by autocoder and guided workflow flows.",
  },
  {
    id: "execution.coding-agent",
    packageName: "@elizaos/plugin-coding-agent",
    category: "execution",
    source: "vendored",
    kind: "vendored",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Vendored coding agent wrapper kept local for runtime-specific wiring.",
  },
  {
    id: "execution.agent-orchestrator",
    packageName: "@elizaos/plugin-agent-orchestrator",
    category: "execution",
    source: "vendored",
    kind: "vendored",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Vendored orchestration wrapper kept local for runtime-specific wiring.",
  },
  {
    id: "execution.plugin-manager",
    packageName: "@elizaos/plugin-plugin-manager",
    category: "execution",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes: "Official plugin manager service on the alpha line.",
  },
  {
    id: "execution.planning",
    packageName: "@elizaos/plugin-planning",
    category: "execution",
    source: "vendored",
    kind: "adapter",
    maturity: "alpha",
    persistence: "injected",
    enablement: "always",
    notes:
      "Workspace-native planning plugin linking native delegation tasks and workflow graphs.",
  },
];
