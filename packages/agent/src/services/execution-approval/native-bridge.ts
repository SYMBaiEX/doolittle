import { ApprovalService, type IAgentRuntime, type UUID } from "@elizaos/core";
import type { PlatformName } from "@/types";

export function bindNativeApprovals(
  runtime: IAgentRuntime,
): ApprovalService | undefined {
  return (
    runtime.getService<ApprovalService>(ApprovalService.serviceType) ??
    undefined
  );
}

export async function forwardNativeApprovalSelection(
  approvals: ApprovalService | undefined,
  id: string,
  selection: "approve" | "deny",
): Promise<void> {
  if (!approvals) {
    return;
  }
  await approvals.handleSelection(id as UUID, selection);
}

export async function requestNativeExecutionApproval(input: {
  approvals: ApprovalService;
  roomId: string;
  entityId?: string;
  platform: PlatformName;
  userId: string;
  roomIdLabel: string;
  sessionKey?: string;
  command: string;
  reason: string;
  ttlMinutes: number;
  onApprove: () => void;
  onDeny: () => void;
  onTimeout: () => void;
}): Promise<string | undefined> {
  let taskId = "";
  taskId = await input.approvals.requestApprovalAsync({
    name: "doolittle-remote-exec",
    description: `${input.reason}\n\nCommand: ${input.command}`,
    roomId: input.roomId as UUID,
    entityId: input.entityId as UUID | undefined,
    options: [
      {
        name: "approve",
        description: "Approve this remote shell command.",
      },
      {
        name: "deny",
        description: "Deny this remote shell command.",
        isCancel: true,
        isDefault: true,
      },
    ],
    timeoutMs: input.ttlMinutes * 60_000,
    timeoutDefault: "deny",
    metadata: {
      type: "doolittle-remote-exec",
      platform: input.platform,
      userId: input.userId,
      roomId: input.roomIdLabel,
      sessionKey: input.sessionKey,
      command: input.command,
      reason: input.reason,
    },
    onSelect: async (option) => {
      if (!taskId) {
        return;
      }
      if (option === "approve") {
        input.onApprove();
        return;
      }
      input.onDeny();
    },
    onTimeout: async () => {
      if (!taskId) {
        return;
      }
      input.onTimeout();
    },
  });
  return taskId || undefined;
}
