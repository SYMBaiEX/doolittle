import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimeAccountRoutes } from "./accounts";
import { handleRuntimeEcosystemRoutes } from "./ecosystem";
import { handleRuntimeModelRoutes } from "./models";
import { handleRuntimeStatusRoutes } from "./status";
import { handleRuntimeWorkspaceRoutes } from "./workspace";

export async function handleRuntimeRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const handlers = [
    handleRuntimeWorkspaceRoutes,
    handleRuntimeAccountRoutes,
    handleRuntimeModelRoutes,
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
