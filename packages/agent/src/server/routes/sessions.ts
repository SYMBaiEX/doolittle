import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

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
    return json({
      hits: context.services.sessions.search(query, limit),
    });
  }

  if (request.method === "GET" && url.pathname === "/sessions") {
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 20;
    return json({
      sessions: context.services.sessions.listSessions(
        !Number.isNaN(limit) && limit > 0 ? limit : 20,
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
