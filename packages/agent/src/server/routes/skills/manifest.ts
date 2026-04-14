import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleSkillsManifestRoutes(
  _context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname.startsWith("/skills/manifest/")) {
    const slug = url.pathname.replace("/skills/manifest/", "").trim();
    if (!slug) {
      return json({ error: "Skill slug is required." }, 400);
    }
    return json({
      manifest: _context.services.skillsHub.manifest(slug) ?? {
        error: `Skill manifest not found: ${slug}`,
      },
    });
  }

  return null;
}
