import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveSkills,
  getEffectiveSkillsSummary,
} from "@/runtime/native/service-bridge/autonomous";
import {
  getEffectiveSkillHubCatalog,
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubSummary,
  getEffectiveSkillHubWorkspace,
} from "@/runtime/native/service-bridge/skill-hub";
import { json } from "@/server/responses";

export async function handleSkillsSummaryRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/skills") {
    await getEffectiveSkillHubCatalog(
      context.runtime,
      context.services,
      false,
      500,
    );
    return json({
      skills: getEffectiveSkills(context.runtime, context.services),
      hub: getEffectiveSkillHubSummary(context.services),
      workspace: getEffectiveSkillHubWorkspace(context.services),
      summary: getEffectiveSkillsSummary(context.runtime, context.services),
      installed: getEffectiveSkillHubInstalled(
        context.runtime,
        context.services,
      ),
    });
  }

  if (url.pathname === "/skills/summary") {
    await getEffectiveSkillHubCatalog(
      context.runtime,
      context.services,
      false,
      500,
    );
    return json({
      summary: getEffectiveSkillsSummary(context.runtime, context.services),
      hub: getEffectiveSkillHubSummary(context.services),
      installed: getEffectiveSkillHubInstalled(
        context.runtime,
        context.services,
      ),
    });
  }

  return null;
}
