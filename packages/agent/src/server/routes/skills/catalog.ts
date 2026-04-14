import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveSkillHubCatalog,
  getEffectiveSkillHubFamilies,
  getEffectiveSkillHubFamily,
  searchEffectiveSkillHubCatalog,
} from "@/runtime/native/service-bridge/skill-hub";
import { json } from "@/server/responses";

export async function handleSkillsCatalogRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/skills/catalog") {
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

  if (url.pathname.startsWith("/skills/catalog/")) {
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

  return null;
}

export async function handleSkillsFamiliesRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  if (
    url.pathname === "/skills/families" ||
    url.pathname === "/skills/hub/families"
  ) {
    return json({
      families: getEffectiveSkillHubFamilies(context.services, 50),
    });
  }

  if (url.pathname.startsWith("/skills/families/")) {
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

  if (url.pathname.startsWith("/skills/hub/families/")) {
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

  return null;
}
