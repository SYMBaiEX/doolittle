import { randomUUID } from "node:crypto";
import type {
  CreateExecutionApprovalRecordInput,
  ExecutionApprovalMatchInput,
  ExecutionApprovalRecord,
  ExecutionApprovalRule,
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
    botId: input.botId,
    sessionId: input.sessionId,
    runId: input.runId,
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
    record.botId === input.botId &&
    record.sessionId === input.sessionId &&
    record.runId === input.runId &&
    record.command.trim() === input.command.trim()
  );
}

function matchesOptionalScope(
  ruleValue: string | undefined,
  inputValue: string | undefined,
): boolean {
  return ruleValue === undefined || ruleValue === inputValue;
}

export function matchesExecutionApprovalRule(
  rule: ExecutionApprovalRule,
  input: ExecutionApprovalMatchInput,
  nowMs = Date.now(),
): boolean {
  if (!rule.enabled) return false;
  if (rule.expiresAt) {
    const expiresAtMs = Date.parse(rule.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return false;
  }
  if (
    !matchesOptionalScope(rule.platform, input.platform) ||
    !matchesOptionalScope(rule.userId, input.userId) ||
    !matchesOptionalScope(rule.roomId, input.roomId) ||
    !matchesOptionalScope(rule.sessionKey, input.sessionKey) ||
    !matchesOptionalScope(rule.botId, input.botId) ||
    !matchesOptionalScope(rule.sessionId, input.sessionId)
  ) {
    return false;
  }

  const pattern = rule.pattern.trim();
  const command = input.command.trim();
  if (!pattern) return false;
  if (rule.patternType === "exact") return command === pattern;
  if (command === pattern) return true;
  return (
    command.startsWith(pattern) && /\s/u.test(command.charAt(pattern.length))
  );
}

export function createRuleSatisfiedApprovalRecord(
  input: CreateExecutionApprovalRecordInput,
  ruleId: string,
): ExecutionApprovalRecord {
  const record = createPendingApprovalRecord(input);
  record.satisfiedByRuleId = ruleId;
  markApprovalApproved(record, { useImmediately: true });
  return record;
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
