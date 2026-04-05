import { stableRuntimeUuid } from "@/runtime/stable-runtime-uuid";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { resolveRemoteExecutionPlatform } from "./platforms";
import type { ExecutionApprovalScopeRecord } from "./types";

interface PendingApprovalRecord {
  id: string;
  reason: string;
}

export function isApprovalScopedToRequester(
  input: ChatTurnRequest,
  record: ExecutionApprovalScopeRecord,
): boolean {
  const source = resolveRemoteExecutionPlatform(input.source);
  if (!source) {
    return true;
  }
  const sessionKey = input.roomId ?? `room:${input.userId}`;
  return (
    record.platform === source &&
    record.userId === input.userId &&
    record.roomId === sessionKey
  );
}

export async function resolvePendingExecutionApproval(input: {
  input: ChatTurnRequest;
  context: AgentExecutionContext;
  command: string;
  platform: NonNullable<ReturnType<typeof resolveRemoteExecutionPlatform>>;
  reason: string;
}): Promise<PendingApprovalRecord | undefined> {
  const { input: request, context, command, platform, reason } = input;
  const roomId = request.roomId ?? `room:${request.userId}`;
  const agentName = context.runtime.character?.name ?? "Doolittle";
  const runtimeRoomId =
    (request.source ?? "cli") === "cli"
      ? stableRuntimeUuid(`${agentName}-chat-room`)
      : stableRuntimeUuid(roomId);
  const runtimeEntityId = stableRuntimeUuid(request.userId);

  const approval =
    context.services.executionApprovals.useApproved({
      platform,
      userId: request.userId,
      roomId,
      sessionKey: roomId,
      command,
    }) ?? undefined;

  if (approval) {
    return undefined;
  }

  return (
    context.services.executionApprovals.findPending({
      platform,
      userId: request.userId,
      roomId,
      sessionKey: roomId,
      command,
    }) ??
    (await context.services.executionApprovals.request({
      platform,
      userId: request.userId,
      roomId,
      sessionKey: roomId,
      runtimeRoomId: String(runtimeRoomId),
      runtimeEntityId: String(runtimeEntityId),
      command,
      reason,
    }))
  );
}
