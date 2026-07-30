import { getAgentEventService } from "@elizaos/agent/runtime/agent-event-service";
import {
  KNOWLEDGE_GRAPH_SERVICE,
  type KnowledgeGraphService,
} from "@elizaos/agent/services/knowledge-graph/index";
import type {
  NativeAgentOrchestratorService,
  NativeAgentSkillsService,
  NativeApprovalService,
  NativeAutomationService,
  NativeBrowserService,
  NativeCodeGenerationService,
  NativeCodingAgentService,
  NativeDiscordTransportService,
  NativeE2BService,
  NativeExperienceService,
  NativeFormsService,
  NativeGitHubService,
  NativeMcpService,
  NativePdfService,
  NativePersonalityService,
  NativePlanningService,
  NativePluginManagerService,
  NativeRolodexService,
  NativeSecretsManagerService,
  NativeServices,
  NativeShellService,
  NativeTelegramTransportService,
  NativeToolPolicyService,
  NativeTrajectoryLoggerService,
  RuntimeLike,
} from "./runtime-contracts";
import {
  AGENT_SKILLS_SERVICE,
  DOOLITTLE_AUTOMATION_SERVICE,
  ORCHESTRATOR_TASK_SERVICE,
  PDF_SERVICE,
} from "./runtime-contracts";

export type { RuntimeLike } from "./runtime-contracts";

function service<T>(runtime: RuntimeLike, name: string): T | undefined {
  if (typeof runtime.getService !== "function") {
    return undefined;
  }
  return (runtime.getService(name) as T | null) ?? undefined;
}

function buildNativeServices(runtime: RuntimeLike): NativeServices {
  const agentEvent =
    runtime && typeof runtime.getService === "function"
      ? getAgentEventService(
          runtime as { getService: (service: string) => unknown | null },
        )
      : null;

  return {
    knowledgeGraph: service<KnowledgeGraphService>(
      runtime,
      KNOWLEDGE_GRAPH_SERVICE,
    ),
    pdf: service<NativePdfService>(runtime, PDF_SERVICE),
    personality: service<NativePersonalityService>(runtime, "personality"),
    rolodex: service<NativeRolodexService>(runtime, "rolodex"),
    experience: service<NativeExperienceService>(runtime, "experience"),
    shell: service<NativeShellService>(runtime, "shell"),
    browser: service<NativeBrowserService>(runtime, "browser"),
    mcp: service<NativeMcpService>(runtime, "mcp"),
    automation: service<NativeAutomationService>(
      runtime,
      DOOLITTLE_AUTOMATION_SERVICE,
    ),
    agentSkills: service<NativeAgentSkillsService>(
      runtime,
      AGENT_SKILLS_SERVICE,
    ),
    trajectoryLogger: service<NativeTrajectoryLoggerService>(
      runtime,
      "trajectories",
    ),
    agentOrchestrator: service<NativeAgentOrchestratorService>(
      runtime,
      ORCHESTRATOR_TASK_SERVICE,
    ),
    codingAgent: service<NativeCodingAgentService>(runtime, "coding_agent"),
    approval: service<NativeApprovalService>(runtime, "approval"),
    agentEvent,
    pluginManager: service<NativePluginManagerService>(
      runtime,
      "plugin_manager",
    ),
    toolPolicy: service<NativeToolPolicyService>(runtime, "tool_policy"),
    telegram: service<NativeTelegramTransportService>(runtime, "telegram"),
    discordTransport: service<NativeDiscordTransportService>(
      runtime,
      "discord_transport",
    ),
    codeGeneration: service<NativeCodeGenerationService>(
      runtime,
      "code-generation",
    ),
    e2b: service<NativeE2BService>(runtime, "e2b"),
    forms: service<NativeFormsService>(runtime, "forms"),
    planning: service<NativePlanningService>(runtime, "planning"),
    github: service<NativeGitHubService>(runtime, "github"),
    secretsManager: service<NativeSecretsManagerService>(
      runtime,
      "secrets-manager",
    ),
  };
}

const nativeServicesCache = new WeakMap<object, NativeServices>();

export function getNativeServices(runtime: RuntimeLike) {
  if (!runtime || typeof runtime !== "object") {
    return buildNativeServices(runtime);
  }
  const cached = nativeServicesCache.get(runtime);
  if (cached) {
    return cached;
  }
  const resolved = buildNativeServices(runtime);
  nativeServicesCache.set(runtime, resolved);
  return resolved;
}
