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
import { errorMessage } from "@/utils/error-message";
import { getNativeServices, type RuntimeLike } from "../runtime";
import type { NativeAgentSkillsService } from "../runtime-contracts";

const OFFICIAL_SOURCE = "@elizaos/plugin-agent-skills";
const CATALOG_READ_TIMEOUT_MS = 3_000;
const catalogReads = new WeakMap<object, Promise<SkillCatalogEntry[]>>();

export class AgentSkillsServiceUnavailableError extends Error {
  readonly code = "AGENT_SKILLS_SERVICE_UNAVAILABLE";

  constructor() {
    super(
      "AGENT_SKILLS_SERVICE is unavailable. Skills require @elizaos/plugin-agent-skills.",
    );
    this.name = "AgentSkillsServiceUnavailableError";
  }
}

export function requireOfficialAgentSkills(
  runtime: RuntimeLike,
): NativeAgentSkillsService {
  const service = getNativeServices(runtime).agentSkills;
  if (!service) {
    throw new AgentSkillsServiceUnavailableError();
  }
  return service;
}

function officialCatalogRead(
  official: NativeAgentSkillsService,
  forceRefresh: boolean,
): Promise<SkillCatalogEntry[]> {
  const key = official as object;
  let request = forceRefresh ? undefined : catalogReads.get(key);
  if (!request) {
    request = official.getCatalog({ forceRefresh });
    catalogReads.set(key, request);
    const tracked = request;
    void tracked
      .finally(() => {
        if (catalogReads.get(key) === tracked) {
          catalogReads.delete(key);
        }
      })
      .catch(() => undefined);
  }
  return request;
}

async function boundedCatalogRead(
  official: NativeAgentSkillsService,
  forceRefresh: boolean,
): Promise<SkillCatalogEntry[] | undefined> {
  const request = officialCatalogRead(official, forceRefresh);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), CATALOG_READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
  const official = requireOfficialAgentSkills(runtime);
  const managed = official.getManagedSkills();
  const installed = new Set(managed.map((skill) => skill.slug));
  const catalog = await boundedCatalogRead(official, force);
  if (!catalog) {
    services.skillsHub.project({
      installed: managed.map(projectInstalledSkill),
    });
    return [];
  }
  const projected = catalog.map((skill) =>
    projectCatalogSkill(services, skill, installed),
  );
  services.skillsHub.project({
    catalog: projected,
    installed: managed.map(projectInstalledSkill),
  });
  return projected.slice(0, Math.max(0, limit));
}

export async function searchEffectiveSkillHubCatalog(
  runtime: RuntimeLike,
  _services: AppServices,
  query: string,
  limit = 15,
) {
  const official = requireOfficialAgentSkills(runtime);
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
  const official = requireOfficialAgentSkills(runtime);
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
  const installed = requireOfficialAgentSkills(runtime)
    .getManagedSkills()
    .map(projectInstalledSkill);
  services.skillsHub.project({ installed });
  return installed;
}

export function getEffectiveSkillHubInstalledManifest(
  runtime: RuntimeLike,
  _services: AppServices,
  slug: string,
) {
  const official = requireOfficialAgentSkills(runtime);
  const skill = official.getLoadedSkill(slug);
  return skill?.source === "managed"
    ? projectInstalledManifest(skill)
    : undefined;
}

export async function syncEffectiveSkillCatalog(runtime: RuntimeLike) {
  const official = requireOfficialAgentSkills(runtime);
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
  const official = requireOfficialAgentSkills(runtime);
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

export async function exportEffectiveSkillHubBundle(
  runtime: RuntimeLike,
  services: AppServices,
  label = "skills-hub",
) {
  const catalog = await getEffectiveSkillHubCatalog(
    runtime,
    services,
    false,
    500,
  );
  const installed = getEffectiveSkillHubInstalled(runtime, services);
  return services.skillsHub.exportBundle(label, { catalog, installed });
}

export function importEffectiveSkillHubManifest(
  services: AppServices,
  sourcePath: string,
) {
  return services.skillsHub.importManifest(sourcePath);
}
