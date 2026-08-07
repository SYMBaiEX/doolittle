import type { NativePluginCatalogSeed } from "./types";

export function getFoundationPluginCatalogSeeds(
  foundationPackages: readonly string[],
): NativePluginCatalogSeed[] {
  return [
    {
      id: "foundation.agent",
      packageName: foundationPackages[0] ?? "@elizaos/agent",
      category: "foundation",
      source: "official",
      kind: "vendored",
      maturity: "alpha",
      enablement: "always",
      notes:
        "Standalone Eliza agent package used for native runtime and ecosystem alignment.",
    },
    {
      id: "foundation.autonomous",
      packageName: foundationPackages[1] ?? "elizaos",
      category: "foundation",
      source: "official",
      kind: "vendored",
      maturity: "alpha",
      enablement: "always",
      notes: "Selective architectural source for native Eliza alignment.",
    },
    {
      id: "foundation.skills",
      packageName: foundationPackages[2] ?? "@elizaos/skills",
      category: "foundation",
      source: "official",
      kind: "vendored",
      maturity: "alpha",
      enablement: "always",
      notes: "First-party skills package used for native stack alignment.",
    },
    {
      id: "foundation.secrets",
      packageName: "@elizaos/core",
      category: "foundation",
      source: "official",
      kind: "adapter",
      maturity: "alpha",
      persistence: "injected",
      enablement: "always",
      notes:
        "Official encrypted global, world, and user secrets lifecycle with a namespaced Doolittle Vault persistence mirror.",
    },
  ];
}
