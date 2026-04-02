import type { NativePluginCatalogSeed } from "./types";

export const RESEARCH_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "research.action-bench",
    packageName: "@elizaos/plugin-action-bench",
    category: "research",
    source: "vendored",
    kind: "vendored",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Workspace-native benchmark plugin for evaluation and coverage drills.",
  },
  {
    id: "research.autocoder",
    packageName: "@elizaos/plugin-autocoder",
    category: "research",
    source: "vendored",
    kind: "adapter",
    maturity: "experimental",
    persistence: "injected",
    enablement: "always",
    notes:
      "Workspace-native autocoder plugin for research, planning, GitHub, and secrets-backed workflows. Execution remains experimental and planning-only flows are explicitly non-mutating.",
  },
];
