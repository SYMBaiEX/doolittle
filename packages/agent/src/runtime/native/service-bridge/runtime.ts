import {
  DOOLITTLE_CODE_GENERATION_SERVICE,
  DOOLITTLE_EXPERIENCE_SERVICE,
  DOOLITTLE_FORMS_SERVICE,
  DOOLITTLE_GITHUB_PLANNING_SERVICE,
  DOOLITTLE_LOCAL_SANDBOX_SERVICE,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
} from "@doolittle/contracts";
import { getAgentEventService } from "@elizaos/agent/runtime/agent-event-service";
import {
  KNOWLEDGE_GRAPH_SERVICE,
  type KnowledgeGraphService,
} from "@elizaos/agent/services/knowledge-graph/index";
import {
  ApprovalService,
  HookService,
  PairingService,
  PluginManagerService,
  SECRETS_SERVICE_TYPE,
  ToolPolicyService,
  TrajectoriesService,
} from "@elizaos/core";
import type {
  NativeActionPlanningService,
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
  NativeGitHubPlanningService,
  NativeMcpService,
  NativeMemoryStorageService,
  NativeOperatorPlanningService,
  NativePdfService,
  NativePersonalityService,
  NativePluginManagerService,
  NativeRolodexService,
  NativeSecretsService,
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
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_CODING_AGENT_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
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
    memoryStorage: service<NativeMemoryStorageService>(
      runtime,
      "memoryStorage",
    ),
    knowledgeGraph: service<KnowledgeGraphService>(
      runtime,
      KNOWLEDGE_GRAPH_SERVICE,
    ),
    pdf: service<NativePdfService>(runtime, PDF_SERVICE),
    personality: service<NativePersonalityService>(
      runtime,
      DOOLITTLE_PERSONALITY_SERVICE,
    ),
    rolodex: service<NativeRolodexService>(runtime, DOOLITTLE_ROLODEX_SERVICE),
    experience: service<NativeExperienceService>(
      runtime,
      DOOLITTLE_EXPERIENCE_SERVICE,
    ),
    shell: service<NativeShellService>(runtime, DOOLITTLE_SHELL_SERVICE),
    browser: service<NativeBrowserService>(runtime, DOOLITTLE_BROWSER_SERVICE),
    mcp: service<NativeMcpService>(runtime, DOOLITTLE_MCP_SERVICE),
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
      TrajectoriesService.serviceType,
    ),
    agentOrchestrator: service<NativeAgentOrchestratorService>(
      runtime,
      ORCHESTRATOR_TASK_SERVICE,
    ),
    codingAgent: service<NativeCodingAgentService>(
      runtime,
      DOOLITTLE_CODING_AGENT_SERVICE,
    ),
    approval: service<NativeApprovalService>(
      runtime,
      ApprovalService.serviceType,
    ),
    pairing: service<PairingService>(runtime, PairingService.serviceType),
    hooks: service<HookService>(runtime, HookService.serviceType),
    agentEvent,
    pluginManager: service<NativePluginManagerService>(
      runtime,
      PluginManagerService.serviceType,
    ),
    toolPolicy: service<NativeToolPolicyService>(
      runtime,
      ToolPolicyService.serviceType,
    ),
    telegram: service<NativeTelegramTransportService>(runtime, "telegram"),
    discordTransport: service<NativeDiscordTransportService>(
      runtime,
      "discord_transport",
    ),
    codeGeneration: service<NativeCodeGenerationService>(
      runtime,
      DOOLITTLE_CODE_GENERATION_SERVICE,
    ),
    e2b: service<NativeE2BService>(runtime, DOOLITTLE_LOCAL_SANDBOX_SERVICE),
    forms: service<NativeFormsService>(runtime, DOOLITTLE_FORMS_SERVICE),
    actionPlanning: service<NativeActionPlanningService>(runtime, "planning"),
    operatorPlanning: service<NativeOperatorPlanningService>(
      runtime,
      DOOLITTLE_OPERATOR_PLANNING_SERVICE,
    ),
    githubPlanning: service<NativeGitHubPlanningService>(
      runtime,
      DOOLITTLE_GITHUB_PLANNING_SERVICE,
    ),
    secrets: service<NativeSecretsService>(runtime, SECRETS_SERVICE_TYPE),
  };
}

export function getNativeServices(runtime: RuntimeLike) {
  return buildNativeServices(runtime);
}
