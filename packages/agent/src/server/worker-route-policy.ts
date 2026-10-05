/** Named workers expose only bot-local conversation and project resources. */
export function isWorkerApiRouteAllowed(
  method: string,
  pathname: string,
  allowMutation = false,
): boolean {
  const sessionRead = new Set([
    "/sessions",
    "/sessions/search",
    "/sessions/messages",
    "/sessions/summary",
    "/sessions/continuity",
    "/sessions/usage",
    "/sessions/export",
  ]);
  const statusRead = new Set([
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
  ]);
  const projectResource =
    /^\/projects\/[a-zA-Z0-9:_-]{1,128}\/resources(?:\/[a-zA-Z0-9:_-]{1,128})?$/u;
  const project = /^\/projects\/[a-zA-Z0-9:_-]{1,128}$/u;
  // URL.pathname preserves encoded colons in a run ID. The host uses
  // encodeURIComponent for consult:<id>, so both literal and %3A are valid.
  const run = /^\/chat\/runs\/(?:[a-zA-Z0-9:_-]|%3A){1,130}(?:\/events)?$/iu;
  const cancel = /^\/chat\/runs\/(?:[a-zA-Z0-9:_-]|%3A){1,130}\/cancel$/iu;
  const approvalDecision =
    /^\/execution\/approvals\/[a-zA-Z0-9:_-]{1,256}\/(?:approve|deny)$/u;

  if (method === "GET") {
    return (
      statusRead.has(pathname) ||
      sessionRead.has(pathname) ||
      project.test(pathname) ||
      projectResource.test(pathname) ||
      run.test(pathname)
    );
  }
  if (method === "POST") {
    if (
      allowMutation &&
      ["/workspace/write", "/repo/mutate", "/repo/worktrees/create"].includes(
        pathname,
      )
    ) {
      return true;
    }
    return (
      new Set([
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
      ]).has(pathname) ||
      cancel.test(pathname) ||
      approvalDecision.test(pathname) ||
      projectResource.test(pathname)
    );
  }
  if (method === "PATCH") return project.test(pathname);
  if (method === "DELETE") return projectResource.test(pathname);
  return false;
}
