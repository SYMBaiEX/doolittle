import type { AppContext } from "@/runtime/bootstrap";
import {
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  getEffectiveCachedMcpTools,
  getEffectiveMcpMarketplaceServer,
  getEffectiveMcpStatus,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  probeEffectiveMcp,
  searchEffectiveCachedMcpTools,
  searchEffectiveMcpMarketplace,
} from "@/runtime/native/service-bridge/tooling";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";
import { hasAsciiControlCharacters } from "@/utils/text-validation";

const MAX_MARKETPLACE_QUERY_LENGTH = 128;
const MAX_MARKETPLACE_SERVER_NAME_LENGTH = 256;
const MAX_MARKETPLACE_RESULTS = 20;
const MAX_CACHED_TOOL_DESCRIPTIONS = 20;
const MCP_MARKETPLACE_SERVER_NAME = /^[\w./@-]+$/u;

function marketplaceQuery(value: string | null): string | null {
  const query = value?.trim() ?? "";
  if (
    !query ||
    query.length > MAX_MARKETPLACE_QUERY_LENGTH ||
    hasAsciiControlCharacters(query)
  ) {
    return null;
  }
  return query;
}

function marketplaceServerName(value: string | null): string | null {
  const name = value?.trim() ?? "";
  if (
    !name ||
    name.length > MAX_MARKETPLACE_SERVER_NAME_LENGTH ||
    !MCP_MARKETPLACE_SERVER_NAME.test(name)
  ) {
    return null;
  }
  return name;
}

export async function handleMcpRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/mcp/status") {
    return json({
      mcp: getEffectiveMcpStatus(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/tools") {
    return json({
      discovery: await discoverEffectiveMcpTools(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/cached") {
    return json({
      tools: getEffectiveCachedMcpTools(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/cached/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      tools: searchEffectiveCachedMcpTools(context.runtime, query),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/tool") {
    const name = url.searchParams.get("name");
    if (!name) {
      return json({ error: "name is required" }, 400);
    }
    return json({
      tool:
        getEffectiveCachedMcpTools(context.runtime).find(
          (tool: unknown) =>
            tool &&
            typeof tool === "object" &&
            "name" in tool &&
            String((tool as { name?: unknown }).name) === name,
        ) ?? null,
      detail: describeEffectiveMcpTool(context.runtime, name),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/cached/describe") {
    const requestedLimits = url.searchParams.getAll("limit");
    if (requestedLimits.length > 1) {
      return json(
        { error: "cached description limit must be between 1 and 20" },
        400,
      );
    }
    const requestedLimit = Number(requestedLimits[0] ?? "20");
    if (
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > MAX_CACHED_TOOL_DESCRIPTIONS
    ) {
      return json(
        { error: "cached description limit must be between 1 and 20" },
        400,
      );
    }
    return json({
      detail: describeEffectiveCachedMcpTools(context.runtime, requestedLimit),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/marketplace") {
    if (url.searchParams.getAll("query").length !== 1) {
      return json({ error: "a bounded marketplace query is required" }, 400);
    }
    const query = marketplaceQuery(url.searchParams.get("query"));
    if (!query) {
      return json({ error: "a bounded marketplace query is required" }, 400);
    }
    const requestedLimits = url.searchParams.getAll("limit");
    if (requestedLimits.length > 1) {
      return json({ error: "marketplace limit must be between 1 and 20" }, 400);
    }
    const requestedLimit = Number(requestedLimits[0] ?? "10");
    const limit =
      Number.isSafeInteger(requestedLimit) &&
      requestedLimit > 0 &&
      requestedLimit <= MAX_MARKETPLACE_RESULTS
        ? requestedLimit
        : null;
    if (limit === null) {
      return json({ error: "marketplace limit must be between 1 and 20" }, 400);
    }
    return json({
      marketplace: await searchEffectiveMcpMarketplace(
        query,
        limit,
        request.signal,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/mcp/marketplace/server") {
    if (url.searchParams.getAll("name").length !== 1) {
      return json(
        { error: "a valid marketplace server name is required" },
        400,
      );
    }
    const name = marketplaceServerName(url.searchParams.get("name"));
    if (!name) {
      return json(
        { error: "a valid marketplace server name is required" },
        400,
      );
    }
    return json({
      marketplace: await getEffectiveMcpMarketplaceServer(name, request.signal),
    });
  }

  if (request.method === "POST" && url.pathname === "/mcp/probe") {
    return json({
      probe: await probeEffectiveMcp(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/mcp/invoke") {
    const parsed = await readJsonObjectBody(request);
    if (!parsed.ok) {
      return json(
        {
          error:
            parsed.reason === "invalid_json"
              ? "Invalid JSON body"
              : "JSON body must be an object",
        },
        400,
      );
    }
    const body = parsed.value as { input?: string };
    if (!body.input) {
      return json({ error: "input is required" }, 400);
    }
    return json({
      result: await invokeEffectiveMcp(context.runtime, body.input),
    });
  }

  if (request.method === "POST" && url.pathname === "/mcp/invoke-tool") {
    const parsed = await readJsonObjectBody(request);
    if (!parsed.ok) {
      return json(
        {
          error:
            parsed.reason === "invalid_json"
              ? "Invalid JSON body"
              : "JSON body must be an object",
        },
        400,
      );
    }
    const body = parsed.value as {
      tool?: string;
      input?: Record<string, unknown>;
    };
    if (!body.tool) {
      return json({ error: "tool is required" }, 400);
    }
    return json({
      result: await invokeEffectiveMcpTool(
        context.runtime,
        body.tool,
        body.input ?? {},
      ),
    });
  }

  return null;
}
