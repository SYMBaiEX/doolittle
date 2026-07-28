import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import { SessionForkError } from "@/services/session/service";

const ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;

function optionalProjectId(url: URL): string | Response | undefined {
  const value = url.searchParams.get("projectId");
  if (value === null || value === "") return undefined;
  return ID_PATTERN.test(value)
    ? value
    : json({ error: "projectId is invalid" }, 400);
}

export async function handleSessionRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/sessions/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const projectId = optionalProjectId(url);
    if (projectId instanceof Response) return projectId;
    return json({
      hits: context.services.sessions.search(query, limit, projectId),
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions") {
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 20;
    const projectId = optionalProjectId(url);
    if (projectId instanceof Response) return projectId;
    return json({
      sessions: context.services.sessions.listSessions(
        !Number.isNaN(limit) && limit > 0 ? limit : 20,
        projectId,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/sessions/title") {
    const body = (await request.json()) as {
      sessionId?: string;
      title?: string;
    };
    if (!body.sessionId || !body.title) {
      return json({ error: "sessionId and title are required" }, 400);
    }
    return json({
      summary: context.services.sessions.rename(body.sessionId, body.title),
    });
  }

  if (request.method === "POST" && url.pathname === "/sessions/fork") {
    let body: {
      sourceSessionId?: unknown;
      throughMessageId?: unknown;
      beforeMessageId?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "request body must be valid JSON" }, 400);
    }
    if (!body || typeof body !== "object") {
      return json({ error: "request body must be a JSON object" }, 400);
    }
    if (
      typeof body.sourceSessionId !== "string" ||
      !ID_PATTERN.test(body.sourceSessionId)
    ) {
      return json({ error: "sourceSessionId is invalid" }, 400);
    }
    for (const [name, value] of [
      ["throughMessageId", body.throughMessageId],
      ["beforeMessageId", body.beforeMessageId],
    ] as const) {
      if (
        value !== undefined &&
        (typeof value !== "string" || !ID_PATTERN.test(value))
      ) {
        return json({ error: `${name} is invalid` }, 400);
      }
    }
    if (
      body.throughMessageId !== undefined &&
      body.beforeMessageId !== undefined
    ) {
      return json(
        {
          error: "throughMessageId and beforeMessageId are mutually exclusive",
        },
        400,
      );
    }
    try {
      return json({
        fork: context.services.sessions.forkSession({
          sourceSessionId: body.sourceSessionId,
          throughMessageId: body.throughMessageId as string | undefined,
          beforeMessageId: body.beforeMessageId as string | undefined,
        }),
      });
    } catch (error) {
      if (!(error instanceof SessionForkError)) throw error;
      const status =
        error.code === "source_not_found" || error.code === "boundary_not_found"
          ? 404
          : error.code === "invalid_boundary"
            ? 400
            : 409;
      return json({ error: error.message, code: error.code }, status);
    }
  }

  if (request.method === "POST" && url.pathname === "/sessions/project") {
    const body = (await request.json()) as {
      sessionId?: unknown;
      projectId?: unknown;
    };
    if (
      typeof body.sessionId !== "string" ||
      !ID_PATTERN.test(body.sessionId)
    ) {
      return json({ error: "sessionId is invalid" }, 400);
    }
    if (
      body.projectId !== undefined &&
      body.projectId !== null &&
      (typeof body.projectId !== "string" || !ID_PATTERN.test(body.projectId))
    ) {
      return json({ error: "projectId is invalid" }, 400);
    }
    if (
      !context.services.sessions.assignSessionProject(
        body.sessionId,
        body.projectId ?? undefined,
      )
    ) {
      return json({ error: "project not found or archived" }, 404);
    }
    return json({
      sessionId: body.sessionId,
      projectId: body.projectId ?? undefined,
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions/continuity") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return json({ error: "sessionId is required" }, 400);
    }
    return json({
      sessions: context.services.sessions.continuity(sessionId),
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions/summary") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return json({ error: "sessionId is required" }, 400);
    }
    return json({
      summary: context.services.sessions.summarize(sessionId),
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions/messages") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return json({ error: "sessionId is required" }, 400);
    }
    const limitRaw = Number(url.searchParams.get("limit") ?? "200");
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 500)
        : 200;
    return json({
      messages: context.services.sessions.messagesBySession(sessionId, limit),
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions/usage") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return json({ error: "sessionId is required" }, 400);
    }
    const settings = context.services.settings.get();
    return json({
      usage: context.services.sessions.usage(sessionId, {
        provider: settings.model.provider,
        model: settings.model.model,
      }),
    });
  }

  return null;
}
