import { readWorkerBotProfile } from "@/runtime/bootstrap/bot-profile";
import { stableRuntimeUuid } from "@/runtime/stable-runtime-uuid";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { resolveRemoteExecutionPlatform } from "./platforms";
import type { ExecutionApprovalScopeRecord } from "./types";

interface PendingApprovalRecord {
  id: string;
  reason: string;
  created: boolean;
}

export function isApprovalScopedToRequester(
  input: ChatTurnRequest,
  record: ExecutionApprovalScopeRecord,
  botId?: string,
): boolean {
  if (record.botId && record.botId !== botId) return false;
  const source = resolveRemoteExecutionPlatform(input.source);
  if (!source) {
    return true;
  }
  const sessionKey = input.roomId ?? `room:${input.userId}`;
  return (
    record.platform === source &&
    record.userId === input.userId &&
    record.roomId === sessionKey &&
    (!record.sessionId || record.sessionId === sessionKey)
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
  const active = context.services.runController?.getActive?.(roomId);
  const scope =
    active?.sessionId === roomId && active.runId
      ? {
          botId: readWorkerBotProfile()?.id ?? String(context.runtime.agentId),
          sessionId: active.sessionId,
          runId: active.runId,
        }
      : {};

  const approval =
    context.services.executionApprovals.useApproved({
      platform,
      userId: request.userId,
      roomId,
      sessionKey: roomId,
      ...scope,
      command,
    }) ?? undefined;

  if (approval) {
    return undefined;
  }

  const pending = context.services.executionApprovals.findPending({
    platform,
    userId: request.userId,
    roomId,
    sessionKey: roomId,
    ...scope,
    command,
  });
  if (pending) {
    return { ...pending, created: false };
  }

  const created = await context.services.executionApprovals.request({
    platform,
    userId: request.userId,
    roomId,
    sessionKey: roomId,
    ...scope,
    runtimeRoomId: String(runtimeRoomId),
    runtimeEntityId: String(runtimeEntityId),
    command,
    reason,
  });
  return { ...created, created: true };
}
