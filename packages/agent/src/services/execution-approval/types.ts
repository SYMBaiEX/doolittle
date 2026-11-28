import type { PlatformName } from "../../types/index";

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
  /** Present on terminal receipts satisfied by a persistent rule. */
  satisfiedByRuleId?: string;
  status: "pending" | "approved" | "denied" | "used" | "expired";
}

export type ExecutionApprovalRulePatternType = "exact" | "prefix";

export interface ExecutionApprovalRuleScope {
  platform?: PlatformName;
  userId?: string;
  roomId?: string;
  sessionKey?: string;
  botId?: string;
  sessionId?: string;
}

/**
 * Persistent allow rules intentionally have no runId dimension: runs are
 * one-shot, while rules survive across later runs. Patterns are literal,
 * case-sensitive command text rather than glob or regular expressions.
 */
export interface ExecutionApprovalRule extends ExecutionApprovalRuleScope {
  id: string;
  patternType: ExecutionApprovalRulePatternType;
  pattern: string;
  createdAt: string;
  expiresAt?: string;
  enabled: boolean;
}

export interface ExecutionApprovalStoreData {
  approvals: ExecutionApprovalRecord[];
  rules: ExecutionApprovalRule[];
}

export interface CreateExecutionApprovalRuleInput
  extends ExecutionApprovalRuleScope {
  patternType: ExecutionApprovalRulePatternType;
  pattern: string;
  expiresAt?: string;
  enabled?: boolean;
}

export interface UpdateExecutionApprovalRuleInput {
  patternType?: ExecutionApprovalRulePatternType;
  pattern?: string;
  expiresAt?: string | null;
  enabled?: boolean;
  platform?: PlatformName | null;
  userId?: string | null;
  roomId?: string | null;
  sessionKey?: string | null;
  botId?: string | null;
  sessionId?: string | null;
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
