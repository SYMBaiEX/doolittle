import { normalizeSkillHubSlug } from "../records";
import type {
  SkillHubFamilyRecord,
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSummary,
  SkillHubWorkspaceRecord,
} from "../types";
import { rememberFamilies, resetFamilyCache } from "./cache";
import type { SkillHubServiceContext } from "./context";
import { buildFamilyRecords, buildSummary } from "./families";
import type { SkillHubServiceCache } from "./state";

export function loadServiceFamilies(input: {
  cache: SkillHubServiceCache;
  context: Pick<SkillHubServiceContext, "paths" | "skills">;
  workspace: SkillHubWorkspaceRecord[];
  installed: SkillHubInstalledRecord[];
  force: boolean;
  limit: number;
}): SkillHubFamilyRecord[] {
  if (input.force) {
    resetFamilyCache(input.cache);
  }

  const families = buildFamilyRecords({
    paths: input.context.paths,
    skillsRootDir: input.context.skills.rootDir(),
    workspace: input.workspace,
    catalog: input.cache.catalog ?? [],
    installed: input.installed,
  });

  return rememberFamilies(input.cache, families).slice(0, input.limit);
}

export function findServiceFamily(input: {
  slug: string;
  loadFamilies(): SkillHubFamilyRecord[];
}): SkillHubFamilyRecord | undefined {
  const normalized = normalizeSkillHubSlug(input.slug);
  return input
    .loadFamilies()
    .find((entry) => normalizeSkillHubSlug(entry.slug) === normalized);
}

export function buildServiceSummary(input: {
  cache: SkillHubServiceCache;
  context: Pick<SkillHubServiceContext, "paths">;
  workspace: SkillHubWorkspaceRecord[];
  installed: SkillHubInstalledRecord[];
  families: SkillHubFamilyRecord[];
  installedManifest(slug: string): SkillHubManifest | undefined;
}): SkillHubSummary {
  return buildSummary({
    workspace: input.workspace,
    catalog: input.cache.catalog ?? [],
    installed: input.installed,
    families: input.families,
    manifestsDir: input.context.paths.manifestsDir,
    lastSyncReport: input.cache.lastSyncReport,
    installedTagsBySlug: (slug) => input.installedManifest(slug)?.tags ?? [],
  });
}
