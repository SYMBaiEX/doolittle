import {
  type AgentRuntime,
  ApprovalService,
  ToolPolicyService,
} from "@elizaos/core";

export async function ensureCoreRuntimeServices(
  runtime: AgentRuntime,
): Promise<void> {
  if (!runtime.getService(ApprovalService.serviceType)) {
    await runtime.registerService(ApprovalService);
  }
  if (!runtime.getService(ToolPolicyService.serviceType)) {
    await runtime.registerService(ToolPolicyService);
  }
}
