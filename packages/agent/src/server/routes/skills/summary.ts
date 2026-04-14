import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveSkills,
  getEffectiveSkillsSummary,
} from "@/runtime/native/service-bridge/autonomous";
import {
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
    return json({
      skills: getEffectiveSkills(context.runtime, context.services),
      hub: getEffectiveSkillHubSummary(context.services),
      workspace: getEffectiveSkillHubWorkspace(context.services),
    });
  }

  if (url.pathname === "/skills/summary") {
    return json({
      summary: getEffectiveSkillsSummary(context.runtime, context.services),
      hub: getEffectiveSkillHubSummary(context.services),
      installed: getEffectiveSkillHubInstalled(context.services),
    });
  }

  return null;
}
