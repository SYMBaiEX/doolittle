import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubImportResult,
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSummary,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";

export interface SkillsHubServiceApi {
  workspace(): SkillHubWorkspaceRecord[];
  generated(): SkillHubWorkspaceRecord[];
  project(input: {
    catalog?: SkillHubCatalogRecord[];
    installed?: SkillHubInstalledRecord[];
  }): void;
  families(force?: boolean, limit?: number): SkillHubFamilyRecord[];
  family(slug: string): SkillHubFamilyRecord | undefined;
  manifest(slug: string): SkillHubManifest | undefined;
  exportManifest(slug: string, destinationPath?: string): SkillHubManifest;
  exportBundle(
    label?: string,
    projection?: {
      catalog?: SkillHubCatalogRecord[];
      installed?: SkillHubInstalledRecord[];
    },
  ): Promise<{
    bundlePath: string;
    manifestCount: number;
    workspaceCount: number;
    catalogCount: number;
    installedCount: number;
    sync: SkillHubSyncReport;
  }>;
  importManifest(sourcePath: string): SkillHubImportResult;
  installedManifests(): SkillHubInstalledRecord[];
  installedManifest(slug: string): SkillHubManifest | undefined;
  summary(force?: boolean): SkillHubSummary;
}
