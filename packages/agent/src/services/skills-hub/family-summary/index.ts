import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";
import { buildSkillHubFamilies as buildFamilies } from "./families";
import { buildSkillHubSummary as buildSummary } from "./summary";
import type { InstalledSkillHubRecord } from "./types";

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
