import type { AppContext } from "@/runtime/bootstrap";
import {
  exportEffectiveSkillHubManifest,
  getEffectiveGeneratedSkills,
  getEffectiveSkillHubCatalog,
  getEffectiveSkillHubFamilies,
  getEffectiveSkillHubFamily,
  getEffectiveSkillHubGenerated,
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubInstalledManifest,
  getEffectiveSkillHubSummary,
  getEffectiveSkillHubWorkspace,
  getEffectiveSkills,
  getEffectiveSkillsSummary,
  importEffectiveSkillHubManifest,
  installEffectiveSkillHubManifest,
  searchEffectiveSkillHubCatalog,
  syncEffectiveSkillHub,
} from "@/runtime/native/service-bridge/index";
import { json } from "@/server/responses";

export async function handleSkillRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/skills") {
    return json({
      skills: getEffectiveSkills(context.runtime, context.services),
      hub: getEffectiveSkillHubSummary(context.services),
      workspace: getEffectiveSkillHubWorkspace(context.services),
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/summary") {
    return json({
      summary: getEffectiveSkillsSummary(context.runtime, context.services),
      hub: getEffectiveSkillHubSummary(context.services),
      installed: getEffectiveSkillHubInstalled(context.services),
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/catalog") {
    const query = url.searchParams.get("query")?.trim();
    const refresh =
      url.searchParams.get("refresh") === "true" ||
      url.searchParams.get("refresh") === "1";
    return json(
      query
        ? await searchEffectiveSkillHubCatalog(context.services, query)
        : refresh
          ? await getEffectiveSkillHubCatalog(context.services, true, 50)
          : await getEffectiveSkillHubCatalog(context.services, false, 50),
    );
  }

  if (request.method === "GET" && url.pathname.startsWith("/skills/catalog/")) {
    const slug = url.pathname.replace("/skills/catalog/", "").trim();
    if (!slug || slug === "search") {
      return json({ error: "Skill slug is required." }, 400);
    }
    return json(
      (await context.services.skillsHub.catalogEntry(slug)) ?? {
        error: `Skill not found: ${slug}`,
      },
    );
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/skills/manifest/")
  ) {
    const slug = url.pathname.replace("/skills/manifest/", "").trim();
    if (!slug) {
      return json({ error: "Skill slug is required." }, 400);
    }
    return json({
      manifest: context.services.skillsHub.manifest(slug) ?? {
        error: `Skill manifest not found: ${slug}`,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/generated") {
    return json({
      skills: getEffectiveGeneratedSkills(context.runtime, context.services),
      hub: getEffectiveSkillHubGenerated(context.services),
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/generated/detail") {
    const slug = url.searchParams.get("slug");
    if (!slug) {
      return json({ error: "slug is required" }, 400);
    }
    return json({
      detail: context.services.skillSynthesis.describeGeneratedSkill(slug),
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/hub") {
    return json({
      summary: getEffectiveSkillHubSummary(context.services),
      workspace: getEffectiveSkillHubWorkspace(context.services),
      generated: getEffectiveSkillHubGenerated(context.services),
      installed: getEffectiveSkillHubInstalled(context.services),
      families: getEffectiveSkillHubFamilies(context.services, 50),
      catalog: await getEffectiveSkillHubCatalog(context.services, false, 50),
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/hub/distribution") {
    return json({
      distribution: getEffectiveSkillHubSummary(context.services).distribution,
    });
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/skills/families" ||
      url.pathname === "/skills/hub/families")
  ) {
    return json({
      families: getEffectiveSkillHubFamilies(context.services, 50),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/skills/families/")
  ) {
    const slug = url.pathname.replace("/skills/families/", "").trim();
    if (!slug) {
      return json({ error: "Skill family slug is required." }, 400);
    }
    return json({
      family: getEffectiveSkillHubFamily(context.services, slug) ?? {
        error: `Skill family not found: ${slug}`,
      },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/skills/hub/families/")
  ) {
    const slug = url.pathname.replace("/skills/hub/families/", "").trim();
    if (!slug) {
      return json({ error: "Skill family slug is required." }, 400);
    }
    return json({
      family: getEffectiveSkillHubFamily(context.services, slug) ?? {
        error: `Skill family not found: ${slug}`,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/installed") {
    return json({
      installed: getEffectiveSkillHubInstalled(context.services),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/skills/installed/")
  ) {
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

  if (request.method === "POST" && url.pathname === "/skills/sync") {
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

  if (request.method === "POST" && url.pathname === "/skills/export") {
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

  if (request.method === "POST" && url.pathname === "/skills/import") {
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

  if (request.method === "POST" && url.pathname === "/skills/install") {
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
