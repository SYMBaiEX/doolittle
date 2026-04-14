import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveSkillHubCatalog,
  getEffectiveSkillHubFamilies,
  getEffectiveSkillHubGenerated,
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubSummary,
  getEffectiveSkillHubWorkspace,
} from "@/runtime/native/service-bridge/skill-hub";
import { json } from "@/server/responses";

export async function handleSkillsHubRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/skills/hub") {
    return json({
      summary: getEffectiveSkillHubSummary(context.services),
      workspace: getEffectiveSkillHubWorkspace(context.services),
      generated: getEffectiveSkillHubGenerated(context.services),
      installed: getEffectiveSkillHubInstalled(context.services),
      families: getEffectiveSkillHubFamilies(context.services, 50),
      catalog: await getEffectiveSkillHubCatalog(context.services, false, 50),
    });
  }

  if (url.pathname === "/skills/hub/distribution") {
    return json({
      distribution: getEffectiveSkillHubSummary(context.services).distribution,
    });
  }

  return null;
}
