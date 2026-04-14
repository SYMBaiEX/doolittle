import {
  buildSkillHubSyncArtifacts,
  writeSkillHubSyncSnapshot,
} from "../catalog-sync";
import type {
  SkillHubCatalogRecord,
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";

export async function syncCatalogArtifacts(input: {
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: SkillHubInstalledRecord[];
  manifestsDir: string;
  syncDir: string;
  exportManifest(slug: string): SkillHubManifest;
}): Promise<SkillHubSyncReport> {
  const {
    workspace,
    catalog,
    installed,
    manifestsDir,
    syncDir,
    exportManifest,
  } = input;
  const { report, exportedManifests } = buildSkillHubSyncArtifacts({
    workspace,
    catalog,
    installed,
    manifestsDir,
    exportManifest,
  });
  writeSkillHubSyncSnapshot(syncDir, report, exportedManifests);
  return report;
}
