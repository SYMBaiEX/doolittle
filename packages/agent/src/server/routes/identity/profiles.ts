import type { AppContext } from "@/runtime/bootstrap";
import type { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { handleIdentityProfileGetRoute } from "./profiles-get";
import { handleIdentityProfilePostRoute } from "./profiles-post";

type NativeServices = ReturnType<typeof getNativeServices>;

export async function handleIdentityProfileRoutes(
  context: AppContext,
  request: Request,
  url: URL,
  nativeServices: NativeServices,
): Promise<Response | null> {
  if (request.method === "GET") {
    return handleIdentityProfileGetRoute({
      context,
      request,
      url,
      nativeServices,
    });
  }

  if (request.method === "POST") {
    return handleIdentityProfilePostRoute({
      context,
      request,
      url,
      nativeServices,
    });
  }

  return null;
}
