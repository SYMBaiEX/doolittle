import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { nowIso, toSkillHubBundleSlug } from "./records";
import type {
  SkillHubCatalogRecord,
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "./types";

export interface SkillHubBundleSummary {
  bundlePath: string;
  manifestCount: number;
  workspaceCount: number;
  catalogCount: number;
  installedCount: number;
  sync: SkillHubSyncReport;
}

export function buildSkillHubDistributionArtifacts(input: {
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: SkillHubInstalledRecord[];
  manifestsDir: string;
  exportManifest(slug: string): SkillHubManifest;
}): {
  report: SkillHubSyncReport;
  exportedManifests: SkillHubManifest[];
} {
  const { workspace, catalog, installed, manifestsDir, exportManifest } = input;
  const workspaceSlugs = new Set(workspace.map((entry) => entry.slug));
  const catalogSlugs = new Set(catalog.map((entry) => entry.slug));
  const shared = [...workspaceSlugs].filter((slug) => catalogSlugs.has(slug));
  const localOnly = [...workspaceSlugs].filter(
    (slug) => !catalogSlugs.has(slug),
  );
  const catalogOnly = [...catalogSlugs].filter(
    (slug) => !workspaceSlugs.has(slug),
  );
  const exportedManifests = workspace.map((entry) =>
    exportManifest(entry.slug),
  );
  const report: SkillHubSyncReport = {
    refreshedAt: nowIso(),
    workspaceTotal: workspace.length,
    generatedTotal: workspace.filter((entry) => entry.source === "generated")
      .length,
    catalogTotal: catalog.length,
    installedTotal: installed.length,
    shared,
    localOnly,
    catalogOnly,
    installable: workspace.filter((entry) => entry.installable).length,
    exportedManifests: exportedManifests.length,
    manifestsDir,
    summary: `workspace=${workspace.length} catalog=${catalog.length} shared=${shared.length} localOnly=${localOnly.length} catalogOnly=${catalogOnly.length}`,
  };
  return { report, exportedManifests };
}

export function writeSkillHubDistributionSnapshot(
  hubDir: string,
  report: SkillHubSyncReport,
  manifests: SkillHubManifest[],
): void {
  writeJsonAtomicSync(join(hubDir, "projection-latest.json"), report);
  writeJsonAtomicSync(join(hubDir, "index.json"), {
    generatedAt: report.refreshedAt,
    report,
    manifests,
  });
}

export function writeSkillHubBundle(input: {
  exportsDir: string;
  label: string;
  workspace: SkillHubWorkspaceRecord[];
  installed: SkillHubInstalledRecord[];
  sync: SkillHubSyncReport;
  exportManifest(slug: string): SkillHubManifest;
}): SkillHubBundleSummary {
  const { exportsDir, label, workspace, installed, sync, exportManifest } =
    input;
  const bundlePath = join(
    exportsDir,
    `${toSkillHubBundleSlug(label)}-bundle.json`,
  );
  const manifests = workspace.map((entry) => exportManifest(entry.slug));
  const bundle = {
    label,
    createdAt: nowIso(),
    manifests,
    installed,
    sync,
  };
  writeJsonAtomicSync(bundlePath, bundle);
  return {
    bundlePath,
    manifestCount: manifests.length + installed.length,
    workspaceCount: workspace.length,
    catalogCount: sync.catalogTotal,
    installedCount: installed.length,
    sync,
  };
}
