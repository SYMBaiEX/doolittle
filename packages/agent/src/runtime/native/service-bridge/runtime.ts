import { getAgentEventService } from "@elizaos/autonomous/runtime/agent-event-service";
import type {
  NativeAgentOrchestratorService,
  NativeAgentSkillsService,
  NativeApprovalService,
  NativeBrowserService,
  NativeCodeGenerationService,
  NativeCodingAgentService,
  NativeCronService,
  NativeDiscordTransportService,
  NativeE2BService,
  NativeExperienceService,
  NativeFormsService,
  NativeGitHubService,
  NativeKnowledgeService,
  NativeMcpService,
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
    knowledge: service<NativeKnowledgeService>(runtime, "knowledge"),
    personality: service<NativePersonalityService>(runtime, "personality"),
    rolodex: service<NativeRolodexService>(runtime, "rolodex"),
    experience: service<NativeExperienceService>(runtime, "experience"),
    shell: service<NativeShellService>(runtime, "shell"),
    browser: service<NativeBrowserService>(runtime, "browser"),
    mcp: service<NativeMcpService>(runtime, "mcp"),
    cron: service<NativeCronService>(runtime, "cron"),
    agentSkills: service<NativeAgentSkillsService>(runtime, "agent_skills"),
    trajectoryLogger: service<NativeTrajectoryLoggerService>(
      runtime,
      "trajectory_logger",
    ),
    agentOrchestrator: service<NativeAgentOrchestratorService>(
      runtime,
      "agent_orchestrator",
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
