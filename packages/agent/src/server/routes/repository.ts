import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleRepositoryRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/repo/status") {
    return json({
      status: await context.services.repository.status(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/diff") {
    return json({
      diff: await context.services.repository.diffStat(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/log") {
    return json({
      log: await context.services.repository.recentCommits(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/summary") {
    return json({
      summary: await context.services.repository.summary(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/review") {
    return json({
      review: await context.services.repository.review(request.signal),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/changes") {
    return json({
      changes: await context.services.repository.changes(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/patch") {
    const path = url.searchParams.get("path") ?? undefined;
    const staged = url.searchParams.get("staged") === "true";
    return json({
      patch: await context.services.repository.patch(path, staged),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/worktrees") {
    return json({
      worktrees: await context.services.repository.worktrees(),
    });
  }

  if (request.method === "POST" && url.pathname === "/repo/worktrees/create") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      branch?: unknown;
      path?: unknown;
    };
    if (typeof body.branch !== "string" || typeof body.path !== "string") {
      return json({ error: "branch and path are required" }, 400);
    }
    return json(
      {
        worktree: await context.services.repository.createWorktree({
          branch: body.branch,
          path: body.path,
        }),
      },
      201,
    );
  }

  return null;
}
