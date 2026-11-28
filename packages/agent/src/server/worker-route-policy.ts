const READABLE_PATHS = new Set([
  "/sessions",
  "/sessions/search",
  "/sessions/messages",
  "/sessions/summary",
  "/sessions/continuity",
  "/sessions/usage",
  "/sessions/export",
  "/health",
  "/runtime/bot-identity",
  "/runtime/status",
  "/runtime/models",
  "/settings",
  "/projects",
  "/chat/runs",
  "/commands/catalog",
  "/terminal/history",
  "/terminal/sessions",
  "/terminal/session/output",
  "/browser/status",
  "/execution/approvals",
  "/acp/session/updates",
  "/workspace/tree",
  "/workspace/read",
  "/workspace/search",
  "/workspace/checkpoints",
  "/browser/render-targets",
  "/execution/status",
  "/execution/backends",
  "/activity",
  "/activity/export",
  "/skills",
  "/context/files",
  "/repo/status",
  "/repo/diff",
  "/repo/log",
  "/repo/summary",
  "/repo/review",
  "/repo/changes",
  "/repo/patch",
  "/repo/worktrees",
  "/repo/branches",
  "/repo/remotes",
  "/repo/stashes",
  "/repo/conflicts",
  "/review-record",
]);

const POSTABLE_PATHS = new Set([
  "/chat/runs",
  "/runtime/executions/stop-all",
  "/sessions/title",
  "/sessions/fork",
  "/sessions/project",
  "/media/transcribe-attachment",
  "/projects",
  "/acp/editor/context",
  "/acp/initialize",
  "/acp/session/new",
  "/acp/session/load",
  "/acp/session/prompt",
  "/acp/session/cancel",
  "/acp/fs/read",
  "/acp/fs/write",
  "/acp/terminal/create",
  "/acp/terminal/output",
  "/acp/terminal/wait",
  "/acp/terminal/kill",
  "/acp/terminal/release",
  "/terminal/session/start",
  "/terminal/session/input",
  "/terminal/session/resize",
  "/terminal/session/interrupt",
  "/terminal/session/close",
]);

const WORKSPACE_MUTATION_PATHS = new Set([
  "/workspace/write",
  "/repo/mutate",
  "/repo/worktrees/create",
  "/workspace/checkpoints",
]);
const CHECKPOINT_RESTORE_PATH =
  /^\/workspace\/checkpoints\/[a-zA-Z0-9_-]{1,128}\/restore$/u;

const PROJECT_RESOURCE_PATH =
  /^\/projects\/[a-zA-Z0-9:_-]{1,128}\/resources(?:\/[a-zA-Z0-9:_-]{1,128})?$/u;
const PROJECT_PATH = /^\/projects\/[a-zA-Z0-9:_-]{1,128}$/u;
// URL.pathname preserves encoded colons in a run ID. The host uses
// encodeURIComponent for consult:<id>, so both literal and %3A are valid.
const RUN_PATH = /^\/chat\/runs\/(?:[a-zA-Z0-9:_-]|%3A){1,130}(?:\/events)?$/iu;
const CANCEL_PATH = /^\/chat\/runs\/(?:[a-zA-Z0-9:_-]|%3A){1,130}\/cancel$/iu;
const STEER_PATH = /^\/chat\/runs\/(?:[a-zA-Z0-9:_-]|%3A){1,130}\/steer$/iu;
const APPROVAL_DECISION_PATH =
  /^\/execution\/approvals\/[a-zA-Z0-9:_-]{1,256}\/(?:approve|deny)$/u;

/** Named workers expose only bot-local conversation and project resources. */
export function isWorkerApiRouteAllowed(
  method: string,
  pathname: string,
  allowMutation = false,
): boolean {
  if (method === "GET") {
    return (
      READABLE_PATHS.has(pathname) ||
      PROJECT_PATH.test(pathname) ||
      PROJECT_RESOURCE_PATH.test(pathname) ||
      RUN_PATH.test(pathname)
    );
  }
  if (method === "POST") {
    return (
      (allowMutation &&
        (WORKSPACE_MUTATION_PATHS.has(pathname) ||
          CHECKPOINT_RESTORE_PATH.test(pathname))) ||
      POSTABLE_PATHS.has(pathname) ||
      CANCEL_PATH.test(pathname) ||
      STEER_PATH.test(pathname) ||
      APPROVAL_DECISION_PATH.test(pathname) ||
      PROJECT_RESOURCE_PATH.test(pathname)
    );
  }
  if (method === "PATCH") return PROJECT_PATH.test(pathname);
  if (method === "DELETE") return PROJECT_RESOURCE_PATH.test(pathname);
  return false;
}
