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

  return null;
}
