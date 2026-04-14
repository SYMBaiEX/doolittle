import type { AppContext } from "@/runtime/bootstrap";
import {
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  getEffectiveCachedMcpTools,
  getEffectiveMcpStatus,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  probeEffectiveMcp,
  searchEffectiveCachedMcpTools,
} from "@/runtime/native/service-bridge/tooling";
import { json } from "@/server/responses";

export async function handleMcpRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/mcp/status") {
    return json({
      mcp: getEffectiveMcpStatus(context.runtime, context.services),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/tools") {
    return json({
      discovery: await discoverEffectiveMcpTools(
        context.runtime,
        context.services,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/cached") {
    return json({
      tools: getEffectiveCachedMcpTools(context.runtime, context.services),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/cached/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      tools: searchEffectiveCachedMcpTools(
        context.runtime,
        context.services,
        query,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/tool") {
    const name = url.searchParams.get("name");
    if (!name) {
      return json({ error: "name is required" }, 400);
    }
    return json({
      tool:
        getEffectiveCachedMcpTools(context.runtime, context.services).find(
          (tool: unknown) =>
            tool &&
            typeof tool === "object" &&
            "name" in tool &&
            String((tool as { name?: unknown }).name) === name,
        ) ?? null,
      detail: describeEffectiveMcpTool(context.runtime, context.services, name),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/cached/describe") {
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 20;
    return json({
      detail: describeEffectiveCachedMcpTools(
        context.runtime,
        context.services,
        !Number.isNaN(limit) && limit > 0 ? limit : 20,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/mcp/probe") {
    return json({
      probe: await probeEffectiveMcp(context.runtime, context.services),
    });
  }

  if (request.method === "POST" && url.pathname === "/mcp/invoke") {
    const body = (await request.json()) as { input?: string };
    if (!body.input) {
      return json({ error: "input is required" }, 400);
    }
    return json({
      result: await invokeEffectiveMcp(
        context.runtime,
        context.services,
        body.input,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/mcp/invoke-tool") {
    const body = (await request.json()) as {
      tool?: string;
      input?: Record<string, unknown>;
    };
    if (!body.tool) {
      return json({ error: "tool is required" }, 400);
    }
    return json({
      result: await invokeEffectiveMcpTool(
        context.runtime,
        context.services,
        body.tool,
        body.input ?? {},
      ),
    });
  }

  return null;
}
