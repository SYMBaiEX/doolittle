import type {
  AgentTransportRequest,
  AgentTransportResponse,
} from "../shared/contracts";
import type { BotProcessRegistry } from "./bot-process-registry";

function objectBody(
  body: string | null | undefined,
): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function requiredSessionId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/u.test(value)) {
    throw new Error("A valid conversation ID is required.");
  }
  return value;
}

/** Authorize saved conversation access before selecting a child runtime. */
export async function assertBotSessionRequest(
  registry: BotProcessRegistry,
  request: AgentTransportRequest,
  botId: string,
): Promise<void> {
  const url = new URL(request.path, "http://desktop.local");
  const path = url.pathname;
  const runPath =
    /^\/chat\/runs\/([a-zA-Z0-9:_-]{1,128})(?:\/(?:events|cancel))?$/u.exec(
      path,
    );
  if (runPath?.[1]) {
    await registry.assertRunOwner(botId, runPath[1]);
    return;
  }
  if (
    request.method === "POST" &&
    (path === "/acp/editor/context" || path.startsWith("/acp/terminal/"))
  ) {
    const body = objectBody(request.body);
    await registry.ensureConversationOwner(
      botId,
      requiredSessionId(body?.sessionId),
    );
    return;
  }
  const projectPath =
    /^\/projects\/([a-zA-Z0-9:_-]{1,128})(?:\/resources(?:\/([a-zA-Z0-9:_-]{1,128}))?)?$/u.exec(
      path,
    );
  if (projectPath?.[1]) {
    const projectId = projectPath[1];
    if (projectPath[2] && request.method === "DELETE") {
      await registry.ensureResourceOwner(botId, projectId, projectPath[2]);
    } else {
      await registry.ensureProjectOwner(botId, projectId);
    }
    return;
  }
  if (
    request.method === "GET" &&
    [
      "/sessions/messages",
      "/sessions/summary",
      "/sessions/continuity",
      "/sessions/usage",
      "/sessions/export",
    ].includes(path)
  ) {
    await registry.ensureConversationOwner(
      botId,
      requiredSessionId(url.searchParams.get("sessionId")),
    );
    return;
  }
  if (
    request.method === "POST" &&
    ["/sessions/title", "/sessions/project"].includes(path)
  ) {
    const body = objectBody(request.body);
    const owner = await registry.ensureConversationOwner(
      botId,
      requiredSessionId(body?.sessionId),
    );
    if (path === "/sessions/project" && body?.projectId !== owner.projectId) {
      throw new Error(
        "Conversation project cannot be reassigned across saved ownership.",
      );
    }
    return;
  }
  if (request.method === "POST" && path === "/sessions/fork") {
    const body = objectBody(request.body);
    await registry.ensureConversationOwner(
      botId,
      requiredSessionId(body?.sourceSessionId),
    );
    return;
  }
  if (
    botId !== "default" &&
    (path === "/sessions/import" ||
      path === "/sessions/import/preview" ||
      (path === "/chat/runs" && request.method === "POST"))
  ) {
    throw new Error("This operation must use a bot-bound conversation route.");
  }
}

/** Attribute rows and bind a successful fork before the renderer can use it. */
export function attributeBotSessionResponse(
  registry: BotProcessRegistry,
  request: AgentTransportRequest,
  botId: string,
  response: AgentTransportResponse,
): AgentTransportResponse {
  if (response.status < 200 || response.status >= 300) return response;
  const path = new URL(request.path, "http://desktop.local").pathname;
  if (request.method !== "GET" && request.method !== "POST") return response;
  if (
    path === "/projects" &&
    (request.method === "GET" || request.method === "POST")
  ) {
    const payload = objectBody(response.body);
    if (!payload) throw new Error("The runtime returned invalid project data.");
    const input =
      request.method === "GET" ? payload.projects : [payload.project];
    if (!Array.isArray(input))
      throw new Error("The runtime returned invalid project data.");
    const projects = input.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("The runtime returned invalid project data.");
      const project = value as Record<string, unknown>;
      const projectId = requiredSessionId(project.id);
      registry.bindProject(botId, projectId);
      const resources = Array.isArray(project.resources)
        ? project.resources.map((entry) =>
            attributedResource(registry, botId, projectId, entry),
          )
        : project.resources;
      return {
        ...project,
        botId: registry.get(botId).id,
        ...(resources ? { resources } : {}),
      };
    });
    return {
      ...response,
      body: JSON.stringify(
        request.method === "GET"
          ? { ...payload, projects }
          : { ...payload, project: projects[0] },
      ),
    };
  }
  const resourcePath =
    /^\/projects\/([a-zA-Z0-9:_-]{1,128})\/resources(?:\/([a-zA-Z0-9:_-]{1,128}))?$/u.exec(
      path,
    );
  if (
    resourcePath?.[1] &&
    !resourcePath[2] &&
    (request.method === "GET" || request.method === "POST")
  ) {
    const payload = objectBody(response.body);
    if (!payload)
      throw new Error("The runtime returned invalid resource data.");
    const projectId = resourcePath[1];
    if (request.method === "POST") {
      return {
        ...response,
        body: JSON.stringify({
          ...payload,
          resource: attributedResource(
            registry,
            botId,
            projectId,
            payload.resource,
          ),
        }),
      };
    }
    if (!Array.isArray(payload.resources))
      throw new Error("The runtime returned invalid resource data.");
    return {
      ...response,
      body: JSON.stringify({
        ...payload,
        resources: payload.resources.map((entry) =>
          attributedResource(registry, botId, projectId, entry),
        ),
      }),
    };
  }
  if (!["/sessions", "/sessions/search", "/sessions/fork"].includes(path))
    return response;
  const payload = objectBody(response.body);
  if (!payload)
    throw new Error("The runtime returned invalid conversation data.");
  if (path === "/sessions/fork") {
    const fork = payload.fork;
    if (!fork || typeof fork !== "object" || Array.isArray(fork))
      throw new Error("The runtime returned an invalid fork.");
    const item = fork as Record<string, unknown>;
    const sourceId = requiredSessionId(item.sourceSessionId);
    const sessionId = requiredSessionId(item.sessionId);
    const source = registry.assertConversationOwner(botId, sourceId);
    const bound = registry.bindConversation(botId, sessionId, source.projectId);
    return {
      ...response,
      body: JSON.stringify({
        ...payload,
        fork: { ...item, botId: bound.botId },
      }),
    };
  }
  const key = path === "/sessions" ? "sessions" : "hits";
  const rows = payload[key];
  if (!Array.isArray(rows))
    throw new Error("The runtime returned invalid conversation data.");
  const mapped = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error("The runtime returned invalid conversation data.");
    const item = row as Record<string, unknown>;
    const sessionId = requiredSessionId(item.sessionId);
    const projectId =
      typeof item.projectId === "string" ? item.projectId : undefined;
    const owner =
      botId === "default" && !registry.resolveSavedConversationOwner(sessionId)
        ? registry.bindConversation("default", sessionId, projectId)
        : registry.assertConversationOwner(botId, sessionId, projectId);
    return { ...item, botId: owner.botId };
  });
  return { ...response, body: JSON.stringify({ ...payload, [key]: mapped }) };
}

function attributedResource(
  registry: BotProcessRegistry,
  botId: string,
  projectId: string,
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The runtime returned invalid resource data.");
  }
  const resource = value as Record<string, unknown>;
  const resourceId = requiredSessionId(resource.id);
  if (resource.projectId !== projectId)
    throw new Error("Resource project does not match its owner.");
  registry.bindResource(botId, projectId, resourceId);
  return { ...resource, botId: registry.get(botId).id };
}
