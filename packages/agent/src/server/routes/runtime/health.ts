import { featureMap } from "@/config/feature-map";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleRuntimeHealthRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/health") {
    return json({
      status: "ok",
      name: context.config.agentName,
      mode: context.config.mode,
    });
  }

  if (request.method === "GET" && url.pathname === "/features") {
    return json({
      features: featureMap,
    });
  }

  return null;
}
