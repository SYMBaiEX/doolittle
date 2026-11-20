import type { AppContext } from "../../../runtime/bootstrap/index";
import {
  exportEffectiveSkillHubBundle,
  exportEffectiveSkillHubManifest,
  importEffectiveSkillHubManifest,
  installEffectiveSkill,
  syncEffectiveSkillCatalog,
} from "../../../runtime/native/service-bridge/skill-hub/index";
import { readRouteJsonBody } from "../../request-body";
import { json } from "../../responses";

export async function handleSkillsMutationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "POST") {
    return null;
  }

  if (url.pathname === "/skills/sync") {
    return json({
      sync: await syncEffectiveSkillCatalog(context.runtime),
    });
  }

  if (url.pathname === "/skills/export") {
    const parsed = await readRouteJsonBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      slug?: string;
      destinationPath?: string;
      bundle?: boolean;
    };
    if (body.bundle) {
      return json({
        bundle: await exportEffectiveSkillHubBundle(
          context.runtime,
          context.services,
          body.slug ?? "skills-hub",
        ),
      });
    }
    if (!body.slug) {
      return json({ error: "slug is required" }, 400);
    }
    return json({
      manifest: exportEffectiveSkillHubManifest(
        context.services,
        body.slug,
        body.destinationPath,
      ),
    });
  }

  if (url.pathname === "/skills/import") {
    const parsed = await readRouteJsonBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      sourcePath?: string;
    };
    if (!body.sourcePath) {
      return json({ error: "sourcePath is required" }, 400);
    }
    return json({
      import: importEffectiveSkillHubManifest(
        context.services,
        body.sourcePath,
      ),
    });
  }

  if (url.pathname === "/skills/install") {
    const parsed = await readRouteJsonBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      slug?: string;
    };
    if (!body.slug) {
      return json({ error: "slug is required" }, 400);
    }
    return json({
      install: await installEffectiveSkill(context.runtime, body.slug),
    });
  }

  return null;
}
