import type { AppContext } from "@/runtime/bootstrap";
import { handleChatRoute } from "./chat";
import { handleResponsesRoute } from "./responses";

export async function handleConversationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/chat") {
    // Desktop exposes the hot API listener while optional plugins continue to
    // hydrate. A turn still waits for the complete tool surface, so an
    // immediately submitted message cannot observe a partial plugin catalog.
    await context.ensureDeferredHydration("chat");
    return handleChatRoute(context, request);
  }

  if (request.method === "POST") {
    const cancellation = url.pathname.match(
      /^\/chat\/runs\/([a-zA-Z0-9:_-]{1,128})\/cancel$/,
    );
    if (cancellation?.[1]) {
      const result = context.services.runController.cancelRun(cancellation[1]);
      if (!result.accepted) {
        return new Response(JSON.stringify({ error: "run not found" }), {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      return new Response(JSON.stringify({ accepted: true, run: result.run }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  if (request.method === "GET") {
    const receipt = url.pathname.match(
      /^\/chat\/runs\/([a-zA-Z0-9:_-]{1,128})$/,
    );
    if (receipt?.[1]) {
      const run = context.services.runController.getByRunId(receipt[1]);
      return run
        ? new Response(JSON.stringify({ run }), {
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
      return new Response(
        JSON.stringify({
          runs: context.services.runController.listReceipts(limit),
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
