import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import {
  buildGatewayDaemonResponse,
  buildGatewayHealthResponse,
  buildGatewayRuntimeResponse,
} from "./responses";

export async function handleGatewayHealthRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/gateway/health") {
    return json(await buildGatewayHealthResponse(context));
  }

  if (request.method === "GET" && url.pathname === "/gateway/runtime") {
    return json(buildGatewayRuntimeResponse(context));
  }

  if (request.method === "GET" && url.pathname === "/gateway/daemon") {
    return json(buildGatewayDaemonResponse(context));
  }

  return null;
}
