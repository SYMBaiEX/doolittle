import type { PlatformName } from "@/types";

export interface ExecutionApprovalRecord {
  id: string;
  platform: PlatformName;
  userId: string;
  roomId: string;
  sessionKey?: string;
  /** Immutable execution identity. Legacy approvals may omit these fields. */
  botId?: string;
  sessionId?: string;
  runId?: string;
  command: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
  deniedAt?: string;
  usedAt?: string;
  nativeBacked?: boolean;
  status: "pending" | "approved" | "denied" | "used" | "expired";
}

export interface ExecutionApprovalStoreData {
  approvals: ExecutionApprovalRecord[];
}

export interface ExecutionApprovalMatchInput {
  platform: PlatformName;
  userId: string;
  roomId: string;
  sessionKey?: string;
  botId?: string;
  sessionId?: string;
  runId?: string;
  command: string;
}

export interface CreateExecutionApprovalRecordInput
  extends ExecutionApprovalMatchInput {
  reason: string;
  ttlMinutes: number;
  nativeTaskId?: string;
}
