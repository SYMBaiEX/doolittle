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
  families(force?: boolean, limit?: number): SkillHubFamilyRecord[];
  family(slug: string): SkillHubFamilyRecord | undefined;
  catalog(force?: boolean, limit?: number): Promise<SkillHubCatalogRecord[]>;
  searchCatalog(
    query: string,
    limit?: number,
  ): ReturnType<typeof import("./catalog").searchCatalog>;
  sync(force?: boolean): Promise<SkillHubSyncReport>;
  syncCatalog(force?: boolean): Promise<SkillHubSyncReport>;
  manifest(slug: string): SkillHubManifest | undefined;
  catalogEntry(slug: string): Promise<SkillHubCatalogRecord | undefined>;
  exportManifest(slug: string, destinationPath?: string): SkillHubManifest;
  exportBundle(label?: string): Promise<{
    bundlePath: string;
    manifestCount: number;
    workspaceCount: number;
    catalogCount: number;
    installedCount: number;
    sync: SkillHubSyncReport;
  }>;
  importManifest(sourcePath: string): SkillHubImportResult;
  installFromCatalog(slug: string): Promise<SkillHubImportResult>;
  installedManifests(): SkillHubInstalledRecord[];
  installedManifest(slug: string): SkillHubManifest | undefined;
  summary(force?: boolean): SkillHubSummary;
}
