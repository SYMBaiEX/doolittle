import type { AppContext } from "../../runtime/bootstrap/index";
import { json } from "../responses";

export async function handleDelegationTaskFallbackRoutes(
  _context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (
    request.method === "POST" &&
    url.pathname.startsWith("/delegation/tasks/")
  ) {
    return json({ error: "unknown delegation action" }, 404);
  }

  return null;
}
