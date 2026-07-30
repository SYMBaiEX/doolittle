import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectivePluginManagerInventory,
  getEffectiveToolInventory,
  searchEffectiveTools,
} from "@/runtime/native/service-bridge/service-resolution";
import { json } from "@/server/responses";

export async function handleToolRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/tools") {
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
    );
    return json({
      tools: inventory.tools,
      runtimeOwned: inventory.runtimeOwned,
      controlPlane: inventory.summary.controlPlane,
      nativePluginManager: getEffectivePluginManagerInventory(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      results: searchEffectiveTools(context.runtime, context.services, query),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/summary") {
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
    );
    return json({
      summary: inventory.summary,
      nativePluginManager: getEffectivePluginManagerInventory(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/transports") {
    return json({
      transports: getEffectiveToolInventory(context.runtime, context.services)
        .summary.transports,
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/category") {
    const category = url.searchParams.get("name");
    if (!category) {
      return json({ error: "name is required" }, 400);
    }
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
    );
    return json({
      category,
      tools: inventory.tools.filter(
        (tool) => tool.category.toLowerCase() === category.toLowerCase(),
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/detail") {
    const id = url.searchParams.get("id");
    if (!id) {
      return json({ error: "id is required" }, 400);
    }
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
    );
    return json({
      tool: inventory.tools.find(
        (tool) =>
          tool.id.toLowerCase() === id.toLowerCase() ||
          tool.name.toLowerCase() === id.toLowerCase(),
      ),
    });
  }

  return null;
}
