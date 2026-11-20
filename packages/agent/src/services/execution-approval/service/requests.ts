import type { ApprovalService } from "@elizaos/core";
import { requestNativeExecutionApproval } from "../native-bridge";
import type { ExecutionApprovalStore } from "../store";
import type {
  ExecutionApprovalMatchInput,
  ExecutionApprovalRecord,
} from "../types";
import {
  createPendingApprovalRecord,
  markApprovalApproved,
  markApprovalDenied,
  markApprovalExpired,
  pruneApprovalStore,
} from "../updates";
import { safeMutateApprovalRecord } from "./store-state";

export interface RequestExecutionApprovalInput {
  platform: ExecutionApprovalMatchInput["platform"];
  userId: string;
  roomId: string;
  sessionKey?: string;
  botId?: string;
  sessionId?: string;
  runId?: string;
  runtimeRoomId?: string;
  runtimeEntityId?: string;
  command: string;
  reason: string;
  ttlMinutes?: number;
}

export async function requestExecutionApproval(input: {
  store: ExecutionApprovalStore;
  nativeApprovals?: ApprovalService;
  input: RequestExecutionApprovalInput;
}): Promise<ExecutionApprovalRecord> {
  const ttlMinutes = input.input.ttlMinutes ?? 15;
  let nativeTaskId: string | undefined;

  if (input.nativeApprovals && input.input.runtimeRoomId) {
    nativeTaskId = await requestNativeExecutionApproval({
      approvals: input.nativeApprovals,
      roomId: input.input.runtimeRoomId,
      entityId: input.input.runtimeEntityId,
      platform: input.input.platform,
      userId: input.input.userId,
      roomIdLabel: input.input.roomId,
      sessionKey: input.input.sessionKey,
      command: input.input.command,
      reason: input.input.reason,
      ttlMinutes,
      onApprove: () => {
        if (!nativeTaskId) {
          return;
        }
        safeMutateApprovalRecord(input.store, nativeTaskId, (record) => {
          if (record.status === "pending") markApprovalApproved(record);
        });
      },
      onDeny: () => {
        if (!nativeTaskId) {
          return;
        }
        safeMutateApprovalRecord(input.store, nativeTaskId, (record) => {
          if (record.status === "pending") markApprovalDenied(record);
        });
      },
      onTimeout: () => {
        if (!nativeTaskId) {
          return;
        }
        safeMutateApprovalRecord(input.store, nativeTaskId, (record) => {
          if (record.status === "pending") markApprovalExpired(record);
        });
      },
    });
  }

  const record = createPendingApprovalRecord({
    platform: input.input.platform,
    userId: input.input.userId,
    roomId: input.input.roomId,
    sessionKey: input.input.sessionKey,
    botId: input.input.botId,
    sessionId: input.input.sessionId,
    runId: input.input.runId,
    command: input.input.command,
    reason: input.input.reason,
    ttlMinutes,
    nativeTaskId,
  });

  // Read after the asynchronous native request so concurrent receipts are
  // applied to the latest local store without dropping an earlier request.
  const storeData = input.store.read();
  storeData.approvals.push(record);
  pruneApprovalStore(storeData);
  input.store.write(storeData);
  return record;
}
