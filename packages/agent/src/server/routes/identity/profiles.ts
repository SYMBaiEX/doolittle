import type { AppContext } from "@/runtime/bootstrap";
import { handleIdentityProfileGetRoute } from "./profiles-get";
import { handleIdentityProfilePostRoute } from "./profiles-post";

export async function handleIdentityProfileRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET") {
    return handleIdentityProfileGetRoute({
      context,
      request,
      url,
    });
  }

  if (request.method === "POST") {
    return handleIdentityProfilePostRoute({
      context,
      request,
      url,
    });
  }

  return null;
}
