import type { AppContext } from "@/runtime/bootstrap";
import { DEFAULT_LOCAL_USER_ID } from "@/runtime/message-user";
import { getEffectiveMemorySnapshot } from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";

function resolveMemoryTarget(url: URL): "memory" | "user" {
  return url.searchParams.get("target") === "user" ? "user" : "memory";
}

export async function handleMemoryRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/memory") {
    const target = resolveMemoryTarget(url);
    const userId =
      target === "user"
        ? (url.searchParams.get("userId") ?? DEFAULT_LOCAL_USER_ID)
        : undefined;
    return json({
      target,
      summary: getEffectiveMemorySnapshot(
        context.runtime,
        context.services,
        target,
        userId,
      ),
      snapshot: context.services.memory.renderSnapshot(target, userId),
    });
  }

  if (request.method === "GET" && url.pathname === "/memory/summary") {
    const target = resolveMemoryTarget(url);
    const userId =
      target === "user"
        ? (url.searchParams.get("userId") ?? DEFAULT_LOCAL_USER_ID)
        : undefined;
    return json({
      summary: getEffectiveMemorySnapshot(
        context.runtime,
        context.services,
        target,
        userId,
      ),
    });
  }

  return null;
}
