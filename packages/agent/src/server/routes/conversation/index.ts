import {
  isTransientRunUpdate,
  RUN_ACTIVITY_REPLAY_LIMIT,
} from "@doolittle/contracts/run";
import { readWorkerBotProfile } from "../../../runtime/bootstrap/bot-profile";
import type { AppContext } from "../../../runtime/bootstrap/index";
import { isRecord } from "../../../utils/records";
import {
  handleChatRoute,
  handleChatRunEventsRoute,
  handleChatSubmitRoute,
} from "./chat";
import { handleResponsesRoute } from "./responses";
import { handleChatRunSteerRoute } from "./steer";

function runIdFromPath(encoded: string | undefined): string | null {
  if (!encoded || !/^(?:[a-zA-Z0-9:_-]|%3A){1,130}$/iu.test(encoded))
    return null;
  const id = encoded.replace(/%3A/giu, ":");
  return /^[a-zA-Z0-9:_-]{1,128}$/u.test(id) ? id : null;
}

function runActivityHistory(
  context: AppContext,
  runId: string,
  byteBudget = 240_000,
): unknown[] {
  const history: unknown[] = [];
  let remainingBytes = byteBudget;
  const events = context.services.runController.getTaskEvents(runId);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event.type !== "agent.run" ||
      !isRecord(event.data) ||
      isTransientRunUpdate(event.data.type)
    )
      continue;
    const bytes = Buffer.byteLength(JSON.stringify(event.data));
    if (bytes > remainingBytes) continue;
    remainingBytes -= bytes;
    history.push(event.data);
    if (history.length >= RUN_ACTIVITY_REPLAY_LIMIT) break;
  }
  return history.reverse();
}

export async function handleConversationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const botId =
    readWorkerBotProfile()?.id ?? String(context.runtime?.agentId ?? "default");
  if (request.method === "POST" && url.pathname === "/chat") {
    return handleChatRoute(context, request);
  }

  if (request.method === "POST" && url.pathname === "/chat/runs") {
    return handleChatSubmitRoute(context, request);
  }

  if (request.method === "POST") {
    const steer = url.pathname.match(/^\/chat\/runs\/([^/]+)\/steer$/u);
    const steerRunId = runIdFromPath(steer?.[1]);
    if (steerRunId) {
      return handleChatRunSteerRoute(context, request, steerRunId);
    }

    const cancellation = url.pathname.match(/^\/chat\/runs\/([^/]+)\/cancel$/u);
    const cancelRunId = runIdFromPath(cancellation?.[1]);
    if (cancelRunId) {
      const result =
        await context.services.runController.cancelRun(cancelRunId);
      if (!result.accepted) {
        return new Response(JSON.stringify({ error: "run not found" }), {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      return new Response(
        JSON.stringify({ accepted: true, run: { ...result.run, botId } }),
        {
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      );
    }
  }

  if (request.method === "GET") {
    const includeUpdates = url.searchParams.get("include_updates") === "true";
    const events = url.pathname.match(/^\/chat\/runs\/([^/]+)\/events$/u);
    const eventsRunId = runIdFromPath(events?.[1]);
    if (eventsRunId) {
      return handleChatRunEventsRoute(context, request, eventsRunId, url);
    }
    const receipt = url.pathname.match(/^\/chat\/runs\/([^/]+)$/u);
    const receiptRunId = runIdFromPath(receipt?.[1]);
    if (receiptRunId) {
      const run = context.services.runController.getByRunId(receiptRunId);
      return run
        ? new Response(
            JSON.stringify({
              run: { ...run, botId },
              ...(includeUpdates
                ? { updates: runActivityHistory(context, receiptRunId) }
                : {}),
            }),
            { headers: { "content-type": "application/json; charset=utf-8" } },
          )
        : new Response(JSON.stringify({ error: "run not found" }), {
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
    }
    if (url.pathname === "/chat/runs") {
      const requestedLimit = Number(url.searchParams.get("limit") ?? "30");
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
        : 30;
      const runs = context.services.runController
        .listReceipts(limit)
        .map((run) => ({ ...run, botId }));
      // Leave space for the run summaries within the desktop IPC response cap.
      const activityBudget = Math.floor(1_000_000 / Math.max(runs.length, 1));
      return new Response(
        JSON.stringify({
          runs,
          ...(includeUpdates
            ? {
                updates: Object.fromEntries(
                  runs.map((run) => [
                    run.runId,
                    runActivityHistory(context, run.runId, activityBudget),
                  ]),
                ),
              }
            : {}),
        }),
        { headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }
  }

  return handleResponsesRoute(context, request, url);
}
