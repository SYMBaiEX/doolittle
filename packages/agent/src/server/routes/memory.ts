import type { AppContext } from "@/runtime/bootstrap";
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
    return json({
      target,
      summary: getEffectiveMemorySnapshot(
        context.runtime,
        context.services,
        target,
      ),
      snapshot: context.services.memory.renderSnapshot(target),
    });
  }

  if (request.method === "GET" && url.pathname === "/memory/summary") {
    const target = resolveMemoryTarget(url);
    return json({
      summary: getEffectiveMemorySnapshot(
        context.runtime,
        context.services,
        target,
      ),
    });
  }

  return null;
}
