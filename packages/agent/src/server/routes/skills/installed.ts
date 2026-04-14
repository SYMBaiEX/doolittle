import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubInstalledManifest,
} from "@/runtime/native/service-bridge/skill-hub";
import { json } from "@/server/responses";

export async function handleSkillsInstalledRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/skills/installed") {
    return json({
      installed: getEffectiveSkillHubInstalled(context.services),
    });
  }

  if (url.pathname.startsWith("/skills/installed/")) {
    const slug = url.pathname.replace("/skills/installed/", "").trim();
    if (!slug) {
      return json({ error: "Skill slug is required." }, 400);
    }
    return json({
      manifest: getEffectiveSkillHubInstalledManifest(
        context.services,
        slug,
      ) ?? {
        error: `Installed skill manifest not found: ${slug}`,
      },
    });
  }

  return null;
}
