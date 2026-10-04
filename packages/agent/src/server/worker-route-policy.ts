/** Named workers expose only bot-local conversation and project resources. */
export function isWorkerApiRouteAllowed(
  method: string,
  pathname: string,
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
    "/browser/status",
  ]);
  const projectResource =
    /^\/projects\/[a-zA-Z0-9:_-]{1,128}\/resources(?:\/[a-zA-Z0-9:_-]{1,128})?$/u;
  const project = /^\/projects\/[a-zA-Z0-9:_-]{1,128}$/u;
  const run = /^\/chat\/runs\/[a-zA-Z0-9:_-]{1,128}(?:\/events)?$/u;
  const cancel = /^\/chat\/runs\/[a-zA-Z0-9:_-]{1,128}\/cancel$/u;

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
    return (
      new Set([
        "/chat/runs",
        "/sessions/title",
        "/sessions/fork",
        "/sessions/project",
        "/media/transcribe-attachment",
        "/projects",
        "/acp/editor/context",
        "/acp/terminal/create",
        "/acp/terminal/output",
        "/acp/terminal/wait",
        "/acp/terminal/kill",
        "/acp/terminal/release",
      ]).has(pathname) ||
      cancel.test(pathname) ||
      projectResource.test(pathname)
    );
  }
  if (method === "PATCH") return project.test(pathname);
  if (method === "DELETE") return projectResource.test(pathname);
  return false;
}
