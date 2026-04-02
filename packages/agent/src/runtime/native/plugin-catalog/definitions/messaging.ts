import type { NativePluginCatalogSeed } from "./types";

export const MESSAGING_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "messaging.telegram",
    packageName: "@elizaos/plugin-telegram",
    category: "messaging",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "telegram",
    notes: "Official Telegram transport plugin.",
  },
  {
    id: "messaging.discord",
    packageName: "@elizaos/plugin-discord",
    category: "messaging",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "discord",
    notes:
      "Official Discord transport on the alpha line with Doolittle gateway mediation.",
  },
];
