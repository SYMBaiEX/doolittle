import { KNOWLEDGE_GRAPH_SERVICE } from "@elizaos/agent/services/knowledge-graph/index";
import type { NativeServices } from "./service-bridge/runtime-contracts";
import {
  AGENT_SKILLS_SERVICE,
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
  ORCHESTRATOR_TASK_SERVICE,
  PDF_SERVICE,
} from "./service-bridge/runtime-contracts";

export type NativeServiceRegistryGroup =
  | "officialBacked"
  | "customEliza"
  | "productOrchestration";

export interface ServiceRegistryDefinition {
  service: string;
  group: NativeServiceRegistryGroup;
}

export interface ServiceResolutionDefinition {
  capability: string;
  nativeKey: keyof NativeServices;
  nativeService: string;
  productServices: readonly string[];
  fallback: string;
}

/**
 * Authoritative ownership manifest for Doolittle's product services.
 *
 * Registry summaries and live native-service resolution both derive from this
 * module so architectural ownership cannot drift across diagnostics surfaces.
 */
export const SERVICE_REGISTRY_DEFINITIONS: readonly ServiceRegistryDefinition[] =
  [
    { service: "documents", group: "officialBacked" },
    { service: "mcp", group: "officialBacked" },
    { service: "acp", group: "officialBacked" },
    { service: "web", group: "officialBacked" },
    { service: "media", group: "officialBacked" },
    { service: "userProfiles", group: "officialBacked" },
    { service: "personalities", group: "officialBacked" },
    { service: "skills", group: "officialBacked" },
    { service: "skillSynthesis", group: "officialBacked" },
    { service: "trajectories", group: "officialBacked" },
    { service: "delegation", group: "officialBacked" },
    { service: "memory", group: "customEliza" },
    { service: "sessions", group: "officialBacked" },
    { service: "cron", group: "officialBacked" },
    { service: "workspace", group: "customEliza" },
    { service: "terminal", group: "customEliza" },
    { service: "repository", group: "customEliza" },
    { service: "gatewaySessions", group: "customEliza" },
    { service: "delivery", group: "customEliza" },
    { service: "pairing", group: "customEliza" },
    { service: "hooks", group: "customEliza" },
    { service: "contextFiles", group: "customEliza" },
    { service: "settings", group: "customEliza" },
    { service: "tools", group: "customEliza" },
    { service: "diagnostics", group: "customEliza" },
    { service: "operator", group: "productOrchestration" },
    { service: "gatewayConfig", group: "productOrchestration" },
  ];

export const SERVICE_RESOLUTION_DEFINITIONS: readonly ServiceResolutionDefinition[] =
  [
    {
      capability: "memoryStorage",
      nativeKey: "memoryStorage",
      nativeService: "memoryStorage",
      productServices: ["sessions"],
      fallback: "unavailable until the Eliza memory storage adapter loads",
    },
    {
      capability: "knowledgeGraph",
      nativeKey: "knowledgeGraph",
      nativeService: KNOWLEDGE_GRAPH_SERVICE,
      productServices: [],
      fallback: "unavailable until the official Eliza foundation plugin loads",
    },
    {
      capability: "pdf",
      nativeKey: "pdf",
      nativeService: PDF_SERVICE,
      productServices: ["documents"],
      fallback: "unavailable until @elizaos/plugin-pdf is registered",
    },
    {
      capability: "personality",
      nativeKey: "personality",
      nativeService: "personality",
      productServices: ["personalities"],
      fallback: "personalities",
    },
    {
      capability: "rolodex",
      nativeKey: "rolodex",
      nativeService: "rolodex",
      productServices: ["userProfiles"],
      fallback: "userProfiles",
    },
    {
      capability: "experience",
      nativeKey: "experience",
      nativeService: "experience",
      productServices: ["sessions", "memory"],
      fallback: "sessions + memory",
    },
    {
      capability: "shell",
      nativeKey: "shell",
      nativeService: DOOLITTLE_SHELL_SERVICE,
      productServices: ["terminal"],
      fallback: "terminal",
    },
    {
      capability: "browser",
      nativeKey: "browser",
      nativeService: DOOLITTLE_BROWSER_SERVICE,
      productServices: ["web"],
      fallback: "web",
    },
    {
      capability: "mcp",
      nativeKey: "mcp",
      nativeService: "mcp",
      productServices: ["mcp"],
      fallback: "mcp",
    },
    {
      capability: "automation",
      nativeKey: "automation",
      nativeService: DOOLITTLE_AUTOMATION_SERVICE,
      productServices: [],
      fallback: "unavailable until the Eliza Trigger Task projection loads",
    },
    {
      capability: "agentSkills",
      nativeKey: "agentSkills",
      nativeService: AGENT_SKILLS_SERVICE,
      productServices: ["skills", "skillSynthesis"],
      fallback: "offline skills projection + local skillSynthesis",
    },
    {
      capability: "trajectoryLogger",
      nativeKey: "trajectoryLogger",
      nativeService: "trajectories",
      productServices: ["trajectories"],
      fallback: "trajectories",
    },
    {
      capability: "agentOrchestrator",
      nativeKey: "agentOrchestrator",
      nativeService: ORCHESTRATOR_TASK_SERVICE,
      productServices: ["delegation"],
      fallback: "unavailable without @elizaos/plugin-agent-orchestrator",
    },
    {
      capability: "codingAgent",
      nativeKey: "codingAgent",
      nativeService: "coding_agent",
      productServices: ["workspace", "repository", "terminal", "delegation"],
      fallback: "workspace + repository + terminal + delegation",
    },
    {
      capability: "pluginManager",
      nativeKey: "pluginManager",
      nativeService: "plugin_manager",
      productServices: [],
      fallback: "native plugin catalog",
    },
  ];
