import type { AppContext } from "@/runtime/bootstrap";
import {
  activateEffectivePersonality,
  getEffectiveActivePersonality,
  getEffectiveExperienceSummary,
  getEffectivePersonalityList,
  getEffectivePersonalitySummary,
} from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";
import { handleIdentityProfileRoutes } from "./identity/profiles";

export async function handleIdentityRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/personality") {
    const active = getEffectiveActivePersonality(
      context.runtime,
      context.services,
    );
    const available = getEffectivePersonalityList(
      context.runtime,
      context.services,
    );
    return json({
      active,
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
      active: activateEffectivePersonality(
        context.runtime,
        context.services,
        body.id,
      ),
    });
  }

  const profileRoute = await handleIdentityProfileRoutes(context, request, url);
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
