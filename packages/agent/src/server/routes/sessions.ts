import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleSessionRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
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

  return null;
}
