import { timingSafeEqual } from "node:crypto";
import { getDocumentsService } from "@elizaos/agent/api/documents-service-loader";
import type { AgentRuntime, UUID } from "@elizaos/core";
import type { AppContext } from "@/runtime/bootstrap";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function authorized(request: Request): boolean {
  const token = process.env.DOOLITTLE_KNOWLEDGE_BROKER_TOKEN;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer /u, "");
  if (!token || !provided) return false;
  const expected = Buffer.from(token);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Private SDK document storage, reachable only by the desktop broker host. */
export async function handleKnowledgeBrokerRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (
    process.env.DOOLITTLE_KNOWLEDGE_BROKER === "1" &&
    request.method === "GET" &&
    url.pathname === "/health"
  ) {
    return json({ status: "ok", broker: true });
  }
  if (!url.pathname.startsWith("/knowledge/documents")) return null;
  if (process.env.DOOLITTLE_KNOWLEDGE_BROKER !== "1")
    return json({ error: "Not found" }, 404);
  if (!authorized(request)) return json({ error: "Forbidden" }, 403);
  const { service } = await getDocumentsService(
    context.runtime as AgentRuntime,
  );
  if (!service) return json({ error: "SDK document service unavailable" }, 503);

  if (request.method === "POST" && url.pathname === "/knowledge/documents") {
    const parsed = await readJsonObjectBody(request);
    if (!parsed.ok) return json({ error: "Document request is invalid" }, 400);
    const { clientDocumentId, content, title, projectId } = parsed.value;
    if (
      typeof clientDocumentId !== "string" ||
      !UUID_PATTERN.test(clientDocumentId) ||
      typeof content !== "string" ||
      !content.trim() ||
      content.length > 100_000 ||
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 300 ||
      typeof projectId !== "string" ||
      !/^[A-Za-z0-9:_-]{1,128}$/u.test(projectId)
    ) {
      return json({ error: "Document fields are invalid" }, 400);
    }
    let stored: Awaited<ReturnType<typeof service.addDocument>>;
    try {
      stored = await service.addDocument({
        agentId: context.runtime.agentId,
        worldId: context.runtime.agentId,
        roomId: context.runtime.agentId,
        entityId: context.runtime.agentId,
        clientDocumentId: clientDocumentId as UUID,
        contentType: "text/plain",
        originalFilename: `${title}.txt`,
        content,
        scope: "agent-private",
        addedBy: context.runtime.agentId,
        addedByRole: "OWNER",
        addedFrom: "runtime-internal",
        metadata: { projectId, title, source: "explicit-desktop-promotion" },
      });
    } catch {
      return json({ error: "SDK document storage failed" }, 500);
    }
    return json(
      {
        documentId: stored.storedDocumentMemoryId,
        fragmentCount: stored.fragmentCount,
      },
      201,
    );
  }

  const match = /^\/knowledge\/documents\/([0-9a-f-]{36})$/iu.exec(
    url.pathname,
  );
  if (request.method === "GET" && match?.[1]) {
    if (!UUID_PATTERN.test(match[1]) || !service.getDocumentById) {
      return json({ error: "Document lookup unavailable" }, 503);
    }
    const document = await service.getDocumentById(match[1] as UUID);
    if (!document || typeof document.content?.text !== "string") {
      return json({ error: "Document not found" }, 404);
    }
    return json({ documentId: match[1], content: document.content.text });
  }
  return json({ error: "Not found" }, 404);
}
