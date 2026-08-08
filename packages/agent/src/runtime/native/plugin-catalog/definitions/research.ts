import type { NativePluginCatalogSeed } from "./types";

export const RESEARCH_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
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
      "Doolittle-owned Eliza plugin for research, planning, and GitHub workflows; credentials resolve through the official Eliza secrets service. Execution remains experimental and planning-only flows are explicitly non-mutating.",
  },
];
