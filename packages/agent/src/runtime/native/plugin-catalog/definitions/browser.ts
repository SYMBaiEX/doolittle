import type { NativePluginCatalogSeed } from "./types";

export const BROWSER_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "browser.official",
    packageName: "@elizaos/plugin-browser",
    category: "browser",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes:
      "Official BrowserService dispatcher with Doolittle evidence registered as an explicit target.",
  },
];
