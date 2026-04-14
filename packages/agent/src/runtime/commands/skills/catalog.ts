import {
  exportEffectiveSkillHubManifest,
  getEffectiveSkillHubCatalog,
  importEffectiveSkillHubManifest,
  installEffectiveSkillHubManifest,
  searchEffectiveSkillHubCatalog,
  syncEffectiveSkillHub,
} from "@/runtime/native/service-bridge/skill-hub";

import type { SkillCommandHandler } from "./types";

export const handleSkillCatalogCommand: SkillCommandHandler = async (
  trimmed,
  context,
) => {
  if (trimmed === "/skills catalog") {
    return JSON.stringify(
      await getEffectiveSkillHubCatalog(context.services, false, 50),
      null,
      2,
    );
  }

  if (trimmed === "/skills catalog refresh") {
    return JSON.stringify(
      await getEffectiveSkillHubCatalog(context.services, true, 50),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills catalog search ")) {
    const query = trimmed.replace("/skills catalog search ", "").trim();
    if (!query) {
      return "Usage: /skills catalog search <query>";
    }
    return JSON.stringify(
      await searchEffectiveSkillHubCatalog(context.services, query),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills catalog show ")) {
    const slug = trimmed.replace("/skills catalog show ", "").trim();
    if (!slug) {
      return "Usage: /skills catalog show <slug>";
    }
    return JSON.stringify(
      (await context.services.skillsHub.catalogEntry(slug)) ?? {
        error: `Catalog skill not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills sync" || trimmed === "/skills sync refresh") {
    return JSON.stringify(
      await syncEffectiveSkillHub(context.services, true),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills manifest ")) {
    const slug = trimmed.replace("/skills manifest ", "").trim();
    if (!slug) {
      return "Usage: /skills manifest <slug>";
    }
    return JSON.stringify(
      context.services.skillsHub.manifest(slug) ?? {
        error: `Skill manifest not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills export ")) {
    const raw = trimmed.replace("/skills export ", "").trim();
    if (!raw) {
      return "Usage: /skills export <slug|all>";
    }
    if (raw === "all") {
      return JSON.stringify(
        await context.services.skillsHub.exportBundle("skills-hub"),
        null,
        2,
      );
    }
    return JSON.stringify(
      exportEffectiveSkillHubManifest(context.services, raw),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills import ")) {
    const sourcePath = trimmed.replace("/skills import ", "").trim();
    if (!sourcePath) {
      return "Usage: /skills import <manifest-path>";
    }
    return JSON.stringify(
      importEffectiveSkillHubManifest(context.services, sourcePath),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills install ")) {
    const slug = trimmed.replace("/skills install ", "").trim();
    if (!slug) {
      return "Usage: /skills install <catalog-slug>";
    }
    return JSON.stringify(
      await installEffectiveSkillHubManifest(context.services, slug),
      null,
      2,
    );
  }

  return undefined;
};
