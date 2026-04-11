import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimeAccountRoutes } from "./accounts";
import { handleRuntimeEcosystemRoutes } from "./ecosystem";
import { handleRuntimeHealthRoutes } from "./health";
import { handleRuntimeStatusRoutes } from "./status";

export async function handleRuntimeRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const handlers = [
    handleRuntimeHealthRoutes,
    handleRuntimeAccountRoutes,
    handleRuntimeStatusRoutes,
    handleRuntimeEcosystemRoutes,
  ];

  for (const handler of handlers) {
    const response = await handler(context, request, url);
    if (response) {
      return response;
    }
  }

  return null;
}
