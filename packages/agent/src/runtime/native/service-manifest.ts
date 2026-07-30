import {
  DOOLITTLE_EXPERIENCE_SERVICE,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
} from "@doolittle/contracts";
import { KNOWLEDGE_GRAPH_SERVICE } from "@elizaos/agent/services/knowledge-graph/index";
import type { NativeServices } from "./service-bridge/runtime-contracts";
import {
  AGENT_SKILLS_SERVICE,
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_CODING_AGENT_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
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
    { service: "delegationProjection", group: "officialBacked" },
    { service: "memory", group: "officialBacked" },
    { service: "sessions", group: "officialBacked" },
    { service: "cron", group: "officialBacked" },
    { service: "workspace", group: "customEliza" },
    { service: "terminal", group: "customEliza" },
    { service: "repository", group: "customEliza" },
    { service: "gatewaySessions", group: "customEliza" },
    { service: "delivery", group: "customEliza" },
    { service: "pairing", group: "officialBacked" },
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
      capability: "pairing",
      nativeKey: "pairing",
      nativeService: "pairing",
      productServices: ["pairing"],
      fallback: "unavailable until the official Eliza PairingService loads",
    },
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
      nativeService: DOOLITTLE_PERSONALITY_SERVICE,
      productServices: [],
      fallback: "required Eliza personality service",
    },
    {
      capability: "rolodex",
      nativeKey: "rolodex",
      nativeService: DOOLITTLE_ROLODEX_SERVICE,
      productServices: [],
      fallback: "required Eliza rolodex service",
    },
    {
      capability: "experience",
      nativeKey: "experience",
      nativeService: DOOLITTLE_EXPERIENCE_SERVICE,
      productServices: [],
      fallback: "required Eliza experience service",
    },
    {
      capability: "shell",
      nativeKey: "shell",
      nativeService: DOOLITTLE_SHELL_SERVICE,
      productServices: [],
      fallback: "required Eliza shell service",
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
      nativeService: DOOLITTLE_MCP_SERVICE,
      productServices: [],
      fallback: "required Eliza MCP service",
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
      productServices: ["delegationProjection"],
      fallback: "unavailable without @elizaos/plugin-agent-orchestrator",
    },
    {
      capability: "codingAgent",
      nativeKey: "codingAgent",
      nativeService: DOOLITTLE_CODING_AGENT_SERVICE,
      productServices: [
        "workspace",
        "repository",
        "terminal",
        "delegationProjection",
      ],
      fallback: "workspace + repository + terminal + delegation projection",
    },
    {
      capability: "pluginManager",
      nativeKey: "pluginManager",
      nativeService: "plugin_manager",
      productServices: [],
      fallback: "native plugin catalog",
    },
    {
      capability: "actionPlanning",
      nativeKey: "actionPlanning",
      nativeService: "planning",
      productServices: [],
      fallback:
        "unavailable until the official Eliza planning service is registered",
    },
    {
      capability: "operatorPlanning",
      nativeKey: "operatorPlanning",
      nativeService: DOOLITTLE_OPERATOR_PLANNING_SERVICE,
      productServices: [],
      fallback:
        "unavailable until the Doolittle operator-plan projection is registered",
    },
  ];
