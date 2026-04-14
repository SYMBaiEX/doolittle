import type { AppContext } from "@/runtime/bootstrap";
import {
  exportEffectiveSkillHubManifest,
  importEffectiveSkillHubManifest,
  installEffectiveSkillHubManifest,
  syncEffectiveSkillHub,
} from "@/runtime/native/service-bridge/skill-hub";
import { json } from "@/server/responses";

export async function handleSkillsMutationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "POST") {
    return null;
  }

  if (url.pathname === "/skills/sync") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      refresh?: boolean;
    };
    return json({
      sync: await syncEffectiveSkillHub(
        context.services,
        Boolean(body.refresh),
      ),
    });
  }

  if (url.pathname === "/skills/export") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      slug?: string;
      destinationPath?: string;
      bundle?: boolean;
    };
    if (body.bundle) {
      return json({
        bundle: await context.services.skillsHub.exportBundle(
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
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
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
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      slug?: string;
    };
    if (!body.slug) {
      return json({ error: "slug is required" }, 400);
    }
    return json({
      install: await installEffectiveSkillHubManifest(
        context.services,
        body.slug,
      ),
    });
  }

  return null;
}
