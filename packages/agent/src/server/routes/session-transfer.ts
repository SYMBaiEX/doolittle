import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import { SessionTransferError } from "@/services/session/service";

const ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;

export async function handleSessionTransferRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/sessions/export") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || !ID_PATTERN.test(sessionId)) {
      return json({ error: "sessionId is invalid" }, 400);
    }
    try {
      return json({
        archive: context.services.sessions.exportSessionArchive(sessionId),
      });
    } catch (error) {
      return transferErrorResponse(error);
    }
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/sessions/import/preview" ||
      url.pathname === "/sessions/import")
  ) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "request body must be valid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "request body must be a JSON object" }, 400);
    }
    const input = body as Record<string, unknown>;
    if (!("archive" in input)) {
      return json({ error: "archive is required" }, 400);
    }
    try {
      if (url.pathname === "/sessions/import/preview") {
        return json({
          preview: context.services.sessions.previewSessionArchive(
            input.archive,
          ),
        });
      }
      const projectId = input.projectId;
      if (
        projectId !== undefined &&
        (typeof projectId !== "string" || !ID_PATTERN.test(projectId))
      ) {
        return json({ error: "projectId is invalid" }, 400);
      }
      return json({
        imported: context.services.sessions.importSessionArchive({
          archive: input.archive,
          projectId: projectId as string | undefined,
        }),
      });
    } catch (error) {
      return transferErrorResponse(error);
    }
  }

  return null;
}

function transferErrorResponse(error: unknown): Response {
  if (!(error instanceof SessionTransferError)) throw error;
  const status =
    error.code === "source_not_found" || error.code === "project_not_found"
      ? 404
      : error.code === "archive_too_large" || error.code === "session_too_large"
        ? 413
        : 400;
  return json({ error: error.message, code: error.code }, status);
}
