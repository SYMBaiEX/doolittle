import type { AppContext } from "@/runtime/bootstrap";
import { handleGatewayConfigRoutes } from "./config";
import { handleGatewayControlRoutes } from "./control";
import { handleGatewayHealthRoutes } from "./health";
import { handleGatewayHistoryRoutes } from "./history";
import { handleGatewayMessageRoutes } from "./messages";

export async function handleGatewayRuntimeRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const handlers = [
    handleGatewayConfigRoutes,
    handleGatewayHealthRoutes,
    handleGatewayHistoryRoutes,
    handleGatewayControlRoutes,
    handleGatewayMessageRoutes,
  ];

  for (const handler of handlers) {
    const response = await handler(context, request, url);
    if (response) {
      return response;
    }
  }

  return null;
}
