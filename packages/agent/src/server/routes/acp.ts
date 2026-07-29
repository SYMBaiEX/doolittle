import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type { AcpEditorContext } from "@/services/acp/types";

export async function handleAcpRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/acp/initialize") {
    const body = await readOptionalObject(request);
    return json({
      initialized: await context.services.acp.initializeProtocol(
        Object.keys(body).length > 0
          ? (body as Parameters<
              typeof context.services.acp.initializeProtocol
            >[0])
          : undefined,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/session/new") {
    const body = await readOptionalObject(request);
    return json({
      session: await context.services.acp.newProtocolSession(body),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/session/load") {
    const body = await readOptionalObject(request);
    if (!isNonEmptyString(body.sessionId) || !isNonEmptyString(body.cwd)) {
      return json({ error: "sessionId and cwd are required" }, 400);
    }
    await context.services.acp.loadProtocolSession(
      body as Parameters<typeof context.services.acp.loadProtocolSession>[0],
    );
    return json({ loaded: true });
  }

  if (request.method === "POST" && url.pathname === "/acp/session/prompt") {
    const body = await readOptionalObject(request);
    if (!isNonEmptyString(body.sessionId) || !Array.isArray(body.prompt)) {
      return json({ error: "sessionId and prompt are required" }, 400);
    }
    return json({
      result: await context.services.acp.promptProtocolSession(
        body as Parameters<
          typeof context.services.acp.promptProtocolSession
        >[0],
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/session/cancel") {
    const body = await readOptionalObject(request);
    if (!isNonEmptyString(body.sessionId)) {
      return json({ error: "sessionId is required" }, 400);
    }
    await context.services.acp.cancelProtocolSession(body.sessionId);
    return json({ cancelled: true });
  }

  if (request.method === "GET" && url.pathname === "/acp/session/updates") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return json({ error: "sessionId is required" }, 400);
    }
    const cursor = Number(url.searchParams.get("cursor") ?? "0");
    return json({
      snapshot: context.services.acp.protocolUpdates(
        sessionId,
        Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/editor/context") {
    const body = await readOptionalObject(request);
    if (!isNonEmptyString(body.sessionId)) {
      return json({ error: "sessionId is required" }, 400);
    }
    return json({
      context: context.services.acp.updateEditorContext(
        body.sessionId,
        body as AcpEditorContext,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/fs/read") {
    const body = await readOptionalObject(request);
    if (!isNonEmptyString(body.sessionId) || !isNonEmptyString(body.path)) {
      return json({ error: "sessionId and path are required" }, 400);
    }
    return json({
      content: await context.services.acp.readTextFile(
        body as Parameters<typeof context.services.acp.readTextFile>[0],
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/acp/fs/write") {
    const body = await readOptionalObject(request);
    if (
      !isNonEmptyString(body.sessionId) ||
      !isNonEmptyString(body.path) ||
      typeof body.content !== "string"
    ) {
      return json(
        { error: "sessionId, path, and string content are required" },
        400,
      );
    }
    return json({
      result: await context.services.acp.writeTextFile(
        body as Parameters<typeof context.services.acp.writeTextFile>[0],
      ),
    });
  }

  if (request.method === "POST" && url.pathname.startsWith("/acp/terminal/")) {
    const body = await readOptionalObject(request);
    if (!isNonEmptyString(body.sessionId)) {
      return json({ error: "sessionId is required" }, 400);
    }
    if (url.pathname === "/acp/terminal/create") {
      if (!isNonEmptyString(body.command)) {
        return json({ error: "command is required" }, 400);
      }
      return json({
        terminal: await context.services.acp.createTerminal(
          body as Parameters<typeof context.services.acp.createTerminal>[0],
        ),
      });
    }
    if (!isNonEmptyString(body.terminalId)) {
      return json({ error: "terminalId is required" }, 400);
    }
    if (url.pathname === "/acp/terminal/output") {
      return json({
        terminal: await context.services.acp.terminalOutput(
          body as Parameters<typeof context.services.acp.terminalOutput>[0],
        ),
      });
    }
    if (url.pathname === "/acp/terminal/wait") {
      return json({
        terminal: await context.services.acp.waitForTerminalExit(
          body as Parameters<
            typeof context.services.acp.waitForTerminalExit
          >[0],
        ),
      });
    }
    if (url.pathname === "/acp/terminal/kill") {
      await context.services.acp.killTerminal(
        body as Parameters<typeof context.services.acp.killTerminal>[0],
      );
      return json({ killed: true });
    }
    if (url.pathname === "/acp/terminal/release") {
      await context.services.acp.releaseTerminal(
        body as Parameters<typeof context.services.acp.releaseTerminal>[0],
      );
      return json({ released: true });
    }
  }

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

async function readOptionalObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const parsed = await request.json().catch(() => ({}));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
