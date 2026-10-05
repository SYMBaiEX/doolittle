import type { CreateBotInput } from "@doolittle/contracts/bots";
import type {
  AgentTransportRequest,
  AgentTransportResponse,
} from "../shared/contracts";
import type { BotProcessRegistry } from "./bot-process-registry";
import { parseApiPath } from "./ipc/agent-api-policy";
import type { SensitiveActionConfirmationRequest } from "./ipc/ipc-validation";

export function isBotApiPath(path: string, method: string): boolean {
  const pathname = parseApiPath(
    path,
    method as "GET" | "POST" | "PATCH" | "DELETE",
  ).split("?", 1)[0];
  return (
    pathname === "/bots" ||
    pathname === "/bots/conversations/owner" ||
    pathname === "/bots/consultations" ||
    pathname === "/bots/knowledge" ||
    pathname === "/bots/knowledge/promote" ||
    /^\/bots\/knowledge\/[0-9a-f-]{36}\/(?:grant|revoke)$/iu.test(pathname) ||
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
  confirmSensitiveAction?: (
    request: SensitiveActionConfirmationRequest,
  ) => Promise<boolean>,
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
    if (request.method === "GET" && path === "/bots/knowledge") {
      return jsonResponse(200, { knowledge: registry.knowledge.ledger.list() });
    }
    if (request.method === "POST" && path === "/bots/knowledge/promote") {
      const input = parseInput(request.body);
      if (
        input.consent !== true ||
        typeof input.title !== "string" ||
        typeof input.sourceBotId !== "string" ||
        typeof input.sessionId !== "string" ||
        typeof input.runId !== "string" ||
        typeof input.messageId !== "string" ||
        typeof input.projectId !== "string"
      ) {
        return jsonResponse(400, {
          error: "Explicit, scoped knowledge promotion is required.",
        });
      }
      const confirmed = await confirmSensitiveAction?.({
        kind: "knowledge-promotion",
        title: "Promote selected project knowledge?",
        message: input.title,
        detail:
          "Doolittle will copy one selected conversation message into the private project knowledge broker. It will not be shared with another bot until you grant access.",
        confirmLabel: "Promote message",
      });
      if (confirmed !== true)
        return jsonResponse(403, {
          error: "Knowledge promotion was not confirmed.",
        });
      return jsonResponse(201, {
        knowledge: await registry.knowledge.promote({
          sourceBotId: input.sourceBotId as string,
          sessionId: input.sessionId as string,
          runId: input.runId as string,
          messageId: input.messageId as string,
          projectId: input.projectId as string,
          title: input.title,
          consent: true,
        }),
      });
    }
    const knowledgeAction =
      /^\/bots\/knowledge\/([0-9a-f-]{36})\/(grant|revoke)$/iu.exec(path);
    if (request.method === "POST" && knowledgeAction?.[1]) {
      const input = parseInput(request.body);
      const botId =
        typeof input.targetBotId === "string" ? input.targetBotId : undefined;
      if (
        input.consent !== true ||
        (knowledgeAction[2] === "grant" && !botId)
      ) {
        return jsonResponse(400, {
          error: "Explicit knowledge grant or revocation is required.",
        });
      }
      const confirmed = await confirmSensitiveAction?.({
        kind: "knowledge-promotion",
        title:
          knowledgeAction[2] === "grant"
            ? "Share promoted knowledge?"
            : "Revoke promoted knowledge?",
        message: botId ?? knowledgeAction[1],
        detail:
          "This change affects the selected bot's future project consultations. Private bot memory remains separate.",
        confirmLabel:
          knowledgeAction[2] === "grant" ? "Grant access" : "Revoke access",
      });
      if (confirmed !== true)
        return jsonResponse(403, {
          error: "Knowledge change was not confirmed.",
        });
      if (knowledgeAction[2] === "grant")
        registry.knowledge.grant(knowledgeAction[1], botId as string, true);
      else registry.knowledge.revoke(knowledgeAction[1], botId);
      return jsonResponse(200, {
        knowledge: registry.knowledge.ledger.get(knowledgeAction[1]),
      });
    }
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
    if (request.method === "GET" && path.startsWith("/bots/consultations?")) {
      const query = new URL(path, "http://desktop.local").searchParams;
      const targetRunId = query.get("targetRunId");
      const rootRunId = query.get("runId");
      if ((targetRunId === null) === (rootRunId === null)) {
        return jsonResponse(400, {
          error: "Exactly one runId or targetRunId is required.",
        });
      }
      const targetRecord = targetRunId
        ? registry.consultations.ledger.byTargetRun(targetRunId)
        : undefined;
      if (targetRunId && !targetRecord)
        return jsonResponse(404, { error: "Consultation not found." });
      if (targetRecord) {
        const owner = registry.conversations.getRun(targetRecord.targetRunId);
        if (
          !owner ||
          owner.botId !== targetRecord.targetBotId ||
          owner.sessionId !== targetRecord.targetSessionId
        ) {
          return jsonResponse(404, {
            error: "Consultation target is not bound.",
          });
        }
      }
      const runId = targetRecord?.rootRunId ?? rootRunId;
      if (!runId || !/^[A-Za-z0-9:_-]{1,128}$/u.test(runId)) {
        return jsonResponse(400, { error: "runId is invalid." });
      }
      await registry.assertRunOwner("default", runId);
      const owner = registry.conversations.getRun(runId);
      if (!owner || owner.botId !== registry.catalog.stableDefaultBotId()) {
        return jsonResponse(404, { error: "Lead run not found." });
      }
      return jsonResponse(200, {
        consultations: (targetRecord
          ? [targetRecord]
          : registry.consultations.ledger.forRoot(runId)
        ).map((record) => ({
          dispatchId: record.dispatchId,
          rootRunId: record.rootRunId,
          parentDispatchId: record.parentDispatchId,
          origin: record.origin,
          target: {
            botId: record.targetBotId,
            sessionId: record.targetSessionId,
            runId: record.targetRunId,
          },
          status: record.status,
          createdAt: record.createdAt,
        })),
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
