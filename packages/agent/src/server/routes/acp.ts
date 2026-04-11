import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleAcpRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/acp/status") {
    return json({
      acp: context.services.acp.status(),
    });
  }

  if (request.method === "GET" && url.pathname === "/acp/registry") {
    return json({
      registry: context.services.acp.registry(),
    });
  }

  if (request.method === "GET" && url.pathname === "/acp/package") {
    return json({
      package: context.services.acp.packageMetadata(),
    });
  }

  if (request.method === "GET" && url.pathname === "/acp/editor") {
    return json({
      editor: context.services.acp.editorSummary(),
    });
  }

  if (request.method === "GET" && url.pathname === "/acp/sessions") {
    const limit = Number(url.searchParams.get("limit") ?? "5");
    return json({
      sessions: context.services.acp.sessionSummary(
        !Number.isNaN(limit) && limit > 0 ? limit : 5,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/publish") {
    return json({
      published: context.services.acp.publishRegistry(),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/export") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      label?: string;
    };
    return json({
      exported: context.services.acp.exportBundle(body.label ?? "latest"),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/import") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      path?: string;
      payload?: string;
    };
    const input = body.payload ?? body.path ?? "";
    if (!input) {
      return json({ error: "path or payload is required" }, 400);
    }
    return json({
      imported: context.services.acp.importBundle(input),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/probe") {
    return json({
      probe: await context.services.acp.probe(),
    });
  }

  if (request.method === "GET" && url.pathname === "/acp/tools") {
    const query = url.searchParams.get("query");
    return json({
      tools: query
        ? context.services.acp.searchTools(query)
        : context.services.acp.tools(),
    });
  }

  if (request.method === "GET" && url.pathname === "/acp/tool") {
    const name = url.searchParams.get("name");
    if (!name) {
      return json({ error: "name is required" }, 400);
    }
    return json({
      detail: context.services.acp.describeTool(name),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/invoke") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      input?: string;
    };
    return json({
      result: await context.services.acp.invoke(body.input ?? ""),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/call") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      tool?: string;
      input?: Record<string, unknown>;
    };
    if (!body.tool) {
      return json({ error: "tool is required" }, 400);
    }
    return json({
      result: await context.services.acp.invokeTool(
        body.tool,
        body.input ?? {},
      ),
    });
  }

  return null;
}
