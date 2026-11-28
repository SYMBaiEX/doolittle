import { asArray, asRecord, asString } from "./value-guards";

export type ApprovalRulePatternType = "exact" | "prefix";

/** Mirrors the runtime gateway platform vocabulary accepted by approval-rule routes. */
export const APPROVAL_RULE_PLATFORM_OPTIONS = [
  "api",
  "cli",
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "email",
  "sms",
  "mattermost",
  "homeassistant",
  "dingtalk",
] as const;

export interface ExecutionApprovalRule {
  id: string;
  patternType: ApprovalRulePatternType;
  pattern: string;
  platform?: string;
  userId?: string;
  roomId?: string;
  sessionKey?: string;
  botId?: string;
  sessionId?: string;
  createdAt: string;
  expiresAt?: string;
  enabled: boolean;
}

export interface ApprovalRulesResponse {
  rules?: unknown[];
}

export interface ApprovalRuleDraft {
  patternType: ApprovalRulePatternType;
  pattern: string;
  enabled: boolean;
  /** HTML datetime-local value in the operator's local timezone. */
  expiresAtLocal: string;
  platform: string;
  userId: string;
  roomId: string;
  sessionKey: string;
  botId: string;
  sessionId: string;
}

export const APPROVAL_RULE_TEXT_SCOPES = [
  ["userId", "User ID"],
  ["roomId", "Room ID"],
  ["sessionKey", "Session key"],
  ["botId", "Bot ID"],
  ["sessionId", "Session ID"],
] as const satisfies ReadonlyArray<
  readonly [
    keyof Pick<
      ApprovalRuleDraft,
      "userId" | "roomId" | "sessionKey" | "botId" | "sessionId"
    >,
    string,
  ]
>;

const MAX_PATTERN_LENGTH = 1_000;
const MAX_SCOPE_LENGTH = 256;

type ApprovalRuleBodyResult =
  | { create: Record<string, unknown>; patch: Record<string, unknown> }
  | { error: string };

function optionalString(value: unknown): string | undefined {
  const text = asString(value).trim();
  return text || undefined;
}

export function emptyApprovalRuleDraft(): ApprovalRuleDraft {
  return {
    patternType: "exact",
    pattern: "",
    enabled: true,
    expiresAtLocal: "",
    platform: "",
    userId: "",
    roomId: "",
    sessionKey: "",
    botId: "",
    sessionId: "",
  };
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoToDateTimeLocal(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

export function dateTimeLocalToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function approvalRuleDraftFromRule(
  rule: ExecutionApprovalRule,
): ApprovalRuleDraft {
  return {
    patternType: rule.patternType,
    pattern: rule.pattern,
    enabled: rule.enabled,
    expiresAtLocal: isoToDateTimeLocal(rule.expiresAt),
    platform: rule.platform ?? "",
    userId: rule.userId ?? "",
    roomId: rule.roomId ?? "",
    sessionKey: rule.sessionKey ?? "",
    botId: rule.botId ?? "",
    sessionId: rule.sessionId ?? "",
  };
}

export function normalizeApprovalRule(
  value: unknown,
): ExecutionApprovalRule | null {
  const record = asRecord(value);
  const id = asString(record.id).trim();
  const pattern = asString(record.pattern).trim();
  const patternType = record.patternType;
  if (
    !id ||
    !pattern ||
    (patternType !== "exact" && patternType !== "prefix")
  ) {
    return null;
  }
  const rule: ExecutionApprovalRule = {
    id,
    patternType,
    pattern,
    createdAt: asString(record.createdAt),
    enabled: record.enabled !== false,
  };
  const platform = optionalString(record.platform);
  const userId = optionalString(record.userId);
  const roomId = optionalString(record.roomId);
  const sessionKey = optionalString(record.sessionKey);
  const botId = optionalString(record.botId);
  const sessionId = optionalString(record.sessionId);
  const expiresAt = optionalString(record.expiresAt);
  if (platform) rule.platform = platform;
  if (userId) rule.userId = userId;
  if (roomId) rule.roomId = roomId;
  if (sessionKey) rule.sessionKey = sessionKey;
  if (botId) rule.botId = botId;
  if (sessionId) rule.sessionId = sessionId;
  if (expiresAt) rule.expiresAt = expiresAt;
  return rule;
}

export function normalizeApprovalRules(
  response: ApprovalRulesResponse | null | undefined,
): ExecutionApprovalRule[] {
  return asArray(response?.rules)
    .map(normalizeApprovalRule)
    .filter((rule): rule is ExecutionApprovalRule => Boolean(rule));
}

export function approvalRuleScopeSummary(rule: ExecutionApprovalRule): string {
  const entries = [
    rule.platform ? `platform ${rule.platform}` : "",
    rule.userId ? `user ${rule.userId}` : "",
    rule.roomId ? `room ${rule.roomId}` : "",
    rule.sessionKey ? `session key ${rule.sessionKey}` : "",
    rule.botId ? `bot ${rule.botId}` : "",
    rule.sessionId ? `session ${rule.sessionId}` : "",
  ].filter(Boolean);
  return entries.length ? entries.join(" · ") : "All platforms and scopes";
}

export function approvalRuleStatus(
  rule: ExecutionApprovalRule,
  nowMs = Date.now(),
): {
  label: "Disabled" | "Expired" | "Enabled";
  tone: "neutral" | "warn" | "good";
} {
  if (!rule.enabled) return { label: "Disabled", tone: "neutral" };
  const expiresAtMs = rule.expiresAt ? Date.parse(rule.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return { label: "Expired", tone: "warn" };
  }
  return { label: "Enabled", tone: "good" };
}

/** Build backend-shaped create and update bodies from one editor draft. */
export function approvalRuleRequestBodies(
  draft: ApprovalRuleDraft,
): ApprovalRuleBodyResult {
  const pattern = draft.pattern.trim();
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
    return { error: `pattern must be 1 to ${MAX_PATTERN_LENGTH} characters` };
  }
  const expiresAt = dateTimeLocalToIso(draft.expiresAtLocal);
  if (draft.expiresAtLocal.trim() && !expiresAt) {
    return { error: "expiresAt must be an ISO timestamp" };
  }
  const platform = draft.platform.trim();

  const scopes: Array<[string, string]> = [];
  for (const [key] of APPROVAL_RULE_TEXT_SCOPES) {
    const value = draft[key].trim();
    if (value.length > MAX_SCOPE_LENGTH) {
      return { error: `${key} must be 1 to ${MAX_SCOPE_LENGTH} characters` };
    }
    scopes.push([key, value]);
  }

  const create: Record<string, unknown> = {
    patternType: draft.patternType,
    pattern,
    enabled: draft.enabled,
  };
  const patch: Record<string, unknown> = {
    patternType: draft.patternType,
    pattern,
    enabled: draft.enabled,
    expiresAt: expiresAt ?? null,
    platform: platform || null,
  };
  if (expiresAt) create.expiresAt = expiresAt;
  if (platform) create.platform = platform;
  for (const [key, value] of scopes) {
    if (value) create[key] = value;
    patch[key] = value || null;
  }
  return { create, patch };
}
