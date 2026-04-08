import { buildSkillHubFamilies as buildFamilies } from "./family-summary/families";
import { buildSkillHubSummary as buildSummary } from "./family-summary/summary";
import type { InstalledSkillHubRecord } from "./family-summary/types";
import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "./types";

export function buildSkillHubFamilies(input: {
  familyIndexPath: string;
  familyReadmePath: string;
  skillsRootDir: string;
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: InstalledSkillHubRecord[];
}): SkillHubFamilyRecord[] {
  return buildFamilies(input);
}

export function buildSkillHubSummary(input: {
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: InstalledSkillHubRecord[];
  families: SkillHubFamilyRecord[];
  manifestsDir: string;
  lastSyncReport?: Pick<
    SkillHubSyncReport,
    "catalogTotal" | "exportedManifests"
  >;
  installedTagsBySlug: (slug: string) => string[];
}): ReturnType<typeof buildSummary> {
  return buildSummary(input);
}
