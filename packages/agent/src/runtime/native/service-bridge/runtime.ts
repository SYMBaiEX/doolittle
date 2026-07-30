import {
  DOOLITTLE_EXPERIENCE_SERVICE,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
} from "@doolittle/contracts";
import { getAgentEventService } from "@elizaos/agent/runtime/agent-event-service";
import {
  KNOWLEDGE_GRAPH_SERVICE,
  type KnowledgeGraphService,
} from "@elizaos/agent/services/knowledge-graph/index";
import type { HookService, PairingService } from "@elizaos/core";
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
  NativeGitHubService,
  NativeMcpService,
  NativeMemoryStorageService,
  NativeOperatorPlanningService,
  NativePdfService,
  NativePersonalityService,
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

function hasAnyMethod(
  value: unknown,
  methods: readonly string[],
): value is Record<string, (...args: never[]) => unknown> {
  if (!value || typeof value !== "object") return false;
  return methods.some(
    (method) =>
      typeof (value as Record<string, unknown>)[method] === "function",
  );
}

/**
 * Resolve a namespaced Doolittle projection while accepting the retired
 * unnamespaced identifier only when the service has the product contract.
 *
 * This is a migration boundary for persisted/test hosts, not a route to the
 * official plugin service: shape checking prevents the official `shell`,
 * `browser`, or `mcp` service from being mistaken for Doolittle's projection.
 */
function productProjection<T>(
  runtime: RuntimeLike,
  namespacedName: string,
  retiredName: string,
  productMethods: readonly string[],
): T | undefined {
  const current = service<T>(runtime, namespacedName);
  if (current) return current;
  const retired = service<unknown>(runtime, retiredName);
  return hasAnyMethod(retired, productMethods) ? (retired as T) : undefined;
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
    shell: productProjection<NativeShellService>(
      runtime,
      DOOLITTLE_SHELL_SERVICE,
      "shell",
      ["run", "history"],
    ),
    browser: productProjection<NativeBrowserService>(
      runtime,
      DOOLITTLE_BROWSER_SERVICE,
      "browser",
      ["capture", "analyze", "compare", "analyzeComparison"],
    ),
    mcp: productProjection<NativeMcpService>(
      runtime,
      DOOLITTLE_MCP_SERVICE,
      "mcp",
      ["invoke", "invokeTool", "getCachedTools"],
    ),
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
    codingAgent: service<NativeCodingAgentService>(
      runtime,
      DOOLITTLE_CODING_AGENT_SERVICE,
    ),
    approval: service<NativeApprovalService>(runtime, "approval"),
    pairing: service<PairingService>(runtime, "pairing"),
    hooks: service<HookService>(runtime, "hooks"),
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
    actionPlanning: service<NativeActionPlanningService>(runtime, "planning"),
    operatorPlanning: service<NativeOperatorPlanningService>(
      runtime,
      DOOLITTLE_OPERATOR_PLANNING_SERVICE,
    ),
    github: service<NativeGitHubService>(runtime, "github"),
    secretsManager: service<NativeSecretsManagerService>(
      runtime,
      "secrets-manager",
    ),
  };
}

export function getNativeServices(runtime: RuntimeLike) {
  return buildNativeServices(runtime);
}
