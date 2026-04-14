import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveExperienceSummary,
  getEffectivePersonalityList,
  getEffectivePersonalitySummary,
} from "@/runtime/native/service-bridge/ownership";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";
import { handleIdentityProfileRoutes } from "./identity/profiles";

export async function handleIdentityRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const nativeServices = getNativeServices(context.runtime);

  if (request.method === "GET" && url.pathname === "/personality") {
    const activeId =
      nativeServices.personality?.activeId() ??
      context.services.personalities.getActive().id;
    const available = getEffectivePersonalityList(
      context.runtime,
      context.services,
    );
    return json({
      active:
        available.find(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            "id" in entry &&
            entry.id === activeId,
        ) ?? context.services.personalities.getActive(),
      available,
      summary: getEffectivePersonalitySummary(
        context.runtime,
        context.services,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/personality/summary") {
    return json({
      summary: getEffectivePersonalitySummary(
        context.runtime,
        context.services,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/personality") {
    const body = (await request.json()) as { id: string };
    return json({
      active:
        nativeServices.personality?.activate(body.id) ??
        context.services.personalities.setActive(body.id),
    });
  }

  const profileRoute = await handleIdentityProfileRoutes(
    context,
    request,
    url,
    nativeServices,
  );
  if (profileRoute) {
    return profileRoute;
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/experience" || url.pathname === "/experience/summary")
  ) {
    return json({
      summary: getEffectiveExperienceSummary(context.runtime, context.services),
    });
  }

  return null;
}
