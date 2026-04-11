import { AUTOMATION_PLUGIN_CATALOG_SEEDS } from "./automation";
import { BROWSER_PLUGIN_CATALOG_SEEDS } from "./browser";
import { EXECUTION_PLUGIN_CATALOG_SEEDS } from "./execution";
import { getFoundationPluginCatalogSeeds } from "./foundation";
import { INTEGRATION_PLUGIN_CATALOG_SEEDS } from "./integration";
import { KNOWLEDGE_PLUGIN_CATALOG_SEEDS } from "./knowledge";
import { MEDIA_PLUGIN_CATALOG_SEEDS } from "./media";
import { MESSAGING_PLUGIN_CATALOG_SEEDS } from "./messaging";
import { PRODUCT_PLUGIN_CATALOG_SEEDS } from "./product";
import { PROVIDER_PLUGIN_CATALOG_SEEDS } from "./providers";
import { RESEARCH_PLUGIN_CATALOG_SEEDS } from "./research";
import type { NativePluginCatalogSeed } from "./types";

export function getNativePluginCatalogSeeds(
  foundationPackages: readonly string[],
): NativePluginCatalogSeed[] {
  return [
    ...getFoundationPluginCatalogSeeds(foundationPackages),
    ...PROVIDER_PLUGIN_CATALOG_SEEDS,
    ...MESSAGING_PLUGIN_CATALOG_SEEDS,
    ...KNOWLEDGE_PLUGIN_CATALOG_SEEDS,
    ...BROWSER_PLUGIN_CATALOG_SEEDS,
    ...MEDIA_PLUGIN_CATALOG_SEEDS,
    ...RESEARCH_PLUGIN_CATALOG_SEEDS,
    ...EXECUTION_PLUGIN_CATALOG_SEEDS,
    ...INTEGRATION_PLUGIN_CATALOG_SEEDS,
    ...AUTOMATION_PLUGIN_CATALOG_SEEDS,
    ...PRODUCT_PLUGIN_CATALOG_SEEDS,
  ];
}
