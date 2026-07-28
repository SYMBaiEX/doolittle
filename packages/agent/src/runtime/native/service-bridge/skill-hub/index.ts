import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import {
  type LoadedSkillWithSource,
  type SkillCatalogEntry,
  type SkillDetails,
  searchSkillsMarketplace,
} from "@elizaos/plugin-agent-skills";
import type { AppServices } from "@/services";
import type {
  SkillHubCatalogRecord,
  SkillHubInstalledRecord,
  SkillHubManifest,
} from "@/services/skills-hub/types";
import { getNativeServices, type RuntimeLike } from "../runtime";

const OFFICIAL_SOURCE = "@elizaos/plugin-agent-skills";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function skillFilePath(skill: LoadedSkillWithSource): string {
  return basename(skill.path).toLowerCase() === "skill.md"
    ? skill.path
    : join(skill.path, "SKILL.md");
}

function rootFromSlug(slug: string): string {
  return slug.split("/")[0] || "skills";
}

function categoryFromSlug(slug: string): string {
  return slug.split("/").slice(0, 2).join("/") || rootFromSlug(slug);
}

function projectCatalogSkill(
  services: AppServices,
  skill: SkillCatalogEntry,
  installed: Set<string>,
): SkillHubCatalogRecord {
  const workspace = services.skills.get(skill.slug);
  return {
    slug: skill.slug,
    displayName: skill.displayName,
    summary: skill.summary,
    tags: skill.tags,
    tagList: Object.entries(skill.tags).flatMap(([key, value]) => [
      key,
      `${key}:${value}`,
    ]),
    installsCurrent: installed.has(skill.slug) ? 1 : 0,
    installsAllTime: skill.stats.downloads,
    stars: skill.stats.stars,
    versions: skill.version ? 1 : 0,
    installed: installed.has(skill.slug),
    workspacePath: workspace?.path,
    manifestPath: services.skillsHub.manifest(skill.slug)?.path,
    source: workspace ? "workspace" : "catalog",
  };
}

function projectSkillDetails(
  services: AppServices,
  details: SkillDetails,
  installed: boolean,
): SkillHubCatalogRecord {
  const skill = details.skill;
  const workspace = services.skills.get(skill.slug);
  return {
    slug: skill.slug,
    displayName: skill.displayName,
    summary: skill.summary,
    tags: skill.tags,
    tagList: Object.entries(skill.tags).flatMap(([key, value]) => [
      key,
      `${key}:${value}`,
    ]),
    installsCurrent: 0,
    installsAllTime: skill.stats.downloads,
    stars: skill.stats.stars,
    versions: skill.stats.versions,
    installed,
    workspacePath: workspace?.path,
    manifestPath: services.skillsHub.manifest(skill.slug)?.path,
    source: workspace ? "workspace" : "catalog",
  };
}

function projectInstalledSkill(
  skill: LoadedSkillWithSource,
): SkillHubInstalledRecord {
  return {
    slug: skill.slug,
    title: skill.name,
    path: skillFilePath(skill),
    installedAt: new Date(skill.loadedAt).toISOString(),
    source: "managed",
    root: rootFromSlug(skill.slug),
    category: categoryFromSlug(skill.slug),
  };
}

function projectInstalledManifest(
  skill: LoadedSkillWithSource,
): SkillHubManifest {
  const path = skillFilePath(skill);
  const content = skill.content;
  return {
    kind: "skill-manifest",
    slug: skill.slug,
    title: skill.name,
    description: skill.description,
    source: "installed",
    path,
    root: rootFromSlug(skill.slug),
    category: categoryFromSlug(skill.slug),
    installable: false,
    content,
    contentLength: content.length,
    lineCount: content.split("\n").length,
    hash: createHash("sha256").update(content).digest("hex"),
    tags: [],
    generatedAt: new Date(skill.loadedAt).toISOString(),
    workspacePath: path,
  };
}

export async function getEffectiveSkillHubCatalog(
  runtime: RuntimeLike,
  services: AppServices,
  force = false,
  limit = 50,
) {
  const official = getNativeServices(runtime).agentSkills;
  if (!official) {
    return services.skillsHub.catalog(force, limit);
  }
  const installed = new Set(
    official.getManagedSkills().map((skill) => skill.slug),
  );
  const catalog = await official.getCatalog({ forceRefresh: force });
  return catalog
    .slice(0, Math.max(0, limit))
    .map((skill) => projectCatalogSkill(services, skill, installed));
}

export async function searchEffectiveSkillHubCatalog(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 15,
) {
  const official = getNativeServices(runtime).agentSkills;
  if (!official) {
    return services.skillsHub.searchCatalog(query, limit);
  }
  try {
    return {
      available: true,
      source: OFFICIAL_SOURCE,
      query,
      results: await official.search(query, limit),
    };
  } catch (error) {
    return {
      available: false,
      source: OFFICIAL_SOURCE,
      query,
      results: [],
      error: errorMessage(error),
    };
  }
}

export async function searchEffectiveSkillsMarketplace(
  query: string,
  limit = 15,
) {
  try {
    return {
      available: true,
      source: OFFICIAL_SOURCE,
      query,
      limit,
      results: await searchSkillsMarketplace(query, { limit }),
    };
  } catch (error) {
    return {
      available: false,
      source: OFFICIAL_SOURCE,
      query,
      limit,
      results: [],
      error: errorMessage(error),
    };
  }
}

export async function getEffectiveSkillHubCatalogEntry(
  runtime: RuntimeLike,
  services: AppServices,
  slug: string,
) {
  const official = getNativeServices(runtime).agentSkills;
  if (!official) {
    return services.skillsHub.catalogEntry(slug);
  }
  const details = await official.getSkillDetails(slug);
  return details
    ? projectSkillDetails(services, details, await official.isInstalled(slug))
    : undefined;
}

export function getEffectiveSkillHubSummary(services: AppServices) {
  return services.skillsHub.summary();
}

export function getEffectiveSkillHubWorkspace(services: AppServices) {
  return services.skillsHub.workspace();
}

export function getEffectiveSkillHubGenerated(services: AppServices) {
  return services.skillsHub.generated();
}

export function getEffectiveSkillHubFamilies(
  services: AppServices,
  limit = 50,
) {
  return services.skillsHub.families(false, limit);
}

export function getEffectiveSkillHubFamily(
  services: AppServices,
  slug: string,
) {
  return services.skillsHub.family(slug);
}

export function getEffectiveSkillHubInstalled(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const official = getNativeServices(runtime).agentSkills;
  return official
    ? official.getManagedSkills().map(projectInstalledSkill)
    : services.skillsHub.installedManifests();
}

export function getEffectiveSkillHubInstalledManifest(
  runtime: RuntimeLike,
  services: AppServices,
  slug: string,
) {
  const official = getNativeServices(runtime).agentSkills;
  if (!official) {
    return services.skillsHub.installedManifest(slug);
  }
  const skill = official.getLoadedSkill(slug);
  return skill?.source === "managed"
    ? projectInstalledManifest(skill)
    : undefined;
}

export async function syncEffectiveSkillCatalog(runtime: RuntimeLike) {
  const official = getNativeServices(runtime).agentSkills;
  if (!official) {
    return {
      available: false,
      source: OFFICIAL_SOURCE,
      error: "Agent Skills service is unavailable.",
    };
  }
  try {
    return {
      available: true,
      source: OFFICIAL_SOURCE,
      result: await official.syncCatalog(),
    };
  } catch (error) {
    return {
      available: false,
      source: OFFICIAL_SOURCE,
      error: errorMessage(error),
    };
  }
}

export async function installEffectiveSkill(
  runtime: RuntimeLike,
  slug: string,
) {
  const official = getNativeServices(runtime).agentSkills;
  if (!official) {
    return {
      available: false,
      source: OFFICIAL_SOURCE,
      slug,
      installed: false,
      error: "Agent Skills service is unavailable.",
    };
  }
  try {
    const installed = await official.install(slug);
    return {
      available: true,
      source: OFFICIAL_SOURCE,
      slug,
      installed,
    };
  } catch (error) {
    return {
      available: false,
      source: OFFICIAL_SOURCE,
      slug,
      installed: false,
      error: errorMessage(error),
    };
  }
}

export function exportEffectiveSkillHubManifest(
  services: AppServices,
  slug: string,
  destinationPath?: string,
) {
  return services.skillsHub.exportManifest(slug, destinationPath);
}

export function importEffectiveSkillHubManifest(
  services: AppServices,
  sourcePath: string,
) {
  return services.skillsHub.importManifest(sourcePath);
}
