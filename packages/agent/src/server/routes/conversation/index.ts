import type { AppContext } from "@/runtime/bootstrap";
import { readWorkerBotProfile } from "@/runtime/bootstrap/bot-profile";
import {
  handleChatRoute,
  handleChatRunEventsRoute,
  handleChatSubmitRoute,
} from "./chat";
import { handleResponsesRoute } from "./responses";

function runIdFromPath(encoded: string | undefined): string | null {
  if (!encoded || !/^(?:[a-zA-Z0-9:_-]|%3A){1,130}$/iu.test(encoded))
    return null;
  const id = encoded.replace(/%3A/giu, ":");
  return /^[a-zA-Z0-9:_-]{1,128}$/u.test(id) ? id : null;
}

export async function handleConversationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const botId =
    readWorkerBotProfile()?.id ?? String(context.runtime?.agentId ?? "default");
  if (request.method === "POST" && url.pathname === "/chat") {
    // Desktop exposes the hot API listener while optional plugins continue to
    // hydrate. A turn still waits for the complete tool surface, so an
    // immediately submitted message cannot observe a partial plugin catalog.
    await context.ensureDeferredHydration("chat");
    return handleChatRoute(context, request);
  }

  if (request.method === "POST" && url.pathname === "/chat/runs") {
    await context.ensureDeferredHydration("chat");
    return handleChatSubmitRoute(context, request);
  }

  if (request.method === "POST") {
    const cancellation = url.pathname.match(/^\/chat\/runs\/([^/]+)\/cancel$/u);
    const cancelRunId = runIdFromPath(cancellation?.[1]);
    if (cancelRunId) {
      const result = context.services.runController.cancelRun(cancelRunId);
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
        ? new Response(JSON.stringify({ run: { ...run, botId } }), {
            headers: { "content-type": "application/json; charset=utf-8" },
          })
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
      const includeUpdates = url.searchParams.get("include_updates") === "true";
      return new Response(
        JSON.stringify({
          runs,
          ...(includeUpdates
            ? {
                updates: Object.fromEntries(
                  runs.map((run) => [
                    run.runId,
                    context.services.runController
                      .getTaskEvents(run.runId)
                      .filter((event) => event.type === "agent.run")
                      .slice(-30)
                      .map((event) => event.data),
                  ]),
                ),
              }
            : {}),
        }),
        { headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/responses") {
    await context.ensureDeferredHydration("responses-api");
  }
  return handleResponsesRoute(context, request, url);
}
