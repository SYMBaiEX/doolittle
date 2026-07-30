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
  requirement: string;
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
    { service: "skillSynthesis", group: "customEliza" },
    { service: "trajectoryEvaluation", group: "customEliza" },
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
    { service: "hooks", group: "officialBacked" },
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
      requirement: "required official Eliza PairingService",
    },
    {
      capability: "hooks",
      nativeKey: "hooks",
      nativeService: "hooks",
      requirement: "required official Eliza HookService",
    },
    {
      capability: "memoryStorage",
      nativeKey: "memoryStorage",
      nativeService: "memoryStorage",
      requirement: "required Eliza memory storage service",
    },
    {
      capability: "knowledgeGraph",
      nativeKey: "knowledgeGraph",
      nativeService: KNOWLEDGE_GRAPH_SERVICE,
      requirement: "required official Eliza knowledge graph service",
    },
    {
      capability: "pdf",
      nativeKey: "pdf",
      nativeService: PDF_SERVICE,
      requirement: "required official Eliza PDF service",
    },
    {
      capability: "personality",
      nativeKey: "personality",
      nativeService: DOOLITTLE_PERSONALITY_SERVICE,
      requirement: "required Eliza personality service",
    },
    {
      capability: "rolodex",
      nativeKey: "rolodex",
      nativeService: DOOLITTLE_ROLODEX_SERVICE,
      requirement: "required Eliza rolodex service",
    },
    {
      capability: "experience",
      nativeKey: "experience",
      nativeService: DOOLITTLE_EXPERIENCE_SERVICE,
      requirement: "required Eliza experience service",
    },
    {
      capability: "shell",
      nativeKey: "shell",
      nativeService: DOOLITTLE_SHELL_SERVICE,
      requirement: "required Eliza shell service",
    },
    {
      capability: "browser",
      nativeKey: "browser",
      nativeService: DOOLITTLE_BROWSER_SERVICE,
      requirement: "required Eliza browser service",
    },
    {
      capability: "mcp",
      nativeKey: "mcp",
      nativeService: DOOLITTLE_MCP_SERVICE,
      requirement: "required Eliza MCP service",
    },
    {
      capability: "automation",
      nativeKey: "automation",
      nativeService: DOOLITTLE_AUTOMATION_SERVICE,
      requirement: "required Eliza Trigger Task projection",
    },
    {
      capability: "agentSkills",
      nativeKey: "agentSkills",
      nativeService: AGENT_SKILLS_SERVICE,
      requirement: "required official Eliza Agent Skills service",
    },
    {
      capability: "trajectoryLogger",
      nativeKey: "trajectoryLogger",
      nativeService: "trajectories",
      requirement: "required official Eliza trajectories service",
    },
    {
      capability: "agentOrchestrator",
      nativeKey: "agentOrchestrator",
      nativeService: ORCHESTRATOR_TASK_SERVICE,
      requirement: "required official Eliza Agent Orchestrator service",
    },
    {
      capability: "codingAgent",
      nativeKey: "codingAgent",
      nativeService: DOOLITTLE_CODING_AGENT_SERVICE,
      requirement: "required Eliza coding agent service",
    },
    {
      capability: "pluginManager",
      nativeKey: "pluginManager",
      nativeService: "plugin_manager",
      requirement: "required official Eliza plugin manager service",
    },
    {
      capability: "actionPlanning",
      nativeKey: "actionPlanning",
      nativeService: "planning",
      requirement: "required official Eliza planning service",
    },
    {
      capability: "operatorPlanning",
      nativeKey: "operatorPlanning",
      nativeService: DOOLITTLE_OPERATOR_PLANNING_SERVICE,
      requirement: "required Eliza operator-plan projection",
    },
  ];
