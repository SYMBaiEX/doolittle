import type { AppContext } from "@/runtime/bootstrap";
import { getEffectivePluginManagerInventory } from "@/runtime/native/service-bridge/service-resolution";
import { json } from "@/server/responses";

export async function handleToolRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/tools") {
    return json({
      tools: context.services.tools.list(),
      nativePluginManager: getEffectivePluginManagerInventory(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      results: context.services.tools.search(query),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/summary") {
    return json({
      summary: context.services.tools.summary(),
      nativePluginManager: getEffectivePluginManagerInventory(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/transports") {
    return json({
      transports: context.services.tools.summary().transports,
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/category") {
    const category = url.searchParams.get("name");
    if (!category) {
      return json({ error: "name is required" }, 400);
    }
    return json({
      category,
      tools: context.services.tools.byCategory(category),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/detail") {
    const id = url.searchParams.get("id");
    if (!id) {
      return json({ error: "id is required" }, 400);
    }
    return json({
      tool: context.services.tools.get(id),
    });
  }

  return null;
}
