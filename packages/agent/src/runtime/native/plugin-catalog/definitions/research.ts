import type { NativePluginCatalogSeed } from "./types";

export const RESEARCH_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "research.action-bench",
    packageName: "@doolittle/plugin-action-bench",
    category: "research",
    source: "vendored",
    kind: "vendored",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Doolittle-owned Eliza benchmark plugin for evaluation and coverage drills.",
  },
  {
    id: "research.autocoder",
    packageName: "@doolittle/plugin-autocoder",
    category: "research",
    source: "vendored",
    kind: "adapter",
    maturity: "experimental",
    persistence: "injected",
    enablement: "always",
    notes:
      "Doolittle-owned Eliza plugin for research, planning, GitHub, and secrets-backed workflows. Execution remains experimental and planning-only flows are explicitly non-mutating.",
  },
];
