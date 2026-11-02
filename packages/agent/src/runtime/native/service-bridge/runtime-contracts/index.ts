import type { getAgentEventService } from "@elizaos/agent/runtime/agent-event-service";

import type { HookService, PairingService } from "@elizaos/core";
import type {
  NativeAgentOrchestratorService,
  NativeAgentSkillsService,
  NativeCodeGenerationService,
  NativeCodingAgentService,
  NativeTrajectoryLoggerService,
} from "./agent";
import type {
  NativeApprovalService,
  NativeAutomationService,
  NativeBrowserService,
  NativeMcpService,
  NativePdfService,
  NativeShellService,
} from "./core";
import type {
  NativeActionPlanningService,
  NativeDiscordTransportService,
  NativeE2BService,
  NativeFormsService,
  NativeGitHubPlanningService,
  NativeOperatorPlanningService,
  NativeSecretsService,
  NativeTelegramTransportService,
} from "./integrations";
import type {
  NativeExperienceService,
  NativeMemoryStorageService,
  NativePersonalityService,
  NativeRolodexService,
} from "./memory";

export * from "./agent";
export * from "./core";
export * from "./integrations";
export * from "./memory";
export * from "./runtime";

export type NativeServices = {
  memoryStorage: NativeMemoryStorageService | undefined;
  pdf: NativePdfService | undefined;
  personality: NativePersonalityService | undefined;
  rolodex: NativeRolodexService | undefined;
  experience: NativeExperienceService | undefined;
  shell: NativeShellService | undefined;
  browser: NativeBrowserService | undefined;
  mcp: NativeMcpService | undefined;
  automation: NativeAutomationService | undefined;
  agentSkills: NativeAgentSkillsService | undefined;
  trajectoryLogger: NativeTrajectoryLoggerService | undefined;
  agentOrchestrator: NativeAgentOrchestratorService | undefined;
  codingAgent: NativeCodingAgentService | undefined;
  approval: NativeApprovalService | undefined;
  pairing: PairingService | undefined;
  hooks: HookService | undefined;
  agentEvent: ReturnType<typeof getAgentEventService> | null;
  telegram: NativeTelegramTransportService | undefined;
  discordTransport: NativeDiscordTransportService | undefined;
  codeGeneration: NativeCodeGenerationService | undefined;
  e2b: NativeE2BService | undefined;
  forms: NativeFormsService | undefined;
  actionPlanning: NativeActionPlanningService | undefined;
  operatorPlanning: NativeOperatorPlanningService | undefined;
  githubPlanning: NativeGitHubPlanningService | undefined;
  secrets: NativeSecretsService | undefined;
};
