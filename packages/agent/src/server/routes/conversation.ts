import type { AppContext } from "@/runtime/bootstrap";
import { handleChatRoute } from "./conversation/chat";
import { handleResponsesRoute } from "./conversation/responses";

export async function handleConversationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/chat") {
    return handleChatRoute(context, request);
  }

  return handleResponsesRoute(context, request, url);
}
