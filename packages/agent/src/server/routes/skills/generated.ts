import type { AppContext } from "@/runtime/bootstrap";
import { getEffectiveGeneratedSkills } from "@/runtime/native/service-bridge/ownership";
import { getEffectiveSkillHubGenerated } from "@/runtime/native/service-bridge/skill-hub";
import { json } from "@/server/responses";

export async function handleGeneratedSkillsRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/skills/generated") {
    return json({
      skills: getEffectiveGeneratedSkills(context.runtime, context.services),
      hub: getEffectiveSkillHubGenerated(context.services),
    });
  }

  if (url.pathname === "/skills/generated/detail") {
    const slug = url.searchParams.get("slug");
    if (!slug) {
      return json({ error: "slug is required" }, 400);
    }
    return json({
      detail: context.services.skillSynthesis.describeGeneratedSkill(slug),
    });
  }

  return null;
}
