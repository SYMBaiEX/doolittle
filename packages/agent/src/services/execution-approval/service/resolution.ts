import type { ApprovalService } from "@elizaos/core";
import { forwardNativeApprovalSelection } from "../native-bridge";
import type { ExecutionApprovalStore } from "../store";
import type { ExecutionApprovalRecord } from "../types";
import { markApprovalApproved, markApprovalDenied } from "../updates";
import {
  assertPendingApproval,
  getApprovalRecord,
  updateApprovalRecord,
} from "./store-state";

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
    const confirmed = getApprovalRecord(input.store, input.id);
    if (confirmed?.status !== "approved")
      throw new Error("Native execution approval did not resolve.");
    if (!input.options?.useImmediately) return confirmed;
  }
  return updateApprovalRecord(input.store, input.id, (record) => {
    if (record.status !== (pending.nativeBacked ? "approved" : "pending"))
      throw new Error("Execution approval changed before it could be used.");
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
    const confirmed = getApprovalRecord(input.store, input.id);
    if (confirmed?.status !== "denied")
      throw new Error("Native execution approval did not resolve.");
    return confirmed;
  }
  return updateApprovalRecord(input.store, input.id, (record) => {
    if (record.status !== "pending")
      throw new Error("Execution approval changed before it could be denied.");
    markApprovalDenied(record);
  });
}
