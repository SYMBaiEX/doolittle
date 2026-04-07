import { randomUUID } from "node:crypto";
import type {
  CreateExecutionApprovalRecordInput,
  ExecutionApprovalMatchInput,
  ExecutionApprovalRecord,
  ExecutionApprovalStoreData,
} from "./types";

const MAX_STORED_APPROVALS = 200;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createPendingApprovalRecord(
  input: CreateExecutionApprovalRecordInput,
): ExecutionApprovalRecord {
  return {
    id: input.nativeTaskId ?? randomUUID(),
    platform: input.platform,
    userId: input.userId,
    roomId: input.roomId,
    sessionKey: input.sessionKey,
    command: input.command,
    reason: input.reason,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + input.ttlMinutes * 60_000).toISOString(),
    nativeBacked: Boolean(input.nativeTaskId),
    status: "pending",
  };
}

export function matchesApprovalRequest(
  record: ExecutionApprovalRecord,
  input: ExecutionApprovalMatchInput,
): boolean {
  return (
    record.platform === input.platform &&
    record.userId === input.userId &&
    record.roomId === input.roomId &&
    record.sessionKey === input.sessionKey &&
    record.command.trim() === input.command.trim()
  );
}

export function markApprovalApproved(
  record: ExecutionApprovalRecord,
  options?: { useImmediately?: boolean },
): void {
  const timestamp = nowIso();
  record.approvedAt ??= timestamp;
  record.status = options?.useImmediately ? "used" : "approved";
  if (options?.useImmediately) {
    record.usedAt = timestamp;
  }
}

export function markApprovalDenied(record: ExecutionApprovalRecord): void {
  record.deniedAt ??= nowIso();
  record.status = "denied";
}

export function markApprovalUsed(record: ExecutionApprovalRecord): void {
  record.status = "used";
  record.usedAt = nowIso();
}

export function markApprovalExpired(record: ExecutionApprovalRecord): void {
  record.status = "expired";
}

export function expirePendingApprovals(
  store: ExecutionApprovalStoreData,
): boolean {
  let changed = false;
  for (const record of store.approvals) {
    if (
      record.status === "pending" &&
      new Date(record.expiresAt).getTime() <= Date.now()
    ) {
      markApprovalExpired(record);
      changed = true;
    }
  }
  return changed;
}

export function pruneApprovalStore(store: ExecutionApprovalStoreData): void {
  if (store.approvals.length > MAX_STORED_APPROVALS) {
    store.approvals = store.approvals.slice(-MAX_STORED_APPROVALS);
  }
}
