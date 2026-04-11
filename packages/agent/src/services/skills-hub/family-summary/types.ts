import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubWorkspaceRecord,
} from "../types";

export interface InstalledSkillHubRecord {
  slug: string;
  title: string;
  source: string;
  root: string;
  category: string;
}

export interface CuratedFamilyDefinition {
  slug: string;
  path: string;
  title: string;
  description: string;
}

export interface SkillHubFamilyInput {
  familyIndexPath: string;
  familyReadmePath: string;
  skillsRootDir: string;
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: InstalledSkillHubRecord[];
}

export interface SkillHubSummaryInput {
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: InstalledSkillHubRecord[];
  families: SkillHubFamilyRecord[];
  manifestsDir: string;
  lastSyncReport?: {
    catalogTotal: number;
    exportedManifests: number;
  };
  installedTagsBySlug: (slug: string) => string[];
}
