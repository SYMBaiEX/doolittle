import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleWorkspaceRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/workspace/tree") {
    const depth = Number(url.searchParams.get("depth") ?? "2");
    return json({
      entries: context.services.workspace.tree(Number.isNaN(depth) ? 2 : depth),
    });
  }

  if (request.method === "GET" && url.pathname === "/workspace/read") {
    const path = url.searchParams.get("path");
    if (!path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      path,
      content: context.services.workspace.read(path),
    });
  }

  if (request.method === "GET" && url.pathname === "/workspace/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      results: context.services.workspace.search(query),
    });
  }

  return null;
}
