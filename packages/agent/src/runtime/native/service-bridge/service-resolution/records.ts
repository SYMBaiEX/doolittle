import type { NativeServices } from "../runtime-contracts";
import type { EffectiveServiceResolutionRecord } from "./types";

type ServiceResolutionKey =
  | "knowledge"
  | "personality"
  | "rolodex"
  | "experience"
  | "shell"
  | "browser"
  | "mcp"
  | "cron"
  | "agentSkills"
  | "trajectoryLogger"
  | "agentOrchestrator"
  | "codingAgent"
  | "pluginManager";

interface ServiceResolutionDefinition {
  capability: string;
  nativeKey: ServiceResolutionKey;
  nativeService: string;
  fallback: string;
}

const SERVICE_RESOLUTION_DEFINITIONS: readonly ServiceResolutionDefinition[] = [
  {
    capability: "knowledge",
    nativeKey: "knowledge",
    nativeService: "knowledge",
    fallback: "documents + memory + sessions",
  },
  {
    capability: "personality",
    nativeKey: "personality",
    nativeService: "personality",
    fallback: "personalities",
  },
  {
    capability: "rolodex",
    nativeKey: "rolodex",
    nativeService: "rolodex",
    fallback: "userProfiles",
  },
  {
    capability: "experience",
    nativeKey: "experience",
    nativeService: "experience",
    fallback: "sessions + memory",
  },
  {
    capability: "shell",
    nativeKey: "shell",
    nativeService: "shell",
    fallback: "terminal",
  },
  {
    capability: "browser",
    nativeKey: "browser",
    nativeService: "browser",
    fallback: "web",
  },
  {
    capability: "mcp",
    nativeKey: "mcp",
    nativeService: "mcp",
    fallback: "mcp",
  },
  {
    capability: "cron",
    nativeKey: "cron",
    nativeService: "cron",
    fallback: "cron",
  },
  {
    capability: "agentSkills",
    nativeKey: "agentSkills",
    nativeService: "agent_skills",
    fallback: "skills + skillSynthesis",
  },
  {
    capability: "trajectoryLogger",
    nativeKey: "trajectoryLogger",
    nativeService: "trajectory_logger",
    fallback: "trajectories",
  },
  {
    capability: "agentOrchestrator",
    nativeKey: "agentOrchestrator",
    nativeService: "agent_orchestrator",
    fallback: "delegation",
  },
  {
    capability: "codingAgent",
    nativeKey: "codingAgent",
    nativeService: "coding_agent",
    fallback: "workspace + repository + terminal + delegation",
  },
  {
    capability: "pluginManager",
    nativeKey: "pluginManager",
    nativeService: "plugin_manager",
    fallback: "native plugin catalog",
  },
];

function resolveOwnership(nativeService: unknown): "plugin" | "product" {
  return nativeService ? "plugin" : "product";
}

export function buildEffectiveServiceResolutionRecords(
  native: Pick<NativeServices, ServiceResolutionKey>,
): EffectiveServiceResolutionRecord[] {
  return SERVICE_RESOLUTION_DEFINITIONS.map(
    ({ capability, nativeKey, nativeService, fallback }) => {
      const service = native[nativeKey];

      return {
        capability,
        nativeService,
        source: service ? "native" : "product",
        ownership: resolveOwnership(service),
        fallback,
        available: Boolean(service),
      };
    },
  );
}
