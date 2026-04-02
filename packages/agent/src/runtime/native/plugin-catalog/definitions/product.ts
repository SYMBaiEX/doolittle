import type { NativePluginCatalogSeed } from "./types";

export const PRODUCT_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "product.doolittle-runtime",
    packageName: "doolittle-runtime",
    category: "product",
    source: "custom",
    kind: "adapter",
    maturity: "alpha",
    persistence: "injected",
    enablement: "always",
    notes: "Product-specific Doolittle runtime layer.",
  },
];
