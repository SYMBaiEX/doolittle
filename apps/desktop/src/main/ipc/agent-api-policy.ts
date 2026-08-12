import type { AgentTransportRequest, HttpMethod } from "../../shared/contracts";
import {
  fullyDecodeComponent,
  hasControlCharacters,
  isRecord,
  isSafeResourceId,
} from "./input-validation";

const API_ORIGIN = "http://desktop.local";
const MAX_API_BODY_BYTES = 1_000_000;
const MAX_API_RESPONSE_BYTES = 2_000_000;
const MAX_SESSION_ARCHIVE_RESPONSE_BYTES = 2_100_000;
const MAX_ARTIFACT_API_RESPONSE_BYTES = 8_000_000;
const AGENT_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "x-elizaos-client-id",
  "x-elizaos-ui-language",
]);

interface AllowedApiPath {
  exact?: string;
  predicate?: (pathname: string) => boolean;
  allowAllQueries?: boolean;
  allowedQueries?: readonly string[];
  validateQuery?: (searchParams: URLSearchParams) => boolean;
}

const DELEGATION_FILTER_QUERIES = [
  "limit",
  "group",
  "profile",
  "priority",
  "label",
  "tag",
  "parentTaskId",
  "parent",
  "status",
  "executionMode",
  "mode",
] as const;
const GATEWAY_FILTER_QUERIES = [
  "limit",
  "platform",
  "sessionId",
  "kind",
] as const;
const GATEWAY_PLATFORMS = [
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
const GATEWAY_TRACE_KINDS = [
  "receive",
  "authorize",
  "session",
  "route",
  "respond",
  "deliver",
  "update",
  "heartbeat",
  "reject",
  "lifecycle",
] as const;
const PAIRING_PLATFORMS = [
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
const TOOL_PROFILE_IDS = ["minimal", "coding", "messaging", "full"] as const;
const MCP_MARKETPLACE_SERVER_NAME = /^[\w./@-]+$/u;
const ACTIVITY_KINDS = [
  "chat-run",
  "automation",
  "delegation",
  "approval",
  "delivery",
  "terminal",
  "repository-change",
  "codegen",
  "log",
] as const;
const ACTIVITY_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
  "approved",
  "denied",
  "expired",
  "used",
  "delivered",
  "recorded",
] as const;
const ACTIVITY_TARGETS = [
  "chat",
  "review",
  "automations",
  "orchestration",
  "terminal",
  "workspace",
  "codegen",
  "operations",
] as const;

const API_ALLOWLIST: Record<HttpMethod, AllowedApiPath[]> = {
  GET: [
    { exact: "/health" },
    { exact: "/commands/catalog" },
    {
      exact: "/activity",
      allowedQueries: [
        "limit",
        "after",
        "kind",
        "status",
        "target",
        "sessionId",
      ],
      validateQuery: validateActivityFilters,
    },
    {
      exact: "/activity/export",
      allowedQueries: [
        "limit",
        "after",
        "kind",
        "status",
        "target",
        "sessionId",
      ],
      validateQuery: validateActivityFilters,
    },
    { exact: "/runtime/status" },
    { exact: "/autonomy/status" },
    { exact: "/runtime/e2b" },
    { exact: "/e2b/sandboxes" },
    {
      exact: "/runtime/models",
      allowedQueries: ["refresh"],
      validateQuery: (query) =>
        validateEnumQuery(query, "refresh", ["true", "false", "1", "0"]),
    },
    {
      exact: "/runtime/plugins",
      allowedQueries: ["view"],
      validateQuery: (query) => validateEnumQuery(query, "view", ["catalog"]),
    },
    { exact: "/runtime/accounts" },
    { exact: "/runtime/account-pool" },
    {
      exact: "/runtime/registry",
      allowedQueries: ["query", "refresh"],
      validateQuery: (query) =>
        validateTextQuery(query, "query", { maxLength: 128 }) &&
        validateEnumQuery(query, "refresh", ["true", "false", "1", "0"]),
    },
    { exact: "/runtime/compatibility" },
    { exact: "/runtime/ecosystem", allowedQueries: ["refresh"] },
    { exact: "/insights" },
    {
      exact: "/sessions",
      allowAllQueries: false,
      allowedQueries: ["limit", "projectId"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", { min: 1, max: 500 }) &&
        validateTextQuery(query, "projectId", { maxLength: 256 }),
    },
    {
      exact: "/sessions/export",
      allowedQueries: ["sessionId"],
      validateQuery: (query) =>
        validateTextQuery(query, "sessionId", {
          maxLength: 128,
          required: true,
        }),
    },
    {
      exact: "/sessions/search",
      allowAllQueries: false,
      allowedQueries: ["query", "limit", "projectId"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", { min: 1, max: 500 }) &&
        validateTextQuery(query, "projectId", { maxLength: 256 }),
    },
    {
      exact: "/sessions/messages",
      allowAllQueries: false,
      allowedQueries: ["sessionId", "limit"],
    },
    {
      exact: "/sessions/summary",
      allowAllQueries: false,
      allowedQueries: ["sessionId"],
    },
    {
      exact: "/sessions/continuity",
      allowAllQueries: false,
      allowedQueries: ["sessionId", "limit"],
    },
    {
      exact: "/sessions/usage",
      allowAllQueries: false,
      allowedQueries: ["sessionId"],
    },
    {
      exact: "/projects",
      allowedQueries: ["includeArchived"],
      validateQuery: (query) =>
        validateEnumQuery(query, "includeArchived", ["true", "false"]),
    },
    {
      predicate: (pathname) =>
        matchesResourcePath(pathname, "/projects", ["resources"]),
    },
    { exact: "/settings" },
    { exact: "/theme" },
    { exact: "/execution/status" },
    {
      exact: "/execution/approvals",
      allowedQueries: ["status"],
      validateQuery: (query) =>
        validateEnumQuery(query, "status", [
          "pending",
          "approved",
          "denied",
          "used",
          "expired",
        ]),
    },
    { exact: "/skills" },
    { exact: "/skills/summary" },
    { exact: "/skills/installed" },
    { exact: "/skills/catalog", allowedQueries: ["query"] },
    {
      exact: "/skills/proposals",
      allowedQueries: ["limit"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", { min: 0, max: 100 }),
    },
    {
      predicate: (pathname) =>
        matchesResourcePath(pathname, "/skills/proposals"),
    },
    {
      exact: "/tools",
      allowedQueries: ["profile"],
      validateQuery: (query) =>
        validateEnumQuery(query, "profile", TOOL_PROFILE_IDS),
    },
    {
      exact: "/tools/summary",
      allowedQueries: ["profile"],
      validateQuery: (query) =>
        validateEnumQuery(query, "profile", TOOL_PROFILE_IDS),
    },
    { exact: "/acp/status" },
    { exact: "/acp/editor" },
    { exact: "/mcp/status" },
    { exact: "/mcp/cached" },
    {
      exact: "/mcp/cached/search",
      allowedQueries: ["query"],
      validateQuery: (query) =>
        validateTextQuery(query, "query", { required: true, maxLength: 256 }),
    },
    {
      exact: "/mcp/tool",
      allowedQueries: ["name"],
      validateQuery: (query) =>
        validateTextQuery(query, "name", { required: true, maxLength: 256 }),
    },
    {
      exact: "/mcp/cached/describe",
      allowedQueries: ["limit"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", { min: 1, max: 100 }),
    },
    {
      exact: "/mcp/marketplace",
      allowedQueries: ["query", "limit"],
      validateQuery: (query) =>
        validateTextQuery(query, "query", { required: true, maxLength: 128 }) &&
        validateIntegerQuery(query, "limit", { min: 1, max: 20 }),
    },
    {
      exact: "/mcp/marketplace/server",
      allowedQueries: ["name"],
      validateQuery: (query) => validateMcpMarketplaceServerName(query),
    },
    {
      exact: "/acp/sessions",
      allowedQueries: ["limit"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", {
          min: 1,
          max: 25,
          required: true,
        }),
    },
    {
      exact: "/acp/session/updates",
      allowedQueries: ["sessionId", "cursor"],
      validateQuery: (query) =>
        validateTextQuery(query, "sessionId", {
          required: true,
          maxLength: 256,
        }) &&
        validateIntegerQuery(query, "cursor", { min: 0, max: 1_000_000_000 }),
    },
    {
      exact: "/acp/tools",
      allowedQueries: ["query"],
      validateQuery: (query) =>
        validateTextQuery(query, "query", { maxLength: 256 }),
    },
    { exact: "/personality" },
    { exact: "/profiles/agent" },
    { exact: "/profiles/summary" },
    { exact: "/gateway/health" },
    { exact: "/gateway/runtime" },
    { exact: "/gateway/daemon" },
    {
      exact: "/gateway/state",
      allowedQueries: GATEWAY_FILTER_QUERIES,
      validateQuery: validateGatewayFilters,
    },
    {
      exact: "/gateway/inbox",
      allowedQueries: GATEWAY_FILTER_QUERIES,
      validateQuery: validateGatewayFilters,
    },
    {
      exact: "/gateway/outbox",
      allowedQueries: GATEWAY_FILTER_QUERIES,
      validateQuery: validateGatewayFilters,
    },
    { exact: "/sessions/gateway" },
    {
      exact: "/pairing/pending",
      allowedQueries: ["platform", "limit"],
      validateQuery: validatePairingFilters,
    },
    {
      exact: "/pairing/approved",
      allowedQueries: ["platform", "limit"],
      validateQuery: validatePairingFilters,
    },
    {
      exact: "/profiles/users/recall",
      allowedQueries: ["userId", "query"],
      validateQuery: (query) =>
        validateTextQuery(query, "userId", {
          required: true,
          maxLength: 128,
        }) &&
        validateTextQuery(query, "query", {
          required: true,
          maxLength: 1_000,
        }),
    },
    { exact: "/memory", allowedQueries: ["target"] },
    { exact: "/memory/summary", allowedQueries: ["target"] },
    { exact: "/media/inspect", allowedQueries: ["path"] },
    { exact: "/runtime/media" },
    { exact: "/secrets" },
    { exact: "/analytics" },
    { exact: "/logs", allowedQueries: ["limit", "level", "query"] },
    { exact: "/cron/jobs" },
    { exact: "/cron/runs" },
    { exact: "/deliveries" },
    { exact: "/terminal/history" },
    { exact: "/browser/status" },
    {
      exact: "/browser/inspect",
      allowedQueries: ["url"],
      validateQuery: (query) => validateHttpUrlQuery(query, "url"),
    },
    { exact: "/doctor" },
    { exact: "/setup/checklist" },
    { exact: "/setup/summary" },
    { exact: "/update/preview" },
    {
      exact: "/workspace/tree",
      allowedQueries: ["depth"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "depth", { min: 0, max: 12 }),
    },
    {
      exact: "/workspace/read",
      allowedQueries: ["path"],
      validateQuery: (query) => validateWorkspacePathQuery(query, "path", true),
    },
    {
      exact: "/workspace/search",
      allowedQueries: ["query"],
      validateQuery: (query) =>
        validateTextQuery(query, "query", { required: true, maxLength: 500 }),
    },
    { exact: "/workspace/checkpoints" },
    { exact: "/repo/status" },
    { exact: "/repo/diff" },
    { exact: "/repo/log" },
    { exact: "/repo/summary" },
    { exact: "/repo/review" },
    {
      exact: "/review-record",
      allowedQueries: ["cursor", "limit"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "cursor", { min: 0, max: 1_000_000 }) &&
        validateIntegerQuery(query, "limit", { min: 1, max: 200 }),
    },
    {
      exact: "/repo/changes",
      allowedQueries: ["path", "staged"],
      validateQuery: validateRepositoryFilters,
    },
    {
      exact: "/repo/patch",
      allowedQueries: ["path", "staged"],
      validateQuery: validateRepositoryFilters,
    },
    { exact: "/repo/worktrees" },
    { exact: "/repo/branches" },
    { exact: "/repo/remotes" },
    { exact: "/repo/stashes" },
    { exact: "/repo/conflicts" },
    { exact: "/plans" },
    {
      predicate: (pathname) => matchesResourcePath(pathname, "/plans"),
    },
    {
      exact: "/delegation/tasks",
      allowedQueries: DELEGATION_FILTER_QUERIES,
      validateQuery: validateDelegationFilters,
    },
    {
      exact: "/delegation/task-summaries",
      allowedQueries: ["limit"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", { min: 1, max: 200 }),
    },
    { exact: "/delegation/overview" },
    { exact: "/delegation/overview-snapshot" },
    { exact: "/delegation/groups" },
    {
      exact: "/delegation/workers",
      allowedQueries: DELEGATION_FILTER_QUERIES,
      validateQuery: validateDelegationFilters,
    },
    {
      predicate: (pathname) =>
        matchesResourcePath(pathname, "/delegation/tasks", [
          "children",
          "tree",
        ]),
    },
    { exact: "/runtime/codegen" },
    {
      exact: "/chat/runs",
      allowedQueries: ["limit"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", { min: 1, max: 100 }),
    },
    {
      predicate: (pathname) => matchesResourcePath(pathname, "/chat/runs"),
    },
    { exact: "/codegen/runs" },
    {
      predicate: (pathname) =>
        matchesResourcePath(pathname, "/codegen/runs") ||
        matchesCodegenArtifactPath(pathname),
    },
    { exact: "/codegen/workflows" },
    {
      predicate: (pathname) =>
        matchesResourcePath(pathname, "/codegen/workflows"),
    },
  ],
  POST: [
    { exact: "/settings" },
    { exact: "/autonomy/enable" },
    { exact: "/autonomy/disable" },
    { exact: "/autonomy/interval" },
    { exact: "/runtime/registry/install" },
    { exact: "/e2b/sandboxes" },
    { exact: "/e2b/execute" },
    { exact: "/e2b/kill" },
    { exact: "/acp/initialize" },
    { exact: "/acp/session/new" },
    { exact: "/acp/session/load" },
    { exact: "/acp/session/prompt" },
    { exact: "/acp/session/cancel" },
    { exact: "/acp/editor/context" },
    { exact: "/acp/fs/read" },
    { exact: "/acp/fs/write" },
    { exact: "/acp/terminal/create" },
    { exact: "/acp/terminal/output" },
    { exact: "/acp/terminal/wait" },
    { exact: "/acp/terminal/kill" },
    { exact: "/acp/terminal/release" },
    { exact: "/acp/probe" },
    { exact: "/mcp/probe" },
    { exact: "/gateway/replay" },
    { exact: "/pairing/approve" },
    { exact: "/pairing/deny" },
    { exact: "/pairing/revoke" },
    { exact: "/theme" },
    { exact: "/personality" },
    { exact: "/skills/proposals" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/skills/proposals", [
          "approve",
          "reject",
        ]),
    },
    { exact: "/review-record/comments" },
    { exact: "/review-record/comments/migrate" },
    { exact: "/review-record/feedback-sent" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/review-record/comments", [
          "resolve",
          "reopen",
        ]),
    },
    { exact: "/sessions/title" },
    { exact: "/sessions/fork" },
    { exact: "/sessions/import/preview" },
    { exact: "/sessions/import" },
    { exact: "/sessions/project" },
    { exact: "/projects" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/projects", [
          "archive",
          "resources",
        ]),
    },
    { exact: "/accounts/refresh" },
    { exact: "/accounts/use" },
    { exact: "/accounts/connect" },
    { exact: "/accounts/login" },
    { exact: "/accounts/setup-token" },
    {
      predicate: (pathname) =>
        matchesAccountPoolActionPath(pathname, [
          "strategy",
          "select",
          "import",
        ]),
    },
    {
      predicate: (pathname) =>
        matchesAccountPoolAccountActionPath(pathname, [
          "test",
          "refresh-usage",
        ]),
    },
    { exact: "/media/analyze" },
    { exact: "/media/transcribe" },
    { exact: "/media/transcribe-attachment" },
    { exact: "/media/speak" },
    { exact: "/media/generate" },
    { exact: "/secrets/get" },
    { exact: "/secrets/set" },
    { exact: "/cron/jobs" },
    { exact: "/workspace/checkpoints" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/workspace/checkpoints", [
          "restore",
        ]),
    },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/execution/approvals", [
          "approve",
          "deny",
        ]),
    },
    { exact: "/plans/create" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/plans", ["approve", "steer"]),
    },
    { exact: "/delegation/tasks" },
    { exact: "/delegation/tasks/start-coding" },
    { exact: "/delegation/supervise" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/delegation/tasks", [
          "spawn",
          "execute",
          "note",
          "run",
          "retry",
          "cancel",
          "complete",
          "fail",
        ]),
    },
    { exact: "/codegen/generate" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/chat/runs", ["cancel"]),
    },
    { exact: "/codegen/research" },
    { exact: "/codegen/prd" },
    { exact: "/codegen/qa" },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/codegen/runs", ["cancel"]),
    },
    {
      predicate: (pathname) =>
        matchesResourceActionPath(pathname, "/codegen/workflows", ["bundle"]),
    },
    { exact: "/browser/capture" },
    { exact: "/browser/screenshot" },
    { exact: "/browser/snapshot" },
    { exact: "/browser/analyze" },
    { exact: "/browser/compare" },
    { exact: "/browser/compare/analyze" },
    {
      predicate(pathname): boolean {
        const segments = pathname.split("/");
        return (
          segments.length === 5 &&
          segments[1] === "cron" &&
          segments[2] === "jobs" &&
          isSafeCronId(segments[3]) &&
          ["pause", "resume", "run", "trigger"].includes(segments[4] ?? "")
        );
      },
    },
  ],
  PATCH: [
    {
      predicate: (pathname) => matchesAccountPoolAccountPath(pathname),
    },
    {
      predicate: (pathname) => matchesResourcePath(pathname, "/projects"),
    },
    {
      predicate: (pathname) =>
        matchesResourcePath(pathname, "/review-record/comments"),
    },
    {
      predicate(pathname): boolean {
        const segments = pathname.split("/");
        return (
          segments.length === 4 &&
          segments[1] === "cron" &&
          segments[2] === "jobs" &&
          isSafeCronId(segments[3])
        );
      },
    },
  ],
  DELETE: [
    {
      predicate: (pathname) => matchesAccountPoolAccountPath(pathname),
    },
    {
      predicate: (pathname) => matchesProjectResourcePath(pathname),
    },
    {
      predicate: (pathname) =>
        matchesResourcePath(pathname, "/review-record/comments"),
    },
    {
      predicate(pathname): boolean {
        const segments = pathname.split("/");
        return (
          segments.length === 4 &&
          segments[1] === "cron" &&
          segments[2] === "jobs" &&
          isSafeCronId(segments[3])
        );
      },
    },
  ],
};

function isAllowedQueryAllowed(
  candidate: AllowedApiPath,
  searchParams: URLSearchParams,
): boolean {
  if (candidate.allowAllQueries) return true;
  const seen = new Set<string>();
  for (const key of searchParams.keys()) {
    if (!candidate.allowedQueries?.includes(key)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return candidate.validateQuery?.(searchParams) ?? true;
}

function isSafeCronId(segment: string | undefined): boolean {
  return isSafeResourceId(segment);
}

function matchesResourcePath(
  pathname: string,
  prefix: string,
  allowedSuffixes: readonly string[] = [],
): boolean {
  const segments = pathname.split("/");
  const prefixSegments = prefix.split("/");
  if (
    segments.length !== prefixSegments.length + 1 &&
    segments.length !== prefixSegments.length + 2
  ) {
    return false;
  }
  if (
    !prefixSegments.every((segment, index) => segments[index] === segment) ||
    !isSafeResourceId(segments[prefixSegments.length])
  ) {
    return false;
  }
  if (segments.length === prefixSegments.length + 1) return true;
  return allowedSuffixes.includes(segments[prefixSegments.length + 1] ?? "");
}

function matchesResourceActionPath(
  pathname: string,
  prefix: string,
  actions: readonly string[],
): boolean {
  const segments = pathname.split("/");
  const prefixSegments = prefix.split("/");
  return (
    segments.length === prefixSegments.length + 2 &&
    prefixSegments.every((segment, index) => segments[index] === segment) &&
    isSafeResourceId(segments[prefixSegments.length]) &&
    actions.includes(segments[prefixSegments.length + 1] ?? "")
  );
}

const ACCOUNT_POOL_PROVIDER_IDS = [
  "openai-codex",
  "anthropic-subscription",
] as const;

function matchesAccountPoolActionPath(
  pathname: string,
  actions: readonly string[],
): boolean {
  const segments = pathname.split("/");
  return (
    segments.length === 5 &&
    segments[1] === "runtime" &&
    segments[2] === "account-pool" &&
    ACCOUNT_POOL_PROVIDER_IDS.includes(
      segments[3] as (typeof ACCOUNT_POOL_PROVIDER_IDS)[number],
    ) &&
    actions.includes(segments[4] ?? "")
  );
}

function matchesAccountPoolAccountPath(pathname: string): boolean {
  const segments = pathname.split("/");
  return (
    segments.length === 5 &&
    segments[1] === "runtime" &&
    segments[2] === "account-pool" &&
    ACCOUNT_POOL_PROVIDER_IDS.includes(
      segments[3] as (typeof ACCOUNT_POOL_PROVIDER_IDS)[number],
    ) &&
    isSafeResourceId(segments[4])
  );
}

function matchesAccountPoolAccountActionPath(
  pathname: string,
  actions: readonly string[],
): boolean {
  const segments = pathname.split("/");
  return (
    segments.length === 6 &&
    segments[1] === "runtime" &&
    segments[2] === "account-pool" &&
    ACCOUNT_POOL_PROVIDER_IDS.includes(
      segments[3] as (typeof ACCOUNT_POOL_PROVIDER_IDS)[number],
    ) &&
    isSafeResourceId(segments[4]) &&
    actions.includes(segments[5] ?? "")
  );
}

function matchesProjectResourcePath(pathname: string): boolean {
  const segments = pathname.split("/");
  return (
    segments.length === 5 &&
    segments[1] === "projects" &&
    isSafeResourceId(segments[2]) &&
    segments[3] === "resources" &&
    isSafeResourceId(segments[4])
  );
}

function matchesCodegenArtifactPath(pathname: string): boolean {
  const segments = pathname.split("/");
  return (
    segments.length === 6 &&
    segments[1] === "codegen" &&
    segments[2] === "runs" &&
    isSafeResourceId(segments[3]) &&
    segments[4] === "artifacts" &&
    /^(0|[1-9]\d*)$/u.test(segments[5] ?? "")
  );
}

function hasOnlyOneValue(query: URLSearchParams, key: string): boolean {
  return query.getAll(key).length <= 1;
}

function validateIntegerQuery(
  query: URLSearchParams,
  key: string,
  bounds: { min: number; max: number; required?: boolean },
): boolean {
  if (!hasOnlyOneValue(query, key)) return false;
  const value = query.get(key);
  if (value === null) return !bounds.required;
  if (!/^\d+$/u.test(value)) return false;
  const parsed = Number(value);
  return (
    Number.isSafeInteger(parsed) && parsed >= bounds.min && parsed <= bounds.max
  );
}

function validateTextQuery(
  query: URLSearchParams,
  key: string,
  options: { required?: boolean; maxLength: number },
): boolean {
  if (!hasOnlyOneValue(query, key)) return false;
  const value = query.get(key);
  if (value === null) return !options.required;
  return (
    value.trim().length > 0 &&
    value.length <= options.maxLength &&
    !hasControlCharacters(value)
  );
}

function validateMcpMarketplaceServerName(query: URLSearchParams): boolean {
  if (!hasOnlyOneValue(query, "name")) return false;
  const rawName = query.get("name");
  const name = rawName ? fullyDecodeComponent(rawName) : null;
  return Boolean(
    name &&
      name.length <= 256 &&
      !hasControlCharacters(name) &&
      MCP_MARKETPLACE_SERVER_NAME.test(name),
  );
}

function validateActivityFilters(query: URLSearchParams): boolean {
  return (
    validateIntegerQuery(query, "limit", { min: 1, max: 200 }) &&
    validateTextQuery(query, "after", { maxLength: 1_024 }) &&
    validateEnumQuery(query, "kind", ACTIVITY_KINDS) &&
    validateEnumQuery(query, "status", ACTIVITY_STATUSES) &&
    validateEnumQuery(query, "target", ACTIVITY_TARGETS) &&
    validateTextQuery(query, "sessionId", { maxLength: 256 })
  );
}

function validateHttpUrlQuery(query: URLSearchParams, key: string): boolean {
  if (query.getAll(key).length !== 1) return false;
  const value = query.get(key);
  if (!value || value.length > 4_096 || hasControlCharacters(value)) {
    return false;
  }
  const fullyDecoded = fullyDecodeComponent(value);
  if (fullyDecoded === null || hasControlCharacters(fullyDecoded)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function validateWorkspacePathQuery(
  query: URLSearchParams,
  key: string,
  required: boolean,
): boolean {
  if (!hasOnlyOneValue(query, key)) return false;
  const rawValue = query.get(key);
  if (rawValue === null) return !required;
  const value = fullyDecodeComponent(rawValue);
  if (
    !value ||
    value.length > 4_096 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    hasControlCharacters(value)
  ) {
    return false;
  }
  return !value
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

function validateOptionalFilter(query: URLSearchParams, key: string): boolean {
  if (!hasOnlyOneValue(query, key)) return false;
  const value = query.get(key);
  if (value === null) return true;
  const decoded = fullyDecodeComponent(value);
  return Boolean(
    decoded &&
      decoded.length <= 256 &&
      !decoded.includes("/") &&
      !decoded.includes("\\") &&
      !hasControlCharacters(decoded),
  );
}

function validateEnumQuery(
  query: URLSearchParams,
  key: string,
  values: readonly string[],
): boolean {
  if (!hasOnlyOneValue(query, key)) return false;
  const value = query.get(key);
  return value === null || values.includes(value);
}

function validateRepositoryFilters(query: URLSearchParams): boolean {
  return (
    validateWorkspacePathQuery(query, "path", false) &&
    validateEnumQuery(query, "staged", ["true", "false"])
  );
}

function hasAtMostOneAlias(
  query: URLSearchParams,
  keys: readonly string[],
): boolean {
  return keys.filter((key) => query.has(key)).length <= 1;
}

function validateDelegationFilters(query: URLSearchParams): boolean {
  return (
    validateIntegerQuery(query, "limit", { min: 1, max: 200 }) &&
    ["group", "profile", "label", "tag", "parentTaskId", "parent"].every(
      (key) => validateOptionalFilter(query, key),
    ) &&
    validateEnumQuery(query, "priority", ["low", "normal", "high"]) &&
    validateEnumQuery(query, "status", [
      "pending",
      "running",
      "completed",
      "failed",
      "cancelled",
    ]) &&
    validateEnumQuery(query, "executionMode", ["local", "delegated"]) &&
    validateEnumQuery(query, "mode", ["local", "delegated"]) &&
    hasAtMostOneAlias(query, ["label", "tag"]) &&
    hasAtMostOneAlias(query, ["parentTaskId", "parent"]) &&
    hasAtMostOneAlias(query, ["executionMode", "mode"])
  );
}

function validateGatewayFilters(query: URLSearchParams): boolean {
  return (
    validateIntegerQuery(query, "limit", { min: 1, max: 100 }) &&
    validateEnumQuery(query, "platform", GATEWAY_PLATFORMS) &&
    validateTextQuery(query, "sessionId", { maxLength: 256 }) &&
    validateEnumQuery(query, "kind", GATEWAY_TRACE_KINDS)
  );
}

function validatePairingFilters(query: URLSearchParams): boolean {
  return (
    validateEnumQuery(query, "platform", PAIRING_PLATFORMS) &&
    validateIntegerQuery(query, "limit", { min: 1, max: 500 })
  );
}

export function parseApiPath(path: string, method: HttpMethod): string {
  if (!path.startsWith("/") || path.includes("\\")) {
    throw new Error("Backend API path must be an absolute local path.");
  }
  const rawPathname = path.split(/[?#]/u, 1)[0] ?? "";
  const decodedPathname = fullyDecodeComponent(rawPathname);
  if (decodedPathname === null) {
    throw new Error("Backend API path contains invalid encoding.");
  }
  if (
    rawPathname.includes("//") ||
    decodedPathname.includes("\\") ||
    decodedPathname.includes("//") ||
    decodedPathname
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Backend API path contains unsafe traversal tokens.");
  }
  const parsed = new URL(path, API_ORIGIN);
  if (parsed.origin !== API_ORIGIN || parsed.username || parsed.password) {
    throw new Error("Backend API path must be local to the desktop process.");
  }
  if (parsed.hash) throw new Error("Backend API fragments are not allowed.");
  if (parsed.pathname === "/") {
    throw new Error("Backend API path is required.");
  }
  const candidate = API_ALLOWLIST[method].find(
    (entry) =>
      entry.exact === parsed.pathname || entry.predicate?.(parsed.pathname),
  );
  if (!candidate) {
    throw new Error(
      `Backend path is not available from desktop: ${parsed.pathname}`,
    );
  }
  if (!isAllowedQueryAllowed(candidate, parsed.searchParams)) {
    throw new Error(`Unsupported query on backend path: ${parsed.pathname}`);
  }

  return parsed.search
    ? `${parsed.pathname}?${parsed.searchParams.toString()}`
    : parsed.pathname;
}

export function validateAgentTransportRequest(
  unsafeRequest: unknown,
): AgentTransportRequest {
  if (!isRecord(unsafeRequest)) {
    throw new Error("Invalid Eliza desktop transport request.");
  }
  const method = unsafeRequest.method;
  if (
    method !== "GET" &&
    method !== "POST" &&
    method !== "PATCH" &&
    method !== "DELETE"
  ) {
    throw new Error("Unsupported Eliza desktop transport method.");
  }
  if (typeof unsafeRequest.path !== "string") {
    throw new Error("Eliza desktop transport path is required.");
  }
  const body = unsafeRequest.body;
  if (body !== undefined && body !== null && typeof body !== "string") {
    throw new Error("Eliza desktop transport body must be serialized text.");
  }
  if (method === "GET" && body !== undefined && body !== null) {
    throw new Error("GET Eliza desktop requests cannot include a body.");
  }
  if (
    typeof body === "string" &&
    new TextEncoder().encode(body).byteLength > MAX_API_BODY_BYTES
  ) {
    throw new Error("Desktop API request body is too large.");
  }
  if (!isRecord(unsafeRequest.headers)) {
    throw new Error("Eliza desktop transport headers are required.");
  }
  const headers: Record<string, string> = {};
  for (const [unsafeName, unsafeValue] of Object.entries(
    unsafeRequest.headers,
  )) {
    const name = unsafeName.toLowerCase();
    if (!AGENT_REQUEST_HEADERS.has(name)) continue;
    if (
      typeof unsafeValue !== "string" ||
      unsafeValue.length > 1_024 ||
      /[\r\n]/u.test(unsafeValue)
    ) {
      throw new Error(`Invalid Eliza desktop transport header: ${name}`);
    }
    headers[name] = unsafeValue;
  }
  return {
    path: unsafeRequest.path,
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  };
}

export function apiResponseLimit(path: string): number {
  if (path.startsWith("/sessions/export?")) {
    return MAX_SESSION_ARCHIVE_RESPONSE_BYTES;
  }
  return /^\/codegen\/runs\/[^/]+\/artifacts\/(?:0|[1-9]\d*)$/u.test(path)
    ? MAX_ARTIFACT_API_RESPONSE_BYTES
    : MAX_API_RESPONSE_BYTES;
}
