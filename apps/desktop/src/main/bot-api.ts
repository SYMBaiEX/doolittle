import type { CreateBotInput } from "@doolittle/contracts/bots";
import type {
  AgentTransportRequest,
  AgentTransportResponse,
} from "../shared/contracts";
import type { BotProcessRegistry } from "./bot-process-registry";
import { parseApiPath } from "./ipc/agent-api-policy";

export function isBotApiPath(path: string, method: string): boolean {
  const pathname = parseApiPath(
    path,
    method as "GET" | "POST" | "PATCH" | "DELETE",
  ).split("?", 1)[0];
  return (
    pathname === "/bots" ||
    pathname === "/bots/conversations/owner" ||
    /^\/bots\/[a-z0-9][a-z0-9_-]{0,63}(?:\/(?:archive|activate|stop|conversations))?$/u.test(
      pathname,
    )
  );
}

function jsonResponse(
  status: number,
  payload: unknown,
): AgentTransportResponse {
  return {
    status,
    statusText: status >= 400 ? "Error" : "OK",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function parseInput(body: string | null | undefined): Record<string, unknown> {
  if (!body) throw new Error("A bot request body is required.");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("The bot request body is invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The bot request body must be an object.");
  }
  return value as Record<string, unknown>;
}

/** Main-owned catalog routes; child runtimes never receive these requests. */
export async function handleBotApiRequest(
  registry: BotProcessRegistry,
  request: AgentTransportRequest,
): Promise<AgentTransportResponse | null> {
  const path = parseApiPath(request.path, request.method);
  if (!isBotApiPath(request.path, request.method)) {
    return null;
  }
  const targetedConversationPath =
    /^\/bots\/([a-z0-9][a-z0-9_-]{0,63})\/conversations$/u.exec(
      path.split("?", 1)[0] ?? "",
    );
  if (
    request.botId &&
    !registry.get(request.botId).isDefault &&
    request.botId !== targetedConversationPath?.[1]
  ) {
    return jsonResponse(400, {
      error: "Bot catalog operations are application-global.",
      code: "bot_target_not_allowed",
    });
  }
  try {
    if (
      request.method === "GET" &&
      path.startsWith("/bots/conversations/owner?")
    ) {
      const sessionId = new URL(path, "http://desktop.local").searchParams.get(
        "sessionId",
      );
      if (!sessionId)
        return jsonResponse(400, { error: "sessionId is required." });
      return jsonResponse(200, {
        conversation: registry.resolveSavedConversationOwner(sessionId),
      });
    }
    if (path === "/bots" && request.method === "GET") {
      await registry.refreshActiveRuns();
      return jsonResponse(200, registry.list());
    }
    if (path === "/bots" && request.method === "POST") {
      return jsonResponse(
        201,
        registry.create(parseInput(request.body) as unknown as CreateBotInput),
      );
    }
    const segments = path.split("/");
    const botId = segments[2];
    if (!botId) return jsonResponse(404, { error: "Bot not found." });
    if (segments[3] === "conversations") {
      if (request.method === "GET") {
        return jsonResponse(200, {
          conversations: registry.listConversations(botId),
        });
      }
      if (request.method === "POST") {
        const input = parseInput(request.body);
        if (
          typeof input.sessionId !== "string" ||
          (input.projectId !== undefined && typeof input.projectId !== "string")
        ) {
          return jsonResponse(400, {
            error: "sessionId or projectId is invalid.",
          });
        }
        return jsonResponse(201, {
          conversation: registry.bindConversation(
            botId,
            input.sessionId,
            input.projectId,
          ),
        });
      }
    }
    if (request.method === "PATCH" && segments.length === 3) {
      return jsonResponse(
        200,
        await registry.update(botId, parseInput(request.body)),
      );
    }
    if (request.method === "POST") {
      if (segments[3] === "archive") {
        return jsonResponse(200, await registry.archive(botId));
      }
      if (segments[3] === "activate") {
        return jsonResponse(200, await registry.activate(botId));
      }
      if (segments[3] === "stop") {
        return jsonResponse(200, await registry.stop(botId));
      }
    }
    return jsonResponse(404, { error: "Bot route not found." });
  } catch (error) {
    const unavailable = path === "/bots" && request.method === "GET";
    return jsonResponse(unavailable ? 503 : 409, {
      error: error instanceof Error ? error.message : "Bot operation failed.",
      code: unavailable ? "bot_status_unavailable" : "bot_operation_failed",
    });
  }
}
