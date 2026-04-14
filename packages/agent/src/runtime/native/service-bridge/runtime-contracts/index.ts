import type { getAgentEventService } from "@elizaos/autonomous/runtime/agent-event-service";

import type {
  NativeAgentOrchestratorService,
  NativeAgentSkillsService,
  NativeCodeGenerationService,
  NativeCodingAgentService,
  NativeTrajectoryLoggerService,
} from "./agent";
import type {
  NativeApprovalService,
  NativeBrowserService,
  NativeCronService,
  NativeMcpService,
  NativeShellService,
  NativeToolPolicyService,
} from "./core";
import type {
  NativeDiscordTransportService,
  NativeE2BService,
  NativeFormsService,
  NativeGitHubService,
  NativePlanningService,
  NativePluginManagerService,
  NativeSecretsManagerService,
  NativeTelegramTransportService,
} from "./integrations";
import type {
  NativeExperienceService,
  NativeKnowledgeService,
  NativePersonalityService,
  NativeRolodexService,
} from "./memory";

export * from "./agent";
export * from "./core";
export * from "./integrations";
export * from "./memory";
export * from "./runtime";

export type NativeServices = {
  knowledge: NativeKnowledgeService | undefined;
  personality: NativePersonalityService | undefined;
  rolodex: NativeRolodexService | undefined;
  experience: NativeExperienceService | undefined;
  shell: NativeShellService | undefined;
  browser: NativeBrowserService | undefined;
  mcp: NativeMcpService | undefined;
  cron: NativeCronService | undefined;
  agentSkills: NativeAgentSkillsService | undefined;
  trajectoryLogger: NativeTrajectoryLoggerService | undefined;
  agentOrchestrator: NativeAgentOrchestratorService | undefined;
  codingAgent: NativeCodingAgentService | undefined;
  approval: NativeApprovalService | undefined;
  agentEvent: ReturnType<typeof getAgentEventService> | null;
  pluginManager: NativePluginManagerService | undefined;
  toolPolicy: NativeToolPolicyService | undefined;
  telegram: NativeTelegramTransportService | undefined;
  discordTransport: NativeDiscordTransportService | undefined;
  codeGeneration: NativeCodeGenerationService | undefined;
  e2b: NativeE2BService | undefined;
  forms: NativeFormsService | undefined;
  planning: NativePlanningService | undefined;
  github: NativeGitHubService | undefined;
  secretsManager: NativeSecretsManagerService | undefined;
};
