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
    pathname === "/bots/teams" ||
    /^\/bots\/teams\/[0-9a-f-]{36}(?:\/archive)?$/iu.test(pathname) ||
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
    if (request.method === "GET" && path === "/bots/teams") {
      return jsonResponse(200, registry.teams.list());
    }
    const teamAction = /^\/bots\/teams\/([0-9a-f-]{36})(\/archive)?$/iu.exec(
      path,
    );
    if (
      (request.method === "POST" && path === "/bots/teams") ||
      (teamAction &&
        ((request.method === "PATCH" && !teamAction[2]) ||
          (request.method === "POST" && teamAction[2])))
    ) {
      const input = parseInput(request.body);
      const allowed = teamAction?.[2]
        ? ["consent", "expectedRevision"]
        : ["consent", "expectedRevision", "name", "memberBotIds"];
      if (
        input.consent !== true ||
        typeof input.expectedRevision !== "number" ||
        Object.keys(input).some((key) => !allowed.includes(key)) ||
        (input.name !== undefined && typeof input.name !== "string") ||
        (input.memberBotIds !== undefined &&
          (!Array.isArray(input.memberBotIds) ||
            input.memberBotIds.some((id) => typeof id !== "string"))) ||
        (path === "/bots/teams" &&
          (typeof input.name !== "string" ||
            !Array.isArray(input.memberBotIds)))
      )
        return jsonResponse(400, {
          error: "Explicit team membership and current revision are required.",
        });
      registry.teams.assertRevision(input.expectedRevision);
      const previous = teamAction
        ? registry.teams.get(teamAction[1])
        : undefined;
      const selectedMembers = (
        (input.memberBotIds as string[] | undefined) ??
        previous?.memberBotIds ??
        []
      ).map((id) => {
        const bot = teamAction?.[2]
          ? registry.catalog?.get(id)
          : registry.get(id);
        return `${bot?.name ?? "Archived or unavailable bot"} (${id})`;
      });
      const previousMembers = (previous?.memberBotIds ?? []).map(
        (id) => `${registry.catalog?.get(id)?.name ?? "Saved member"} (${id})`,
      );
      const confirmed = await confirmSensitiveAction?.({
        kind: "team-membership",
        title: teamAction?.[2]
          ? "Archive team?"
          : previous
            ? "Change team membership?"
            : "Create team?",
        message:
          typeof input.name === "string"
            ? input.name
            : (previous?.name ?? "Team"),
        detail: teamAction?.[2]
          ? `Archiving blocks future knowledge retrieval for team ${previous?.name ?? "Team"} (${previous?.id ?? ""}). Current members: ${previousMembers.join(", ") || "none"}. Private histories and promoted documents are retained.`
          : `Only explicitly selected bots become members. Members may receive team knowledge only through separately approved grants, including across projects. Current members: ${previousMembers.join(", ") || "none"}. Selected members: ${selectedMembers.join(", ") || "none"}. Private bot memory is not shared.`,
        confirmLabel: teamAction?.[2] ? "Archive team" : "Confirm team",
      });
      if (confirmed !== true)
        return jsonResponse(403, { error: "Team change was not confirmed." });
      // Catalog methods recheck the revision and live canonical bots after the dialog.
      const team = teamAction?.[2]
        ? registry.teams.archive(teamAction[1], input.expectedRevision)
        : teamAction
          ? registry.teams.update(teamAction[1], {
              name: input.name as string | undefined,
              memberBotIds: input.memberBotIds as string[] | undefined,
              expectedRevision: input.expectedRevision,
            })
          : registry.teams.create({
              name: input.name as string,
              memberBotIds: input.memberBotIds as string[],
              expectedRevision: input.expectedRevision,
            });
      return jsonResponse(previous ? 200 : 201, {
        team,
        revision: registry.teams.list().revision,
      });
    }
    if (request.method === "GET" && path === "/bots/knowledge") {
      return jsonResponse(200, {
        knowledge: registry.knowledge.ledger.list(),
        grants: registry.knowledge.ledger.listGrants(),
      });
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
        (input.projectId === undefined) === (input.teamId === undefined) ||
        (input.projectId !== undefined &&
          typeof input.projectId !== "string") ||
        (input.teamId !== undefined && typeof input.teamId !== "string")
      ) {
        return jsonResponse(400, {
          error: "Explicit, scoped knowledge promotion is required.",
        });
      }
      const scopeDescription =
        typeof input.teamId === "string"
          ? `team ${registry.teams.get(input.teamId).name} (${input.teamId})`
          : `project ${input.projectId as string}`;
      const confirmed = await confirmSensitiveAction?.({
        kind: "knowledge-promotion",
        title: input.teamId
          ? "Promote selected team knowledge?"
          : "Promote selected project knowledge?",
        message: input.title,
        detail: `Doolittle will copy one selected conversation message into the private knowledge broker for ${scopeDescription}. It will not be shared with another bot until you grant access.`,
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
          teamId: input.teamId as string | undefined,
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
      const record = registry.knowledge.ledger.get(knowledgeAction[1]);
      if (!record) throw new Error("Knowledge not found.");
      const scopeLabel =
        record.scope.kind === "team"
          ? `team ${registry.teams.list().teams.find((team) => team.id === record.scope.id)?.name ?? record.scope.id} (${record.scope.id})`
          : `project ${record.scope.id}`;
      const targetLabel = botId
        ? `${registry.catalog?.get(botId)?.name ?? registry.get(botId).name ?? "Selected bot"} (${botId})`
        : "all granted bots";
      const confirmed = await confirmSensitiveAction?.({
        kind: "knowledge-promotion",
        title:
          knowledgeAction[2] === "grant"
            ? "Share promoted knowledge?"
            : "Revoke promoted knowledge?",
        message: `${record.title} — ${targetLabel}`,
        detail: `This change affects future consultations using explicitly promoted knowledge from ${scopeLabel}.${record.scope.kind === "team" ? " Team grants can share this selected message across projects; both bots must remain current team members." : " Both bots must remain current project members."} Private bot memory remains separate. Information already delivered to a model cannot be erased.`,
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
