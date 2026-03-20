import type { EnvConfig } from "@/types";
import { describeAutonomousAlignment } from "./autonomous-stack";

export type NativePluginCategory =
  | "foundation"
  | "providers"
  | "messaging"
  | "knowledge"
  | "execution"
  | "automation"
  | "product";

export interface NativePluginDescriptor {
  id: string;
  packageName: string;
  category: NativePluginCategory;
  source: "official" | "vendored" | "custom";
  enabled: boolean;
  notes: string;
}

function enabled(value: unknown): boolean {
  return Boolean(value);
}

export function getNativePluginCatalog(
  config: EnvConfig,
): NativePluginDescriptor[] {
  const autonomous = describeAutonomousAlignment();

  return [
    {
      id: "foundation.autonomous",
      packageName: autonomous.foundationPackages[0],
      category: "foundation",
      source: "official",
      enabled: true,
      notes: "Selective architectural source for native Eliza alignment.",
    },
    {
      id: "foundation.skills",
      packageName: autonomous.foundationPackages[1],
      category: "foundation",
      source: "official",
      enabled: true,
      notes: "First-party skills package used for native stack alignment.",
    },
    {
      id: "providers.sql",
      packageName: "@elizaos/plugin-sql",
      category: "providers",
      source: "official",
      enabled: true,
      notes: "Primary SQL persistence plugin on the current runtime line.",
    },
    {
      id: "providers.pdf",
      packageName: "@elizaos/plugin-pdf",
      category: "providers",
      source: "official",
      enabled: true,
      notes: "Official PDF ingestion plugin.",
    },
    {
      id: "providers.openai",
      packageName: "@elizaos/plugin-openai",
      category: "providers",
      source: "official",
      enabled: enabled(config.openAiApiKey),
      notes: "Official OpenAI provider plugin.",
    },
    {
      id: "providers.anthropic",
      packageName: "@elizaos/plugin-anthropic",
      category: "providers",
      source: "official",
      enabled: enabled(config.anthropicApiKey),
      notes: "Official Anthropic provider plugin.",
    },
    {
      id: "messaging.telegram",
      packageName: "@elizaos/plugin-telegram",
      category: "messaging",
      source: "official",
      enabled: enabled(config.telegramBotToken),
      notes: "Official Telegram transport plugin.",
    },
    {
      id: "messaging.discord",
      packageName: "@elizaos/plugin-discord",
      category: "messaging",
      source: "vendored",
      enabled: enabled(config.discordBotToken),
      notes:
        "Vendored official-style Discord transport adapted to the current runtime line.",
    },
    {
      id: "knowledge.knowledge",
      packageName: "@elizaos/plugin-knowledge",
      category: "knowledge",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style knowledge and ingestion service.",
    },
    {
      id: "knowledge.local-embedding",
      packageName: "@elizaos/plugin-local-embedding",
      category: "knowledge",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style local embedding service.",
    },
    {
      id: "knowledge.personality",
      packageName: "@elizaos/plugin-personality",
      category: "knowledge",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style personality service.",
    },
    {
      id: "knowledge.rolodex",
      packageName: "@elizaos/plugin-rolodex",
      category: "knowledge",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style profile memory and rolodex service.",
    },
    {
      id: "knowledge.experience",
      packageName: "@elizaos/plugin-experience",
      category: "knowledge",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style session and memory experience service.",
    },
    {
      id: "execution.shell",
      packageName: "@elizaos/plugin-shell",
      category: "execution",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style shell execution service.",
    },
    {
      id: "execution.coding-agent",
      packageName: "@elizaos/plugin-coding-agent",
      category: "execution",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style coding agent wrapper.",
    },
    {
      id: "execution.agent-orchestrator",
      packageName: "@elizaos/plugin-agent-orchestrator",
      category: "execution",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style orchestration wrapper.",
    },
    {
      id: "execution.plugin-manager",
      packageName: "@elizaos/plugin-plugin-manager",
      category: "execution",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style plugin manager service.",
    },
    {
      id: "automation.cron",
      packageName: "@elizaos/plugin-cron",
      category: "automation",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style cron workflow service.",
    },
    {
      id: "automation.agent-skills",
      packageName: "@elizaos/plugin-agent-skills",
      category: "automation",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style agent skills service.",
    },
    {
      id: "automation.trajectory-logger",
      packageName: "@elizaos/plugin-trajectory-logger",
      category: "automation",
      source: "vendored",
      enabled: true,
      notes: "Vendored official-style trajectory logger service.",
    },
    {
      id: "product.eliza-agent-runtime",
      packageName: "eliza-agent-runtime",
      category: "product",
      source: "custom",
      enabled: true,
      notes: "Product-specific Eliza Agent runtime layer.",
    },
  ];
}

export function groupNativePluginCatalog(
  catalog: NativePluginDescriptor[],
): Record<NativePluginCategory, NativePluginDescriptor[]> {
  return {
    foundation: catalog.filter((entry) => entry.category === "foundation"),
    providers: catalog.filter((entry) => entry.category === "providers"),
    messaging: catalog.filter((entry) => entry.category === "messaging"),
    knowledge: catalog.filter((entry) => entry.category === "knowledge"),
    execution: catalog.filter((entry) => entry.category === "execution"),
    automation: catalog.filter((entry) => entry.category === "automation"),
    product: catalog.filter((entry) => entry.category === "product"),
  };
}
