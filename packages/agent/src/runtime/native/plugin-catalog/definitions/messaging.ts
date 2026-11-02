import type { NativePluginCatalogSeed } from "./types";

export const MESSAGING_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "messaging.discord",
    packageName: "@elizaos/plugin-discord",
    category: "messaging",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "discord",
    notes: "Official Discord message connector.",
  },
  {
    id: "messaging.slack",
    packageName: "@elizaos/plugin-slack",
    category: "messaging",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "slack",
    notes: "Official Slack message connector.",
  },
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
];
