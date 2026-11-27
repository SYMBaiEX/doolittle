import type {
  CreateExecutionApprovalRuleInput,
  UpdateExecutionApprovalRuleInput,
} from "../../services/execution-approval/types";
import { PLATFORM_NAMES, type PlatformName } from "../../types/index";
import type { JsonObject } from "../request-body";

const PLATFORM_NAME_SET: ReadonlySet<string> = new Set(PLATFORM_NAMES);
const RULE_PATTERN_TYPES = new Set(["exact", "prefix"]);
const CREATE_KEYS = new Set([
  "patternType",
  "pattern",
  "platform",
  "userId",
  "roomId",
  "sessionKey",
  "botId",
  "sessionId",
  "expiresAt",
  "enabled",
]);
const PATCH_KEYS = new Set(CREATE_KEYS);
const SCOPE_KEYS = [
  "userId",
  "roomId",
  "sessionKey",
  "botId",
  "sessionId",
] as const;

const MAX_PATTERN_LENGTH = 1000;
const MAX_SCOPE_LENGTH = 256;
const MAX_EXPIRES_AT_LENGTH = 128;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

type ScopeKey = (typeof SCOPE_KEYS)[number];
type ValidationResult<T> = { value: T } | { error: string };

function invalid(error: string): { error: string } {
  return { error };
}

function unknownKeyError(
  body: JsonObject,
  allowed: ReadonlySet<string>,
): string | undefined {
  const key = Object.keys(body).find((entry) => !allowed.has(entry));
  return key ? `unknown approval rule field: ${key}` : undefined;
}

function validatePatternType(
  value: unknown,
  required: boolean,
): ValidationResult<"exact" | "prefix" | undefined> {
  if (value === undefined && !required) return { value: undefined };
  if (typeof value !== "string" || !RULE_PATTERN_TYPES.has(value)) {
    return invalid("patternType must be exact or prefix");
  }
  return { value: value as "exact" | "prefix" };
}

function validatePattern(
  value: unknown,
  required: boolean,
): ValidationResult<string | undefined> {
  if (value === undefined && !required) return { value: undefined };
  if (typeof value !== "string") {
    return invalid("pattern must be a string");
  }
  const pattern = value.trim();
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
    return invalid(`pattern must be 1 to ${MAX_PATTERN_LENGTH} characters`);
  }
  return { value: pattern };
}

function validateEnabled(
  value: unknown,
): ValidationResult<boolean | undefined> {
  if (value === undefined) return { value: undefined };
  if (typeof value !== "boolean") return invalid("enabled must be a boolean");
  return { value };
}

function validateExpiresAt(
  value: unknown,
  nullable: boolean,
): ValidationResult<string | null | undefined> {
  if (value === undefined) return { value: undefined };
  if (value === null && nullable) return { value: null };
  if (
    typeof value !== "string" ||
    value.length > MAX_EXPIRES_AT_LENGTH ||
    !ISO_TIMESTAMP_PATTERN.test(value)
  ) {
    return invalid("expiresAt must be an ISO timestamp");
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return invalid("expiresAt must be an ISO timestamp");
  }
  return { value: new Date(time).toISOString() };
}

function validatePlatform(
  value: unknown,
  nullable: boolean,
): ValidationResult<PlatformName | null | undefined> {
  if (value === undefined) return { value: undefined };
  if (value === null && nullable) return { value: null };
  if (typeof value !== "string" || !PLATFORM_NAME_SET.has(value)) {
    return invalid("platform is invalid");
  }
  return { value: value as PlatformName };
}

function validateScopes(
  body: JsonObject,
  nullable: boolean,
): ValidationResult<Partial<Record<ScopeKey, string | null>>> {
  const values: Partial<Record<ScopeKey, string | null>> = {};
  for (const key of SCOPE_KEYS) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null && nullable) {
      values[key] = null;
      continue;
    }
    if (typeof value !== "string") {
      return invalid(`${key} must be a string`);
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_SCOPE_LENGTH) {
      return invalid(`${key} must be 1 to ${MAX_SCOPE_LENGTH} characters`);
    }
    values[key] = trimmed;
  }
  return { value: values };
}

export function validateCreateExecutionApprovalRuleBody(
  body: JsonObject,
): ValidationResult<CreateExecutionApprovalRuleInput> {
  const unknownKey = unknownKeyError(body, CREATE_KEYS);
  if (unknownKey) return invalid(unknownKey);

  const patternType = validatePatternType(body.patternType, true);
  if ("error" in patternType) return patternType;
  const pattern = validatePattern(body.pattern, true);
  if ("error" in pattern) return pattern;
  const enabled = validateEnabled(body.enabled);
  if ("error" in enabled) return enabled;
  const expiresAt = validateExpiresAt(body.expiresAt, false);
  if ("error" in expiresAt) return expiresAt;
  const platform = validatePlatform(body.platform, false);
  if ("error" in platform) return platform;
  const scopes = validateScopes(body, false);
  if ("error" in scopes) return scopes;

  const value: CreateExecutionApprovalRuleInput = {
    patternType: patternType.value as "exact" | "prefix",
    pattern: pattern.value as string,
    ...(enabled.value !== undefined ? { enabled: enabled.value } : {}),
    ...(expiresAt.value ? { expiresAt: expiresAt.value } : {}),
    ...(platform.value ? { platform: platform.value } : {}),
  };
  for (const key of SCOPE_KEYS) {
    const scopeValue = scopes.value[key];
    if (typeof scopeValue === "string") value[key] = scopeValue;
  }
  return { value };
}

export function validateUpdateExecutionApprovalRuleBody(
  body: JsonObject,
): ValidationResult<UpdateExecutionApprovalRuleInput> {
  const unknownKey = unknownKeyError(body, PATCH_KEYS);
  if (unknownKey) return invalid(unknownKey);
  if (!Object.keys(body).some((key) => PATCH_KEYS.has(key))) {
    return invalid("at least one approval rule field is required");
  }

  const patternType = validatePatternType(body.patternType, false);
  if ("error" in patternType) return patternType;
  const pattern = validatePattern(body.pattern, false);
  if ("error" in pattern) return pattern;
  const enabled = validateEnabled(body.enabled);
  if ("error" in enabled) return enabled;
  const expiresAt = validateExpiresAt(body.expiresAt, true);
  if ("error" in expiresAt) return expiresAt;
  const platform = validatePlatform(body.platform, true);
  if ("error" in platform) return platform;
  const scopes = validateScopes(body, true);
  if ("error" in scopes) return scopes;

  const patch: UpdateExecutionApprovalRuleInput = {};
  for (const key of SCOPE_KEYS) {
    const scopeValue = scopes.value[key];
    if (scopeValue !== undefined) patch[key] = scopeValue;
  }
  if (patternType.value !== undefined) patch.patternType = patternType.value;
  if (pattern.value !== undefined) patch.pattern = pattern.value;
  if (enabled.value !== undefined) patch.enabled = enabled.value;
  if (expiresAt.value !== undefined) patch.expiresAt = expiresAt.value;
  if (platform.value !== undefined) patch.platform = platform.value;
  return { value: patch };
}

export function executionApprovalRulePath(
  pathname: string,
): { id: string } | null {
  const match = pathname.match(/^\/execution\/approval-rules\/([^/]+)$/u);
  if (!match) return null;
  let id = "";
  try {
    id = decodeURIComponent(match[1] ?? "");
  } catch {
    return null;
  }
  if (!id || id.length > 256 || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(id)) {
    return null;
  }
  return { id };
}
