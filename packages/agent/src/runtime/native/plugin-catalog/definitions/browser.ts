import type { NativePluginCatalogSeed } from "./types";

export const BROWSER_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "browser.browser",
    packageName: "@elizaos/plugin-browser",
    category: "browser",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    persistence: "injected",
    enablement: "always",
    notes:
      "Browser plugin layered onto Doolittle web automation flows with pixel capture when a browser backend is available and placeholder fallback otherwise.",
  },
];
