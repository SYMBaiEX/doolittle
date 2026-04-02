import type { NativePluginCatalogSeed } from "./types";

export const INTEGRATION_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "integration.mcp",
    packageName: "@elizaos/plugin-mcp",
    category: "integration",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Official MCP plugin layered onto Doolittle discovery and invocation.",
  },
];
