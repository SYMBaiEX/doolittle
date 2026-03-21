import type { EnvConfig } from "@/types";
import { describeAutonomousAlignment } from "./autonomous-stack";

export type NativePluginCategory =
  | "foundation"
  | "providers"
  | "messaging"
  | "knowledge"
  | "browser"
  | "media"
  | "research"
  | "execution"
  | "integration"
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
      id: "foundation.agent",
      packageName: autonomous.foundationPackages[0],
      category: "foundation",
      source: "official",
      enabled: true,
      notes:
        "Standalone Eliza agent package used for native runtime and ecosystem alignment.",
    },
    {
      id: "foundation.autonomous",
      packageName: autonomous.foundationPackages[1],
      category: "foundation",
      source: "official",
      enabled: true,
      notes: "Selective architectural source for native Eliza alignment.",
    },
    {
      id: "foundation.skills",
      packageName: autonomous.foundationPackages[2],
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
      source: "official",
      enabled: enabled(config.discordBotToken),
      notes:
        "Official Discord transport on the alpha line with Eliza Agent gateway mediation.",
    },
    {
      id: "knowledge.knowledge",
      packageName: "@elizaos/plugin-knowledge",
      category: "knowledge",
      source: "official",
      enabled: true,
      notes: "Official knowledge and ingestion service on the alpha line.",
    },
    {
      id: "knowledge.local-embedding",
      packageName: "@elizaos/plugin-local-embedding",
      category: "knowledge",
      source: "official",
      enabled: true,
      notes: "Official local embedding service on the alpha line.",
    },
    {
      id: "knowledge.personality",
      packageName: "@elizaos/plugin-personality",
      category: "knowledge",
      source: "official",
      enabled: true,
      notes: "Official personality service on the alpha line.",
    },
    {
      id: "knowledge.rolodex",
      packageName: "@elizaos/plugin-rolodex",
      category: "knowledge",
      source: "official",
      enabled: true,
      notes: "Official profile memory and rolodex service on the alpha line.",
    },
    {
      id: "knowledge.experience",
      packageName: "@elizaos/plugin-experience",
      category: "knowledge",
      source: "official",
      enabled: true,
      notes:
        "Official session and memory experience service on the alpha line.",
    },
    {
      id: "browser.browser",
      packageName: "@elizaos/plugin-browser",
      category: "browser",
      source: "official",
      enabled: true,
      notes:
        "Official browser plugin layered onto Eliza Agent web automation flows.",
    },
    {
      id: "media.tts",
      packageName: "@elizaos/plugin-tts",
      category: "media",
      source: "official",
      enabled: enabled(config.falApiKey),
      notes:
        "Official TTS plugin for voice generation on the alpha line when FAL is configured.",
    },
    {
      id: "execution.shell",
      packageName: "@elizaos/plugin-shell",
      category: "execution",
      source: "official",
      enabled: true,
      notes: "Official shell execution service on the alpha line.",
    },
    {
      id: "execution.coding-agent",
      packageName: "@elizaos/plugin-coding-agent",
      category: "execution",
      source: "vendored",
      enabled: true,
      notes:
        "Vendored coding agent wrapper kept local for runtime-specific wiring.",
    },
    {
      id: "execution.agent-orchestrator",
      packageName: "@elizaos/plugin-agent-orchestrator",
      category: "execution",
      source: "vendored",
      enabled: true,
      notes:
        "Vendored orchestration wrapper kept local for runtime-specific wiring.",
    },
    {
      id: "execution.plugin-manager",
      packageName: "@elizaos/plugin-plugin-manager",
      category: "execution",
      source: "official",
      enabled: true,
      notes: "Official plugin manager service on the alpha line.",
    },
    {
      id: "integration.mcp",
      packageName: "@elizaos/plugin-mcp",
      category: "integration",
      source: "official",
      enabled: true,
      notes:
        "Official MCP plugin layered onto Eliza Agent discovery and invocation.",
    },
    {
      id: "automation.cron",
      packageName: "@elizaos/plugin-cron",
      category: "automation",
      source: "official",
      enabled: true,
      notes: "Official cron workflow service on the alpha line.",
    },
    {
      id: "automation.agent-skills",
      packageName: "@elizaos/plugin-agent-skills",
      category: "automation",
      source: "official",
      enabled: true,
      notes: "Official agent skills service on the alpha line.",
    },
    {
      id: "automation.trajectory-logger",
      packageName: "@elizaos/plugin-trajectory-logger",
      category: "automation",
      source: "official",
      enabled: true,
      notes: "Official trajectory logger service on the alpha line.",
    },
    {
      id: "research.action-bench",
      packageName: "@elizaos/plugin-action-bench",
      category: "research",
      source: "official",
      enabled: true,
      notes:
        "Official action benchmark plugin for agent evaluation and coverage drills.",
    },
    {
      id: "research.autocoder",
      packageName: "@elizaos/plugin-autocoder",
      category: "research",
      source: "official",
      enabled: true,
      notes:
        "Official autocoder plugin for code generation and SWE-bench style evaluation workflows.",
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
    browser: catalog.filter((entry) => entry.category === "browser"),
    media: catalog.filter((entry) => entry.category === "media"),
    research: catalog.filter((entry) => entry.category === "research"),
    execution: catalog.filter((entry) => entry.category === "execution"),
    integration: catalog.filter((entry) => entry.category === "integration"),
    automation: catalog.filter((entry) => entry.category === "automation"),
    product: catalog.filter((entry) => entry.category === "product"),
  };
}
