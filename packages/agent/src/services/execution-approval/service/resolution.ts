import type { ApprovalService } from "@elizaos/core";
import { forwardNativeApprovalSelection } from "../native-bridge";
import type { ExecutionApprovalStore } from "../store";
import type { ExecutionApprovalRecord } from "../types";
import { markApprovalApproved, markApprovalDenied } from "../updates";
import { assertPendingApproval, updateApprovalRecord } from "./store-state";

export async function approveExecutionApproval(input: {
  store: ExecutionApprovalStore;
  nativeApprovals?: ApprovalService;
  id: string;
  options?: { useImmediately?: boolean };
}): Promise<ExecutionApprovalRecord> {
  const pending = assertPendingApproval(input.store, input.id);
  if (pending.nativeBacked) {
    await forwardNativeApprovalSelection(
      input.nativeApprovals,
      input.id,
      "approve",
    );
  }
  return updateApprovalRecord(input.store, input.id, (record) => {
    markApprovalApproved(record, input.options);
  });
}

export async function denyExecutionApproval(input: {
  store: ExecutionApprovalStore;
  nativeApprovals?: ApprovalService;
  id: string;
}): Promise<ExecutionApprovalRecord> {
  const pending = assertPendingApproval(input.store, input.id);
  if (pending.nativeBacked) {
    await forwardNativeApprovalSelection(
      input.nativeApprovals,
      input.id,
      "deny",
    );
  }
  return updateApprovalRecord(input.store, input.id, (record) => {
    markApprovalDenied(record);
  });
}
