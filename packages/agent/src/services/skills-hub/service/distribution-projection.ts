import {
  buildSkillHubDistributionArtifacts,
  writeSkillHubDistributionSnapshot,
} from "../distribution-artifacts";
import type {
  SkillHubCatalogRecord,
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";

export async function writeDistributionProjection(input: {
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
  const { report, exportedManifests } = buildSkillHubDistributionArtifacts({
    workspace,
    catalog,
    installed,
    manifestsDir,
    exportManifest,
  });
  writeSkillHubDistributionSnapshot(syncDir, report, exportedManifests);
  return report;
}
