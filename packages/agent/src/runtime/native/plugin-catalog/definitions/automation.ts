import type { NativePluginCatalogSeed } from "./types";

export const AUTOMATION_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "automation.cron",
    packageName: "@elizaos/plugin-cron",
    category: "automation",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes: "Official cron workflow service on the alpha line.",
  },
  {
    id: "automation.agent-skills",
    packageName: "@elizaos/plugin-agent-skills",
    category: "automation",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes: "Official agent skills service on the alpha line.",
  },
  {
    id: "automation.trajectory-logger",
    packageName: "@elizaos/plugin-trajectory-logger",
    category: "automation",
    source: "official",
    kind: "adapter",
    maturity: "alpha",
    enablement: "always",
    notes: "Official trajectory logger service on the alpha line.",
  },
];
