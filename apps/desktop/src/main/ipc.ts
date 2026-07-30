import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  ApiRequest,
  ApiRequestBody,
  AttachmentSelection,
  BackendState,
  ChatRequest,
  DesktopCommandRequest,
  DesktopCommandResult,
  DesktopLifecycleState,
  DesktopUpdateState,
  EditorProjectContextRequest,
  EditorProjectContextResult,
  FileSelection,
  HttpMethod,
  InteractiveTerminalInputRequest,
  InteractiveTerminalResizeRequest,
  InteractiveTerminalSession,
  InteractiveTerminalStartRequest,
  InteractiveTerminalStartResult,
  ProjectResourceSelection,
  ProviderAuthProvider,
  RecordedAudioImportRequest,
  RepositoryMutationDesktopResult,
  RepositoryMutationRequest,
  RepositoryMutationResult,
  RepositoryWorktree,
  RepositoryWorktreeCreateRequest,
  RepositoryWorktreeCreateResult,
  TerminalStreamRequest,
  WorkspaceFileSaveRequest,
  WorkspaceFileSaveResult,
  WorkspacePickResult,
  WorkspaceState,
} from "../shared/contracts";
import { SseParser } from "../shared/sse";
import type { BackendManager } from "./backend";
import { resolveEditorProjectContext } from "./editor-project-context";
import type { ProviderAuthController } from "./provider-auth";
import type { DesktopUpdateController } from "./update-state";

const API_ORIGIN = "http://desktop.local";
const API_TIMEOUT_MS = 15_000;
const RUNTIME_TRANSITION_TIMEOUT_MS = 45_000;
const MAX_API_BODY_BYTES = 1_000_000;
const MAX_COMMAND_LENGTH = 4_096;
const MIN_COMMAND_TIMEOUT_MS = 1_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_WORKSPACE_PATH_LENGTH = 4_096;
const MAX_WORKSPACE_FILE_BYTES = 1_000_000;
const MAX_SENSITIVE_RESPONSE_BYTES = 2_000_000;
const MAX_API_RESPONSE_BYTES = 2_000_000;
const MAX_SESSION_ARCHIVE_RESPONSE_BYTES = 2_100_000;
const MAX_ARTIFACT_API_RESPONSE_BYTES = 8_000_000;
const MAX_CHAT_ATTACHMENTS = 8;
const MAX_INTERACTIVE_TERMINAL_INPUT_BYTES = 64_000;
const MIN_INTERACTIVE_TERMINAL_COLUMNS = 20;
const MAX_INTERACTIVE_TERMINAL_COLUMNS = 400;
const MIN_INTERACTIVE_TERMINAL_ROWS = 5;
const MAX_INTERACTIVE_TERMINAL_ROWS = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface SensitiveActionConfirmationRequest {
  kind:
    | "command"
    | "terminal-session"
    | "workspace-write"
    | "worktree-create"
    | "repository-mutation";
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
}

export interface SensitiveActionIpcDependencies {
  confirm?: (request: SensitiveActionConfirmationRequest) => Promise<boolean>;
  fetch?: typeof fetch;
  notify?: (notification: DesktopBackgroundNotification) => void;
}

export interface DesktopControlIpcDependencies {
  getLifecycleState: () => DesktopLifecycleState;
  setKeepRunningInBackground: (enabled: boolean) => DesktopLifecycleState;
  updates: DesktopUpdateController;
  providerAuth?: ProviderAuthController;
}

export interface DesktopBackgroundNotification {
  title: string;
  body: string;
}

type ReadyBackendState = BackendState & {
  phase: "ready";
  url: string;
};

function isReadyBackendState(state: BackendState): state is ReadyBackendState {
  return state.phase === "ready" && Boolean(state.url);
}

function runtimeFetchErrorCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return "";
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return "";
}

export function isRecoverableRuntimeFetchError(error: unknown): boolean {
  return new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET"]).has(
    runtimeFetchErrorCode(error),
  );
}

export async function waitForReadyBackend(
  backend: BackendManager,
  timeoutMs = RUNTIME_TRANSITION_TIMEOUT_MS,
): Promise<ReadyBackendState> {
  const current = backend.getState();
  if (isReadyBackendState(current)) return current;
  if (current.phase !== "booting") {
    throw new Error("The local runtime is not ready.");
  }

  return new Promise<ReadyBackendState>((resolvePromise, rejectPromise) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (
      result: { state: ReadyBackendState } | { error: Error },
    ) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      unsubscribe();
      if ("state" in result) resolvePromise(result.state);
      else rejectPromise(result.error);
    };
    const inspect = (state: BackendState) => {
      if (isReadyBackendState(state)) {
        finish({ state });
      } else if (state.phase === "degraded" || state.phase === "stopped") {
        finish({
          error: new Error(
            state.detail || state.message || "The local runtime is not ready.",
          ),
        });
      }
    };
    timeout = setTimeout(
      () =>
        finish({
          error: new Error(
            "Timed out waiting for the local runtime to finish switching projects.",
          ),
        }),
      timeoutMs,
    );
    unsubscribe = backend.subscribe(inspect);
    inspect(backend.getState());
  });
}

export async function fetchBackendApi(
  backend: BackendManager,
  fetchImplementation: typeof fetch,
  path: string,
  init: RequestInit,
  retryDuringRuntimeTransition: boolean,
): Promise<Response> {
  const attempts = retryDuringRuntimeTransition ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let state = backend.getState();
    if (!isReadyBackendState(state)) {
      if (!retryDuringRuntimeTransition || state.phase !== "booting") {
        throw new Error("The local runtime is not ready.");
      }
      state = await waitForReadyBackend(backend);
    }

    try {
      const response = await fetchImplementation(`${state.url}${path}`, {
        ...init,
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      const latest = backend.getState();
      if (
        retryDuringRuntimeTransition &&
        attempt + 1 < attempts &&
        (!isReadyBackendState(latest) || latest.url !== state.url)
      ) {
        await waitForReadyBackend(backend);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const latest = backend.getState();
      const runtimeChanged =
        !isReadyBackendState(latest) || latest.url !== state.url;
      if (
        !retryDuringRuntimeTransition ||
        attempt + 1 >= attempts ||
        (!runtimeChanged && !isRecoverableRuntimeFetchError(error))
      ) {
        throw error;
      }
      await waitForReadyBackend(backend);
    }
  }

  throw lastError;
}

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

const API_ALLOWLIST: Record<HttpMethod, AllowedApiPath[]> = {
  GET: [
    { exact: "/health" },
    { exact: "/commands/catalog" },
    {
      exact: "/activity",
      allowedQueries: ["limit", "after"],
      validateQuery: (query) =>
        validateIntegerQuery(query, "limit", { min: 1, max: 200 }) &&
        validateTextQuery(query, "after", { maxLength: 1_024 }),
    },
    { exact: "/runtime/status" },
    {
      exact: "/runtime/models",
      allowedQueries: ["refresh"],
      validateQuery: (query) =>
        validateEnumQuery(query, "refresh", ["true", "false", "1", "0"]),
    },
    { exact: "/runtime/plugins" },
    { exact: "/runtime/accounts" },
    { exact: "/runtime/registry", allowedQueries: ["query", "refresh"] },
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
    { exact: "/tools" },
    { exact: "/tools/summary" },
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
    { exact: "/plans" },
    {
      predicate: (pathname) => matchesResourcePath(pathname, "/plans"),
    },
    {
      exact: "/delegation/tasks",
      allowedQueries: DELEGATION_FILTER_QUERIES,
      validateQuery: validateDelegationFilters,
    },
    { exact: "/delegation/overview" },
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

export function parseRequestError(response: Response): Promise<string> {
  return response.text().then((text) => {
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      return typeof parsed.error === "string"
        ? parsed.error
        : `${response.status}: ${text || response.statusText}`;
    } catch {
      const trimmed = text.trim();
      if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
        return `${response.status}: The local runtime returned an unexpected service error.`;
      }
      return trimmed || `${response.status}: ${response.statusText}`;
    }
  });
}

function resolveBody(
  method: HttpMethod,
  request: ApiRequest,
): ApiRequestBody | undefined {
  return method === "GET" ? undefined : request.body;
}

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

function fullyDecodeComponent(value: string): string | null {
  let decoded = value;
  try {
    for (let index = 0; index < 6; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    }
    return null;
  } catch {
    return null;
  }
}

function isSafeResourceId(segment: string | undefined): boolean {
  if (!segment || segment.length > 768) return false;
  const decoded = fullyDecodeComponent(segment);
  return Boolean(
    decoded &&
      decoded.length <= 256 &&
      decoded !== "." &&
      decoded !== ".." &&
      !decoded.includes("/") &&
      !decoded.includes("\\") &&
      !decoded.includes("?") &&
      !decoded.includes("#") &&
      !hasControlCharacters(decoded),
  );
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

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
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

function serializeBody(body: ApiRequestBody | undefined): string | undefined {
  if (body === undefined) return undefined;
  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_API_BODY_BYTES) {
    throw new Error("Desktop API request body is too large.");
  }
  return serialized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function validateDesktopCommandRequest(
  value: unknown,
): Required<DesktopCommandRequest> {
  if (!isRecord(value)) {
    throw new Error("A command request is required.");
  }
  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (!command) {
    throw new Error("A command is required.");
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new Error(
      `Command must be ${MAX_COMMAND_LENGTH.toLocaleString()} characters or fewer.`,
    );
  }
  if (command.includes("\0")) {
    throw new Error("Command contains an unsupported null character.");
  }
  const timeoutMs =
    value.timeoutMs === undefined
      ? DEFAULT_COMMAND_TIMEOUT_MS
      : value.timeoutMs;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_COMMAND_TIMEOUT_MS ||
    timeoutMs > MAX_COMMAND_TIMEOUT_MS
  ) {
    throw new Error(
      `Command timeout must be an integer from ${MIN_COMMAND_TIMEOUT_MS} to ${MAX_COMMAND_TIMEOUT_MS} milliseconds.`,
    );
  }
  const request = { command, timeoutMs };
  if (serializedByteLength(request) > MAX_COMMAND_LENGTH + 1_000) {
    throw new Error("Command request is too large.");
  }
  return request;
}

function validateTerminalRequestId(value: unknown): string {
  const requestId = typeof value === "string" ? value.trim() : "";
  if (
    !requestId ||
    requestId.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/u.test(requestId)
  ) {
    throw new Error("A safe terminal request id is required.");
  }
  return requestId;
}

export function validateTerminalStreamRequest(
  value: unknown,
): Required<TerminalStreamRequest> {
  if (!isRecord(value)) {
    throw new Error("A terminal stream request is required.");
  }
  return {
    requestId: validateTerminalRequestId(value.requestId),
    ...validateDesktopCommandRequest(value),
  };
}

function validateInteractiveTerminalSessionId(value: unknown): string {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(id)) {
    throw new Error("A valid interactive terminal session id is required.");
  }
  return id;
}

function validateInteractiveTerminalDimension(
  value: unknown,
  label: "columns" | "rows",
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `Terminal ${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

export function validateInteractiveTerminalStartRequest(
  value: unknown,
): InteractiveTerminalStartRequest {
  if (!isRecord(value)) {
    throw new Error("Interactive terminal dimensions are required.");
  }
  return {
    cols: validateInteractiveTerminalDimension(
      value.cols,
      "columns",
      MIN_INTERACTIVE_TERMINAL_COLUMNS,
      MAX_INTERACTIVE_TERMINAL_COLUMNS,
    ),
    rows: validateInteractiveTerminalDimension(
      value.rows,
      "rows",
      MIN_INTERACTIVE_TERMINAL_ROWS,
      MAX_INTERACTIVE_TERMINAL_ROWS,
    ),
  };
}

export function validateInteractiveTerminalInputRequest(
  value: unknown,
): InteractiveTerminalInputRequest {
  if (!isRecord(value) || typeof value.data !== "string" || !value.data) {
    throw new Error("Interactive terminal input is required.");
  }
  if (
    new TextEncoder().encode(value.data).byteLength >
    MAX_INTERACTIVE_TERMINAL_INPUT_BYTES
  ) {
    throw new Error("Interactive terminal input is too large.");
  }
  return {
    sessionId: validateInteractiveTerminalSessionId(value.sessionId),
    data: value.data,
  };
}

export function validateInteractiveTerminalResizeRequest(
  value: unknown,
): InteractiveTerminalResizeRequest {
  if (!isRecord(value)) {
    throw new Error("Interactive terminal resize details are required.");
  }
  return {
    sessionId: validateInteractiveTerminalSessionId(value.sessionId),
    cols: validateInteractiveTerminalDimension(
      value.cols,
      "columns",
      MIN_INTERACTIVE_TERMINAL_COLUMNS,
      MAX_INTERACTIVE_TERMINAL_COLUMNS,
    ),
    rows: validateInteractiveTerminalDimension(
      value.rows,
      "rows",
      MIN_INTERACTIVE_TERMINAL_ROWS,
      MAX_INTERACTIVE_TERMINAL_ROWS,
    ),
  };
}

function validateSensitiveWorkspacePath(path: unknown): string {
  if (typeof path !== "string" || !path || path !== path.trim()) {
    throw new Error("A workspace-relative file path is required.");
  }
  if (
    path.length > MAX_WORKSPACE_PATH_LENGTH ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes("\\") ||
    hasControlCharacters(path)
  ) {
    throw new Error("File path must be a safe workspace-relative path.");
  }
  const decoded = fullyDecodeComponent(path);
  if (decoded === null || decoded !== path) {
    throw new Error("Encoded file paths are not accepted.");
  }
  if (
    path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("File path contains unsafe traversal tokens.");
  }
  return path;
}

export function validateWorkspaceFileSaveRequest(
  value: unknown,
): WorkspaceFileSaveRequest {
  if (!isRecord(value)) {
    throw new Error("A workspace file save request is required.");
  }
  const path = validateSensitiveWorkspacePath(value.path);
  if (
    typeof value.content !== "string" ||
    typeof value.expectedContent !== "string"
  ) {
    throw new Error(
      "File content and its expected prior content are required.",
    );
  }
  const contentBytes = new TextEncoder().encode(value.content).byteLength;
  const expectedContentBytes = new TextEncoder().encode(
    value.expectedContent,
  ).byteLength;
  if (
    contentBytes > MAX_WORKSPACE_FILE_BYTES ||
    expectedContentBytes > MAX_WORKSPACE_FILE_BYTES
  ) {
    throw new Error(
      `Workspace files must be ${MAX_WORKSPACE_FILE_BYTES.toLocaleString()} bytes or smaller.`,
    );
  }
  const request = {
    path,
    content: value.content,
    expectedContent: value.expectedContent,
  };
  if (
    serializedByteLength(request) >
    MAX_WORKSPACE_FILE_BYTES * 2 + MAX_WORKSPACE_PATH_LENGTH + 1_000
  ) {
    throw new Error("Workspace save request is too large.");
  }
  return request;
}

export function validateWorktreeCreateRequest(
  value: unknown,
): RepositoryWorktreeCreateRequest {
  if (!isRecord(value)) {
    throw new Error("A worktree creation request is required.");
  }
  if (
    typeof value.branch !== "string" ||
    !value.branch ||
    value.branch !== value.branch.trim() ||
    value.branch.length > 255 ||
    value.branch.startsWith("-") ||
    value.branch.includes("\\") ||
    value.branch.includes("..") ||
    value.branch.includes("@{") ||
    value.branch.endsWith(".") ||
    value.branch.endsWith("/") ||
    /[\s~^:?*[\]]/u.test(value.branch) ||
    value.branch
      .split("/")
      .some((segment) => !segment || segment.endsWith(".lock")) ||
    hasControlCharacters(value.branch)
  ) {
    throw new Error("Branch name is not a valid Git branch.");
  }
  const path = validateSensitiveWorkspacePath(value.path);
  if (path.split("/").includes(".git")) {
    throw new Error("Worktree path contains an unsafe Git metadata segment.");
  }
  return { branch: value.branch, path };
}

const REPOSITORY_MUTATION_TYPES = new Set<RepositoryMutationRequest["type"]>([
  "stage",
  "unstage",
  "stage-all",
  "unstage-all",
  "discard",
  "discard-untracked",
  "stage-hunk",
  "unstage-hunk",
  "discard-hunk",
  "commit",
  "fetch",
  "pull",
  "push",
  "branch-create",
  "branch-switch",
  "branch-delete",
  "stash-create",
  "stash-apply",
  "stash-pop",
  "stash-drop",
  "worktree-remove",
  "worktree-prune",
  "remote-add",
  "remote-remove",
  "remote-set-url",
  "merge-abort",
  "merge",
  "rebase",
  "rebase-abort",
  "rebase-continue",
  "cherry-pick",
  "cherry-pick-continue",
  "cherry-pick-abort",
  "conflict-mark-resolved",
  "pr-create",
  "pr-update",
  "pr-ready",
  "pr-review",
  "pr-merge",
  "pr-close",
  "pr-reopen",
]);

function validateGitToken(
  value: unknown,
  label: string,
  maximumLength = 255,
): string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > maximumLength ||
    value.startsWith("-") ||
    hasControlCharacters(value)
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return value;
}

function validateGitPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    throw new Error("Repository operations require between 1 and 500 paths.");
  }
  const paths = value.map(validateSensitiveWorkspacePath);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Repository operation paths must be unique.");
  }
  return paths;
}

function validateGitPatch(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 240_000 ||
    value.includes("\0")
  ) {
    throw new Error("A bounded unified Git patch is required.");
  }
  return value;
}

function validateRepositoryText(
  value: unknown,
  label: string,
  maximumLength: number,
  options?: { allowEmpty?: boolean },
): string {
  if (
    typeof value !== "string" ||
    (!options?.allowEmpty && !value.trim()) ||
    value.length > maximumLength ||
    value.includes("\0")
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return options?.allowEmpty ? value : value.trim();
}

export function validateRepositoryMutationRequest(
  value: unknown,
): RepositoryMutationRequest {
  if (!isRecord(value) || !REPOSITORY_MUTATION_TYPES.has(value.type as never)) {
    throw new Error("A supported repository operation is required.");
  }
  const type = value.type as RepositoryMutationRequest["type"];
  switch (type) {
    case "stage":
    case "unstage":
    case "discard":
    case "discard-untracked":
    case "conflict-mark-resolved":
      return { type, paths: validateGitPaths(value.paths) };
    case "stage-hunk":
    case "unstage-hunk":
    case "discard-hunk":
      return { type, patch: validateGitPatch(value.patch) };
    case "commit": {
      if (
        typeof value.message !== "string" ||
        !value.message.trim() ||
        value.message.length > 20_000 ||
        value.message.includes("\0")
      ) {
        throw new Error("A commit message is required.");
      }
      return {
        type,
        message: value.message.trim(),
        amend: value.amend === true,
      };
    }
    case "fetch": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      return remote ? { type, remote } : { type };
    }
    case "pull": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      const branch =
        value.branch === undefined
          ? undefined
          : validateGitToken(value.branch, "Branch");
      return {
        type,
        ...(remote ? { remote } : {}),
        ...(branch ? { branch } : {}),
      };
    }
    case "push": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      const branch =
        value.branch === undefined
          ? undefined
          : validateGitToken(value.branch, "Branch");
      return {
        type,
        ...(remote ? { remote } : {}),
        ...(branch ? { branch } : {}),
        setUpstream: value.setUpstream === true,
      };
    }
    case "branch-create": {
      const branch = validateGitToken(value.branch, "Branch");
      const startPoint =
        value.startPoint === undefined
          ? undefined
          : validateGitToken(value.startPoint, "Start point");
      return {
        type,
        branch,
        ...(startPoint ? { startPoint } : {}),
        checkout: value.checkout === true,
      };
    }
    case "branch-switch":
      return { type, branch: validateGitToken(value.branch, "Branch") };
    case "merge":
      return {
        type,
        branch: validateGitToken(value.branch, "Branch"),
        noFf: value.noFf === true,
      };
    case "rebase":
      return { type, branch: validateGitToken(value.branch, "Branch") };
    case "cherry-pick":
      return {
        type,
        commit: validateGitToken(value.commit, "Commit reference"),
      };
    case "branch-delete":
      return {
        type,
        branch: validateGitToken(value.branch, "Branch"),
        force: value.force === true,
      };
    case "stash-create": {
      const message =
        value.message === undefined
          ? undefined
          : validateGitToken(value.message, "Stash message", 2_000);
      return {
        type,
        ...(message ? { message } : {}),
        includeUntracked: value.includeUntracked === true,
      };
    }
    case "stash-apply":
      return {
        type,
        reference: validateGitToken(value.reference, "Stash reference"),
      };
    case "stash-pop": {
      const reference =
        value.reference === undefined
          ? undefined
          : validateGitToken(value.reference, "Stash reference");
      return reference ? { type, reference } : { type };
    }
    case "stash-drop":
      return {
        type,
        reference: validateGitToken(value.reference, "Stash reference"),
      };
    case "worktree-remove":
      return {
        type,
        path: validateGitToken(
          value.path,
          "Canonical worktree path",
          MAX_WORKSPACE_PATH_LENGTH,
        ),
        force: value.force === true,
      };
    case "remote-add":
    case "remote-set-url":
      return {
        type,
        name: validateGitToken(value.name, "Remote"),
        url: validateGitToken(value.url, "Remote URL", 2_048),
      };
    case "remote-remove":
      return { type, name: validateGitToken(value.name, "Remote") };
    case "pr-create": {
      const title = validateRepositoryText(
        value.title,
        "Pull request title",
        500,
      );
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Pull request body", 50_000, {
              allowEmpty: true,
            });
      const base =
        value.base === undefined
          ? undefined
          : validateGitToken(value.base, "Base branch");
      return {
        type,
        title,
        ...(body !== undefined ? { body } : {}),
        ...(base ? { base } : {}),
        draft: value.draft === true,
      };
    }
    case "pr-update": {
      const title =
        value.title === undefined
          ? undefined
          : validateRepositoryText(value.title, "Pull request title", 500);
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Pull request body", 50_000, {
              allowEmpty: true,
            });
      const base =
        value.base === undefined
          ? undefined
          : validateGitToken(value.base, "Base branch");
      if (title === undefined && body === undefined && base === undefined) {
        throw new Error("At least one pull request field must be updated.");
      }
      return {
        type,
        ...(title ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(base ? { base } : {}),
      };
    }
    case "pr-review": {
      const event = value.event;
      if (
        event !== "approve" &&
        event !== "request-changes" &&
        event !== "comment"
      ) {
        throw new Error("Pull request review event is not valid.");
      }
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Review body", 20_000);
      if (event !== "approve" && !body) {
        throw new Error("A review body is required for this review event.");
      }
      return { type, event, ...(body ? { body } : {}) };
    }
    case "pr-merge": {
      const method = value.method;
      if (method !== "merge" && method !== "squash" && method !== "rebase") {
        throw new Error("Pull request merge method is not valid.");
      }
      return { type, method, deleteBranch: value.deleteBranch === true };
    }
    case "pr-close":
      return { type, deleteBranch: value.deleteBranch === true };
    case "stage-all":
    case "unstage-all":
    case "worktree-prune":
    case "merge-abort":
    case "rebase-abort":
    case "rebase-continue":
    case "cherry-pick-continue":
    case "cherry-pick-abort":
    case "pr-ready":
    case "pr-reopen":
      return { type };
  }
}

export function repositoryMutationConfirmation(
  request: RepositoryMutationRequest,
): Omit<SensitiveActionConfirmationRequest, "kind"> {
  const target =
    "paths" in request
      ? request.paths.slice(0, 3).join(", ") +
        (request.paths.length > 3
          ? ` and ${request.paths.length - 3} more`
          : "")
      : "branch" in request
        ? request.branch
        : "reference" in request && request.reference
          ? request.reference
          : "name" in request
            ? request.name
            : request.type;
  const destructive = new Set([
    "discard",
    "discard-untracked",
    "discard-hunk",
    "branch-delete",
    "stash-drop",
    "worktree-remove",
    "merge-abort",
    "rebase-abort",
    "remote-remove",
    "merge",
    "rebase",
    "cherry-pick",
    "pr-merge",
    "pr-close",
  ]).has(request.type);
  const remote =
    ["fetch", "pull", "push"].includes(request.type) ||
    request.type.startsWith("pr-");
  return {
    title: destructive
      ? "Confirm destructive Git operation"
      : remote
        ? "Confirm remote Git operation"
        : "Confirm Git operation",
    message: `${request.type.replaceAll("-", " ")}: ${target}`,
    detail: destructive
      ? "This operation can remove or overwrite local repository state. Review the exact target before continuing."
      : remote
        ? "This operation contacts the configured Git remote and may change local or remote branch state."
        : "Doolittle will run this typed Git operation in the selected repository.",
    confirmLabel: destructive ? "Continue" : "Run operation",
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

async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error("The local runtime response is too large.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("The local runtime response is too large.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function parseSuccessfulJson(response: Response): Promise<unknown> {
  const text = await readBoundedResponseText(
    response,
    MAX_SENSITIVE_RESPONSE_BYTES,
  );
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The local runtime returned an invalid response.");
  }
}

interface ActiveChat {
  controller: AbortController;
}

interface ActiveTerminalRun {
  controller: AbortController;
}

export interface WorkspaceIpcController {
  getState(): WorkspaceState;
  pickWorkspace(): Promise<WorkspacePickResult>;
  openWorkspace?(path: string): Promise<WorkspacePickResult>;
  switchWorkspace(path: string): Promise<WorkspacePickResult>;
  subscribe(listener: (state: WorkspaceState) => void): () => void;
}

function chatKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`;
}

function terminalKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`;
}

export function validateChatAttachmentIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CHAT_ATTACHMENTS) {
    throw new Error(
      `A chat request may include at most ${MAX_CHAT_ATTACHMENTS} attachments.`,
    );
  }
  const ids = value.map((entry) => {
    if (typeof entry !== "string" || !UUID_PATTERN.test(entry)) {
      throw new Error("A chat attachment id is invalid.");
    }
    return entry.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("A chat request cannot include duplicate attachments.");
  }
  return ids;
}

function assertChatRequest(
  request: ChatRequest,
): asserts request is ChatRequest & {
  requestId: string;
  message: string;
  roomId: string;
} {
  const message = request.message?.trim();
  if (!request.requestId) {
    throw new Error("A request id is required.");
  }
  if (!message) {
    throw new Error("A message is required.");
  }
  if (!request.roomId) {
    throw new Error("A conversation id is required.");
  }
  if (
    request.projectId !== undefined &&
    (typeof request.projectId !== "string" ||
      !isSafeResourceId(request.projectId))
  ) {
    throw new Error("A project id is invalid.");
  }
  const attachmentIds = validateChatAttachmentIds(request.attachmentIds);
  if (
    attachmentIds.length > 0 &&
    (message.startsWith("/") || message.startsWith("!"))
  ) {
    throw new Error("Command messages cannot include attachments.");
  }
}

async function showSensitiveActionConfirmation(
  getMainWindow: () => BrowserWindow | null,
  request: SensitiveActionConfirmationRequest,
): Promise<boolean> {
  // Keep this load lazy so the validation helpers remain runnable outside the
  // Electron process in unit tests.
  const nativeDialog = (require("electron") as typeof import("electron"))
    .dialog;
  if (!nativeDialog) {
    throw new Error("The native confirmation dialog is unavailable.");
  }
  const options = {
    type: "warning" as const,
    title: request.title,
    message: request.message,
    detail: request.detail,
    buttons: [request.confirmLabel, "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const mainWindow = getMainWindow();
  const result =
    mainWindow && !mainWindow.isDestroyed()
      ? await nativeDialog.showMessageBox(mainWindow, options)
      : await nativeDialog.showMessageBox(options);
  return result.response === 0;
}

export function registerIpc(
  ipcMain: IpcMain,
  backend: BackendManager,
  getMainWindow: () => BrowserWindow | null,
  pickFiles: () => Promise<FileSelection>,
  workspace: WorkspaceIpcController,
  sensitiveActionDependencies: SensitiveActionIpcDependencies = {},
  pickChatAttachments: () => Promise<AttachmentSelection> = async () => ({
    canceled: true,
    attachments: [],
  }),
  pickProjectFiles: () => Promise<ProjectResourceSelection> = async () => ({
    canceled: true,
    kind: "file",
    paths: [],
  }),
  pickProjectFolders: () => Promise<ProjectResourceSelection> = async () => ({
    canceled: true,
    kind: "folder",
    paths: [],
  }),
  importRecordedAudio?: (
    request: RecordedAudioImportRequest,
  ) => AttachmentSelection["attachments"][number],
  desktopControls?: DesktopControlIpcDependencies,
): () => void {
  const activeChats = new Map<string, ActiveChat>();
  const activeTerminalRuns = new Map<string, ActiveTerminalRun>();
  let disposeDesktopControls: (() => void) | undefined;
  const confirmSensitiveAction =
    sensitiveActionDependencies.confirm ??
    ((request: SensitiveActionConfirmationRequest) =>
      showSensitiveActionConfirmation(getMainWindow, request));
  const sensitiveFetch = sensitiveActionDependencies.fetch ?? fetch;
  const notify = sensitiveActionDependencies.notify ?? (() => undefined);
  const notifyBackground = (notification: DesktopBackgroundNotification) => {
    try {
      notify(notification);
    } catch {
      // OS notification failures are non-critical and must never turn a
      // successful agent or terminal result into a failed desktop request.
    }
  };
  const validateProviderAuthProvider = (
    provider: unknown,
  ): ProviderAuthProvider => {
    if (provider === "codex" || provider === "claude-code") return provider;
    throw new Error("Provider sign in is only available for Codex and Claude.");
  };
  const requestInteractiveTerminal = async (
    path:
      | "/terminal/session/start"
      | "/terminal/session/input"
      | "/terminal/session/resize"
      | "/terminal/session/interrupt"
      | "/terminal/session/close"
      | `/terminal/session/output?${string}`,
    method: "GET" | "POST",
    body?: object,
  ): Promise<unknown> => {
    const state = backend.getState();
    if (state.phase !== "ready" || !state.url) {
      throw new Error("The local runtime is not ready.");
    }
    const response = await sensitiveFetch(`${state.url}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Interactive terminal request failed: ${(
          await parseRequestError(response)
        ).trim()}`,
      );
    }
    return parseSuccessfulJson(response);
  };

  const emitBackendState = () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("backend:state", backend.getState());
    }
  };
  const unsubscribeBackend = backend.subscribe(emitBackendState);
  const emitWorkspaceState = (state: WorkspaceState) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workspace:state", state);
    }
  };
  const unsubscribeWorkspace = workspace.subscribe(emitWorkspaceState);

  ipcMain.handle("backend:get-state", () => backend.getState());
  ipcMain.handle("backend:retry", () => backend.restart());
  ipcMain.handle("workspace:get-state", () => workspace.getState());
  ipcMain.handle("workspace:pick", () => workspace.pickWorkspace());
  ipcMain.handle("workspace:open", (_event, path: unknown) => {
    if (typeof path !== "string" || path.length > MAX_WORKSPACE_PATH_LENGTH) {
      throw new Error("A valid workspace path is required.");
    }
    if (!workspace.openWorkspace) {
      throw new Error("Opening a workspace path is unavailable.");
    }
    return workspace.openWorkspace(path);
  });
  ipcMain.handle("workspace:switch-recent", (_event, path: unknown) => {
    if (typeof path !== "string" || path.length > MAX_WORKSPACE_PATH_LENGTH) {
      throw new Error("A valid recent workspace path is required.");
    }
    return workspace.switchWorkspace(path);
  });
  if (desktopControls) {
    const emitUpdateState = (state: DesktopUpdateState) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("update:state", state);
    };
    const unsubscribeUpdates =
      desktopControls.updates.subscribe(emitUpdateState);
    ipcMain.handle(
      "desktop:lifecycle-state",
      desktopControls.getLifecycleState,
    );
    ipcMain.handle(
      "desktop:set-background-mode",
      (_event, enabled: unknown) => {
        if (typeof enabled !== "boolean")
          throw new Error("Background mode must be a boolean.");
        return desktopControls.setKeepRunningInBackground(enabled);
      },
    );
    ipcMain.handle("update:get-state", desktopControls.updates.getState);
    ipcMain.handle("update:check", () => desktopControls.updates.check());
    ipcMain.handle("update:download", () => desktopControls.updates.download());
    ipcMain.handle("update:install", () => desktopControls.updates.install());
    const originalDispose = unsubscribeUpdates;
    // Keep the unsubscribe reachable from the shared disposer below.
    const existingDispose = disposeDesktopControls;
    disposeDesktopControls = () => {
      existingDispose?.();
      originalDispose();
    };
  }
  ipcMain.handle("dialog:pick-files", pickFiles);
  ipcMain.handle("dialog:pick-project-files", pickProjectFiles);
  ipcMain.handle("dialog:pick-project-folders", pickProjectFolders);
  ipcMain.handle("dialog:pick-chat-attachments", pickChatAttachments);
  ipcMain.handle(
    "chat:import-recorded-audio",
    (_event, request: RecordedAudioImportRequest) => {
      if (!importRecordedAudio) {
        throw new Error("Recorded audio import is unavailable.");
      }
      return importRecordedAudio(request);
    },
  );
  ipcMain.handle(
    "terminal:run-confirmed",
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: DesktopCommandRequest,
    ): Promise<DesktopCommandResult> => {
      const request = validateDesktopCommandRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "command",
        title: "Run command in this workspace?",
        message: request.command,
        detail: `Doolittle will run this command in the selected workspace. It will stop after at most ${Math.round(
          request.timeoutMs / 1_000,
        )} seconds.`,
        confirmLabel: "Run command",
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(`${state.url}/terminal/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(request.timeoutMs + 5_000),
      });
      if (!response.ok) {
        throw new Error(
          `Command failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      return {
        status: "completed",
        result: isRecord(payload) ? payload.result : payload,
      };
    },
  );
  ipcMain.handle(
    "terminal:stream-start",
    async (event: IpcMainInvokeEvent, unsafeRequest: TerminalStreamRequest) => {
      const request = validateTerminalStreamRequest(unsafeRequest);
      const key = terminalKey(event, request.requestId);
      if (activeTerminalRuns.has(key)) {
        throw new Error("This terminal request is already running.");
      }

      const emitEvent = (payload: { event: string; data: unknown }) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("terminal:event", {
            requestId: request.requestId,
            ...payload,
          });
        }
      };
      const controller = new AbortController();
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        activeTerminalRuns.delete(key);
        event.sender.removeListener("destroyed", cleanup);
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };
      activeTerminalRuns.set(key, { controller });
      event.sender.once("destroyed", cleanup);

      try {
        const confirmed = await confirmSensitiveAction({
          kind: "command",
          title: "Run command in this workspace?",
          message: request.command,
          detail: `Doolittle will stream this command from the selected workspace. You can stop it at any time, and it will stop automatically after at most ${Math.round(
            request.timeoutMs / 1_000,
          )} seconds.`,
          confirmLabel: "Run command",
        });
        if (!confirmed || controller.signal.aborted) {
          emitEvent({
            event: "terminal.cancelled",
            data: {
              reason: controller.signal.aborted
                ? "Command stopped before it started."
                : "Command was cancelled before it started.",
            },
          });
          return;
        }

        const state = backend.getState();
        if (state.phase !== "ready" || !state.url) {
          throw new Error("The local runtime is not ready.");
        }
        const response = await sensitiveFetch(
          `${state.url}/terminal/run/stream`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              command: request.command,
              timeoutMs: request.timeoutMs,
            }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(
            `Command failed: ${(await parseRequestError(response)).trim()}`,
          );
        }
        if (!response.body) {
          throw new Error("The runtime returned an empty terminal stream.");
        }

        const parser = new SseParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const chunk = decoder.decode(result.value, { stream: true });
          for (const eventMessage of parser.push(chunk)) {
            emitEvent(eventMessage);
            if (eventMessage.event === "terminal.completed") {
              notifyBackground({
                title: "Command complete",
                body: "Your terminal task finished in Doolittle.",
              });
            }
          }
        }
        for (const eventMessage of parser.finish()) {
          emitEvent(eventMessage);
          if (eventMessage.event === "terminal.completed") {
            notifyBackground({
              title: "Command complete",
              body: "Your terminal task finished in Doolittle.",
            });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          emitEvent({
            event: "terminal.cancelled",
            data: { reason: "Command stopped by the operator." },
          });
        } else {
          emitEvent({
            event: "error",
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          notifyBackground({
            title: "Command needs attention",
            body: "A terminal task stopped with an error in Doolittle.",
          });
          throw error;
        }
      } finally {
        cleanup();
      }
    },
  );
  ipcMain.handle(
    "terminal:stream-cancel",
    (event: IpcMainInvokeEvent, requestId: string) => {
      const validated = validateTerminalRequestId(requestId);
      const active = activeTerminalRuns.get(terminalKey(event, validated));
      active?.controller.abort();
    },
  );
  ipcMain.handle(
    "terminal:session-start-confirmed",
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalStartRequest,
    ): Promise<InteractiveTerminalStartResult> => {
      const request = validateInteractiveTerminalStartRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "terminal-session",
        title: "Open an interactive terminal?",
        message: "Workspace shell",
        detail:
          "Doolittle will open a real local pseudo-terminal in the selected workspace. Commands you type will run until you close the session.",
        confirmLabel: "Open terminal",
      });
      if (!confirmed) return { status: "cancelled" };
      const payload = await requestInteractiveTerminal(
        "/terminal/session/start",
        "POST",
        request,
      );
      if (!isRecord(payload) || !isRecord(payload.session)) {
        throw new Error("The runtime returned an invalid terminal session.");
      }
      return {
        status: "started",
        session: payload.session as unknown as InteractiveTerminalSession,
      };
    },
  );
  ipcMain.handle(
    "terminal:session-input",
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalInputRequest,
    ) => {
      const request = validateInteractiveTerminalInputRequest(unsafeRequest);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/input",
        "POST",
        request,
      );
      return isRecord(payload) ? payload.session : undefined;
    },
  );
  ipcMain.handle(
    "terminal:session-resize",
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalResizeRequest,
    ) => {
      const request = validateInteractiveTerminalResizeRequest(unsafeRequest);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/resize",
        "POST",
        request,
      );
      return isRecord(payload) ? payload.session : undefined;
    },
  );
  ipcMain.handle(
    "terminal:session-interrupt",
    async (_event: IpcMainInvokeEvent, unsafeSessionId: string) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/interrupt",
        "POST",
        { sessionId },
      );
      return isRecord(payload) ? payload.session : undefined;
    },
  );
  ipcMain.handle(
    "terminal:session-close",
    async (_event: IpcMainInvokeEvent, unsafeSessionId: string) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/close",
        "POST",
        { sessionId },
      );
      return isRecord(payload) ? payload.session : undefined;
    },
  );
  ipcMain.handle(
    "terminal:session-output",
    async (
      _event: IpcMainInvokeEvent,
      unsafeSessionId: string,
      unsafeCursor: number,
    ) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const cursor =
        typeof unsafeCursor === "number" &&
        Number.isSafeInteger(unsafeCursor) &&
        unsafeCursor >= 0
          ? unsafeCursor
          : 0;
      return requestInteractiveTerminal(
        `/terminal/session/output?sessionId=${encodeURIComponent(
          sessionId,
        )}&cursor=${cursor}`,
        "GET",
      );
    },
  );
  ipcMain.handle(
    "provider-auth:start",
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.start(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  ipcMain.handle(
    "provider-auth:state",
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.getState(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  ipcMain.handle(
    "provider-auth:cancel",
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.cancel(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  ipcMain.handle(
    "provider-auth:acknowledge",
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.acknowledge(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  ipcMain.handle(
    "editor:project-context",
    (
      _event: IpcMainInvokeEvent,
      request: EditorProjectContextRequest,
    ): EditorProjectContextResult => resolveEditorProjectContext(request),
  );
  ipcMain.handle(
    "workspace:save-confirmed",
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: WorkspaceFileSaveRequest,
    ): Promise<WorkspaceFileSaveResult> => {
      const request = validateWorkspaceFileSaveRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "workspace-write",
        title: "Save workspace file?",
        message: request.path,
        detail: `Doolittle will write ${new TextEncoder()
          .encode(request.content)
          .byteLength.toLocaleString()} bytes. The save will stop if the file changed after you opened it.`,
        confirmLabel: "Save changes",
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(`${state.url}/workspace/write`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (response.status === 409) {
        return {
          status: "conflict",
          message: (await parseRequestError(response)).trim(),
        };
      }
      if (!response.ok) {
        throw new Error(
          `Save failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      const savedPath = isRecord(payload) ? payload.path : undefined;
      if (typeof savedPath !== "string" || !savedPath) {
        throw new Error("The local runtime did not confirm the saved path.");
      }
      return { status: "saved", path: savedPath };
    },
  );
  ipcMain.handle(
    "repository:create-worktree-confirmed",
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: RepositoryWorktreeCreateRequest,
    ): Promise<RepositoryWorktreeCreateResult> => {
      const request = validateWorktreeCreateRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "worktree-create",
        title: "Create Git worktree?",
        message: request.branch,
        detail: `Doolittle will create a new branch and worktree at ${request.path}, inside the selected workspace.`,
        confirmLabel: "Create worktree",
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(
        `${state.url}/repo/worktrees/create`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Worktree creation failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      const worktree = isRecord(payload) ? payload.worktree : undefined;
      if (
        !isRecord(worktree) ||
        typeof worktree.path !== "string" ||
        !worktree.path ||
        typeof worktree.detached !== "boolean" ||
        typeof worktree.bare !== "boolean" ||
        typeof worktree.prunable !== "boolean"
      ) {
        throw new Error("The local runtime did not confirm the new worktree.");
      }
      const confirmedWorktree: RepositoryWorktree = {
        path: worktree.path,
        detached: worktree.detached,
        bare: worktree.bare,
        prunable: worktree.prunable,
      };
      if (typeof worktree.head === "string") {
        confirmedWorktree.head = worktree.head;
      }
      if (typeof worktree.branch === "string") {
        confirmedWorktree.branch = worktree.branch;
      }
      return {
        status: "created",
        worktree: confirmedWorktree,
      };
    },
  );
  ipcMain.handle(
    "repository:mutate-confirmed",
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: RepositoryMutationRequest,
    ): Promise<RepositoryMutationDesktopResult> => {
      const request = validateRepositoryMutationRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "repository-mutation",
        ...repositoryMutationConfirmation(request),
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(`${state.url}/repo/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(MAX_COMMAND_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Git operation failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      const result = isRecord(payload) ? payload.result : undefined;
      if (
        !isRecord(result) ||
        result.type !== request.type ||
        typeof result.ok !== "boolean" ||
        typeof result.summary !== "string" ||
        typeof result.stdout !== "string" ||
        typeof result.stderr !== "string" ||
        typeof result.exitCode !== "number"
      ) {
        throw new Error("The local runtime returned an invalid Git result.");
      }
      const validatedResult: RepositoryMutationResult = {
        type: request.type,
        ok: result.ok,
        summary: result.summary,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
      if (typeof result.error === "string") {
        validatedResult.error = result.error;
      }
      return { status: "completed", result: validatedResult };
    },
  );
  ipcMain.handle(
    "api:request",
    async (_event: IpcMainInvokeEvent, request: ApiRequest) => {
      const method = request.method ?? "GET";
      if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
        throw new Error("Unsupported desktop API method.");
      }
      if (method === "GET" && "body" in request && request.body !== undefined) {
        throw new Error("GET desktop API requests cannot include a body.");
      }
      const path = parseApiPath(request.path, method);
      const body = serializeBody(resolveBody(method, request));
      const response = await fetchBackendApi(
        backend,
        sensitiveFetch,
        path,
        {
          method,
          headers:
            body !== undefined
              ? {
                  "content-type": "application/json",
                }
              : undefined,
          body,
        },
        method === "GET",
      );

      if (!response.ok) {
        throw new Error(
          `Backend API request failed: ${(await parseRequestError(response)).trim()}`,
        );
      }

      const text = await readBoundedResponseText(
        response,
        apiResponseLimit(path),
      );
      if (!text.trim()) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
  );

  ipcMain.handle("chat:start", async (event, request: ChatRequest) => {
    assertChatRequest(request);
    const state = backend.getState();
    if (state.phase !== "ready" || !state.url) {
      throw new Error("The local runtime is not ready.");
    }

    const key = chatKey(event, request.requestId);
    if (activeChats.has(key)) {
      throw new Error("This chat request is already running.");
    }

    const controller = new AbortController();
    const emitEvent = (payload: { event: string; data: unknown }) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("chat:event", {
          requestId: request.requestId,
          ...payload,
        });
      }
    };
    const cleanup = () => {
      activeChats.delete(key);
      event.sender.removeListener("destroyed", cleanup);
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };
    activeChats.set(key, { controller });
    event.sender.once("destroyed", cleanup);

    try {
      const response = await sensitiveFetch(`${state.url}/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: request.message.trim(),
          roomId: request.roomId,
          runId: request.requestId,
          userId: "desktop-user",
          source: "desktop",
          stream: true,
          projectId: request.projectId,
          attachmentIds: validateChatAttachmentIds(request.attachmentIds),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await parseRequestError(response));
      }
      if (!response.body) {
        throw new Error("The runtime returned an empty stream.");
      }

      const parser = new SseParser();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = decoder.decode(result.value, { stream: true });
        for (const eventMessage of parser.push(chunk)) {
          emitEvent(eventMessage);
          if (eventMessage.event === "response.completed") {
            notifyBackground({
              title: "Doolittle is ready",
              body: "Your response is ready.",
            });
          }
        }
      }
      for (const eventMessage of parser.finish()) {
        emitEvent(eventMessage);
        if (eventMessage.event === "response.completed") {
          notifyBackground({
            title: "Doolittle is ready",
            body: "Your response is ready.",
          });
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        emitEvent({ event: "cancelled", data: null });
      } else {
        emitEvent({
          event: "error",
          data: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        notifyBackground({
          title: "Doolittle needs attention",
          body: "A response stopped with an error.",
        });
        throw error;
      }
    } finally {
      cleanup();
    }
  });

  ipcMain.handle("chat:cancel", async (event, requestId: string) => {
    const active = activeChats.get(chatKey(event, requestId));
    if (!active) return;
    const state = backend.getState();
    if (state.phase !== "ready" || !state.url) {
      throw new Error("The local runtime is not ready.");
    }
    // Request server-side cancellation before closing the renderer stream. This
    // is what reaches the provider/tool abort signal; aborting fetch alone is
    // only a local transport teardown.
    const response = await sensitiveFetch(
      `${state.url}/chat/runs/${encodeURIComponent(requestId)}/cancel`,
      {
        method: "POST",
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(await parseRequestError(response));
    }
    const payload = await parseSuccessfulJson(response);
    const run =
      isRecord(payload) && isRecord(payload.run) ? payload.run : undefined;
    if (run && !event.sender.isDestroyed()) {
      event.sender.send("chat:event", {
        requestId,
        event: "agent.run",
        data: { type: "cancelled", sessionId: run.sessionId, run },
      });
    }
    active.controller.abort();
  });

  return () => {
    unsubscribeBackend();
    unsubscribeWorkspace();
    disposeDesktopControls?.();
    desktopControls?.providerAuth?.dispose();
    for (const active of activeChats.values()) {
      active.controller.abort();
    }
    activeChats.clear();
    for (const active of activeTerminalRuns.values()) {
      active.controller.abort();
    }
    activeTerminalRuns.clear();
    ipcMain.removeHandler("backend:get-state");
    ipcMain.removeHandler("backend:retry");
    ipcMain.removeHandler("workspace:get-state");
    ipcMain.removeHandler("workspace:pick");
    ipcMain.removeHandler("workspace:open");
    ipcMain.removeHandler("workspace:switch-recent");
    ipcMain.removeHandler("desktop:lifecycle-state");
    ipcMain.removeHandler("desktop:set-background-mode");
    ipcMain.removeHandler("update:get-state");
    ipcMain.removeHandler("update:check");
    ipcMain.removeHandler("update:download");
    ipcMain.removeHandler("update:install");
    ipcMain.removeHandler("dialog:pick-files");
    ipcMain.removeHandler("dialog:pick-project-files");
    ipcMain.removeHandler("dialog:pick-project-folders");
    ipcMain.removeHandler("dialog:pick-chat-attachments");
    ipcMain.removeHandler("chat:import-recorded-audio");
    ipcMain.removeHandler("provider-auth:start");
    ipcMain.removeHandler("provider-auth:state");
    ipcMain.removeHandler("provider-auth:cancel");
    ipcMain.removeHandler("provider-auth:acknowledge");
    ipcMain.removeHandler("terminal:run-confirmed");
    ipcMain.removeHandler("terminal:stream-start");
    ipcMain.removeHandler("terminal:stream-cancel");
    ipcMain.removeHandler("terminal:session-start-confirmed");
    ipcMain.removeHandler("terminal:session-input");
    ipcMain.removeHandler("terminal:session-resize");
    ipcMain.removeHandler("terminal:session-interrupt");
    ipcMain.removeHandler("terminal:session-close");
    ipcMain.removeHandler("terminal:session-output");
    ipcMain.removeHandler("editor:project-context");
    ipcMain.removeHandler("workspace:save-confirmed");
    ipcMain.removeHandler("repository:create-worktree-confirmed");
    ipcMain.removeHandler("repository:mutate-confirmed");
    ipcMain.removeHandler("api:request");
    ipcMain.removeHandler("chat:start");
    ipcMain.removeHandler("chat:cancel");
  };
}
