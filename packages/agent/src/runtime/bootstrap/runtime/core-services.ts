import {
  DatabaseTrajectoryLogger,
  installDatabaseTrajectoryLogger,
} from "@elizaos/agent/runtime/trajectory-persistence";
import {
  type AgentRuntime,
  ApprovalService,
  ToolPolicyService,
} from "@elizaos/core";
import { AgentSkillsService } from "@elizaos/plugin-agent-skills";

export async function ensureCoreRuntimeServices(
  runtime: AgentRuntime,
): Promise<void> {
  if (!runtime.getService(ApprovalService.serviceType)) {
    await runtime.registerService(ApprovalService);
  }
  if (!runtime.getService(ToolPolicyService.serviceType)) {
    await runtime.registerService(ToolPolicyService);
  }
  if (!runtime.getService(DatabaseTrajectoryLogger.serviceType)) {
    await runtime.registerService(DatabaseTrajectoryLogger);
  }
  await installDatabaseTrajectoryLogger(runtime);
  await runtime.getServiceLoadPromise(AgentSkillsService.serviceType);
}
