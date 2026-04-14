import { buildSkillHubFamilies, buildSkillHubSummary } from "../family-summary";
import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubInstalledRecord,
  SkillHubSummary,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";
import type { SkillHubServicePaths } from "./paths";

export function buildFamilyRecords(input: {
  paths: SkillHubServicePaths;
  skillsRootDir: string;
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: SkillHubInstalledRecord[];
}): SkillHubFamilyRecord[] {
  return buildSkillHubFamilies({
    familyIndexPath: input.paths.familyIndexPath,
    familyReadmePath: input.paths.familyReadmePath,
    skillsRootDir: input.skillsRootDir,
    workspace: input.workspace,
    catalog: input.catalog,
    installed: input.installed,
  });
}

export function buildSummary(input: {
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: SkillHubInstalledRecord[];
  families: SkillHubFamilyRecord[];
  manifestsDir: string;
  lastSyncReport?: Pick<
    SkillHubSyncReport,
    "catalogTotal" | "exportedManifests"
  >;
  installedTagsBySlug: (slug: string) => string[];
}): SkillHubSummary {
  return buildSkillHubSummary({
    workspace: input.workspace,
    catalog: input.catalog,
    installed: input.installed,
    families: input.families,
    manifestsDir: input.manifestsDir,
    lastSyncReport: input.lastSyncReport,
    installedTagsBySlug: input.installedTagsBySlug,
  });
}
