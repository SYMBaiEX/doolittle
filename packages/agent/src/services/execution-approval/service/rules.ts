import { randomUUID } from "node:crypto";
import type { ExecutionApprovalStore } from "../store";
import type {
  CreateExecutionApprovalRuleInput,
  ExecutionApprovalMatchInput,
  ExecutionApprovalRule,
  UpdateExecutionApprovalRuleInput,
} from "../types";
import { matchesExecutionApprovalRule, nowIso } from "../updates";

const MAX_STORED_APPROVAL_RULES = 200;

function patchStringScope(
  rule: ExecutionApprovalRule,
  key: "userId" | "roomId" | "sessionKey" | "botId" | "sessionId",
  value: string | null,
): void {
  if (value === null) delete rule[key];
  else rule[key] = value;
}

export function listExecutionApprovalRules(
  store: ExecutionApprovalStore,
): ExecutionApprovalRule[] {
  return store.read().rules.slice().reverse();
}

export function getExecutionApprovalRule(
  store: ExecutionApprovalStore,
  id: string,
): ExecutionApprovalRule | undefined {
  return store.read().rules.find((rule) => rule.id === id);
}

export function createExecutionApprovalRule(
  store: ExecutionApprovalStore,
  input: CreateExecutionApprovalRuleInput,
): ExecutionApprovalRule {
  const storeData = store.read();
  if (storeData.rules.length >= MAX_STORED_APPROVAL_RULES) {
    throw new Error("Execution approval rule limit reached.");
  }
  const rule: ExecutionApprovalRule = {
    id: randomUUID(),
    patternType: input.patternType,
    pattern: input.pattern.trim(),
    platform: input.platform,
    userId: input.userId,
    roomId: input.roomId,
    sessionKey: input.sessionKey,
    botId: input.botId,
    sessionId: input.sessionId,
    createdAt: nowIso(),
    expiresAt: input.expiresAt,
    enabled: input.enabled ?? true,
  };
  storeData.rules.push(rule);
  store.write(storeData);
  return { ...rule };
}

export function updateExecutionApprovalRule(
  store: ExecutionApprovalStore,
  id: string,
  patch: UpdateExecutionApprovalRuleInput,
): ExecutionApprovalRule | undefined {
  const storeData = store.read();
  const rule = storeData.rules.find((entry) => entry.id === id);
  if (!rule) return undefined;

  if (patch.patternType !== undefined) rule.patternType = patch.patternType;
  if (patch.pattern !== undefined) rule.pattern = patch.pattern.trim();
  if (patch.enabled !== undefined) rule.enabled = patch.enabled;
  if (patch.expiresAt !== undefined) {
    if (patch.expiresAt === null) delete rule.expiresAt;
    else rule.expiresAt = patch.expiresAt;
  }
  if (patch.platform !== undefined) {
    if (patch.platform === null) delete rule.platform;
    else rule.platform = patch.platform;
  }
  if (patch.userId !== undefined)
    patchStringScope(rule, "userId", patch.userId);
  if (patch.roomId !== undefined)
    patchStringScope(rule, "roomId", patch.roomId);
  if (patch.sessionKey !== undefined) {
    patchStringScope(rule, "sessionKey", patch.sessionKey);
  }
  if (patch.botId !== undefined) patchStringScope(rule, "botId", patch.botId);
  if (patch.sessionId !== undefined) {
    patchStringScope(rule, "sessionId", patch.sessionId);
  }

  store.write(storeData);
  return { ...rule };
}

export function deleteExecutionApprovalRule(
  store: ExecutionApprovalStore,
  id: string,
): boolean {
  const storeData = store.read();
  const index = storeData.rules.findIndex((rule) => rule.id === id);
  if (index < 0) return false;
  storeData.rules.splice(index, 1);
  store.write(storeData);
  return true;
}

/** Rules are allow-only, so the first active match is sufficient. */
export function findMatchingExecutionApprovalRule(
  store: ExecutionApprovalStore,
  input: ExecutionApprovalMatchInput,
): ExecutionApprovalRule | undefined {
  return store
    .read()
    .rules.find((rule) => matchesExecutionApprovalRule(rule, input));
}
