import {
  EXECUTION_BACKEND_NAMES,
  MAX_COMMAND_TIMEOUT_MS,
  MIN_COMMAND_TIMEOUT_MS,
} from "@doolittle/contracts/execution";
import { RUNTIME_REASONING_EFFORTS } from "@doolittle/contracts/model-route";
import { RUN_DEPTHS, TOOL_PROGRESS_MODES } from "@doolittle/contracts/run";
import { listTuiThemes } from "../../runtime/theme-catalog/index";

interface NumericSettingRule {
  min?: number;
  max?: number;
  integer?: boolean;
  exclusiveMin?: boolean;
}

const NUMERIC_SETTING_RULES: Record<string, NumericSettingRule> = {
  "model.temperature": { min: 0, max: 2 },
  "model.maxTokens": { min: 1, integer: true },
  "gateway.sessionTimeoutMinutes": { min: 0, exclusiveMin: true },
  "execution.commandTimeoutMs": {
    min: MIN_COMMAND_TIMEOUT_MS,
    max: MAX_COMMAND_TIMEOUT_MS,
    integer: true,
  },
  "execution.healthTimeoutMs": { min: 1, integer: true },
  "execution.containerPidsLimit": { min: 1, integer: true },
  "execution.sshPort": { min: 1, max: 65_535, integer: true },
  "mcp.maxRetries": { min: 0, integer: true },
  "agent.maxIterations": { min: 1, integer: true },
};

const MCP_SERVER_NUMERIC_RULES: Record<string, NumericSettingRule> = {
  timeout: { min: 1, integer: true },
  timeoutInMillis: { min: 1, integer: true },
};

const REMOTE_SYNC_MODES = ["mirror", "snapshot"] as const;
const REMOTE_ARTIFACT_POLICIES = ["metadata-only", "allowlisted"] as const;
const MCP_SERVER_TYPES = ["stdio", "http", "streamable-http", "sse"] as const;

const ENUM_SETTING_VALUES: Record<string, readonly string[]> = {
  "execution.backend": EXECUTION_BACKEND_NAMES,
  "execution.remoteSyncMode": REMOTE_SYNC_MODES,
  "execution.remoteArtifactPolicy": REMOTE_ARTIFACT_POLICIES,
  "agent.runDepth": RUN_DEPTHS,
  "agent.toolProgressMode": TOOL_PROGRESS_MODES,
  "model.reasoningEffort": RUNTIME_REASONING_EFFORTS,
  "ui.theme": listTuiThemes().map((theme) => theme.name),
};

function numericExpectation(rule: NumericSettingRule): string {
  const type = rule.integer ? "an integer" : "a finite number";
  if (rule.min !== undefined && rule.max !== undefined)
    return `${type} from ${rule.min} to ${rule.max}`;
  if (rule.min !== undefined && rule.exclusiveMin)
    return `${type} greater than ${rule.min}`;
  if (rule.min !== undefined)
    return `${type} greater than or equal to ${rule.min}`;
  if (rule.max !== undefined)
    return `${type} less than or equal to ${rule.max}`;
  return type;
}

function validateNumericSetting(
  path: string,
  value: unknown,
  rule: NumericSettingRule,
): string | undefined {
  const valid =
    typeof value === "number" &&
    Number.isFinite(value) &&
    (!rule.integer || Number.isSafeInteger(value)) &&
    (rule.min === undefined ||
      (rule.exclusiveMin ? value > rule.min : value >= rule.min)) &&
    (rule.max === undefined || value <= rule.max);
  return valid ? undefined : `${path} must be ${numericExpectation(rule)}.`;
}

function validateEnumSetting(
  path: string,
  value: unknown,
  allowed: readonly string[],
): string | undefined {
  return typeof value === "string" && allowed.includes(value)
    ? undefined
    : `${path} must be one of: ${allowed.join(", ")}.`;
}

function isHttpOrHttpsUrl(value: string): boolean {
  if (!value || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mcpServerLeaf(path: string): string | undefined {
  const segments = path.split(".");
  return segments.length === 4 &&
    segments[0] === "mcp" &&
    segments[1] === "servers" &&
    segments[2]
    ? segments[3]
    : undefined;
}

/**
 * Validate persisted values whose type or domain is fixed by the runtime
 * settings catalog. Unknown and free-form paths remain writable; constrained
 * paths reject bad input before any settings mutation or provider side effect.
 */
export function validateSettingValue(
  path: string,
  value: unknown,
): string | undefined {
  const numericRule = NUMERIC_SETTING_RULES[path];
  if (numericRule) return validateNumericSetting(path, value, numericRule);

  if (path === "model.provider") {
    // Provider IDs intentionally remain open for extension model handlers and
    // honest display of unavailable legacy routes. Empty or padded input is
    // still a write-time error rather than a persisted/effective mismatch.
    return typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim() === value
      ? undefined
      : `${path} must be a non-empty string without surrounding whitespace.`;
  }

  if (path === "model.reasoningEffort" && value === null) return undefined;
  const enumValues = ENUM_SETTING_VALUES[path];
  if (enumValues) return validateEnumSetting(path, value, enumValues);

  if (path === "model.baseUrl") {
    return typeof value === "string" &&
      (value === "" || isHttpOrHttpsUrl(value))
      ? undefined
      : `${path} must be empty or a valid HTTP or HTTPS URL.`;
  }

  const serverLeaf = mcpServerLeaf(path);
  if (serverLeaf === "type")
    return validateEnumSetting(path, value, MCP_SERVER_TYPES);
  if (serverLeaf === "url") {
    return typeof value === "string" && isHttpOrHttpsUrl(value)
      ? undefined
      : `${path} must be a valid HTTP or HTTPS URL.`;
  }
  const serverNumericRule = serverLeaf
    ? MCP_SERVER_NUMERIC_RULES[serverLeaf]
    : undefined;
  if (serverNumericRule)
    return validateNumericSetting(path, value, serverNumericRule);

  return undefined;
}

export function validateSettingChanges(
  changes: ReadonlyArray<{ path: string; value: unknown }>,
): string | undefined {
  for (const change of changes) {
    const error = validateSettingValue(change.path, change.value);
    if (error) return error;
  }
  return undefined;
}
