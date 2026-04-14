import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentSdkService } from "../agent-sdk-service";
import {
  buildSkillHubCatalogManifest,
  type SkillsHubManifestHost,
  writeSkillHubManifest,
} from "./manifests";
import {
  buildSkillHubCatalogRecord,
  buildSkillHubCatalogRecords,
  nowIso,
  toSkillHubBundleSlug,
} from "./records";
import type {
  SkillHubCatalogRecord,
  SkillHubImportResult,
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

export function writeSkillHubCatalogSnapshot(
  catalogIndexPath: string,
  catalog: SkillHubCatalogRecord[],
): void {
  writeFileSync(
    catalogIndexPath,
    JSON.stringify(
      {
        generatedAt: nowIso(),
        catalog,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function loadSkillHubCatalogRecords(input: {
  agentSdk: AgentSdkService;
  workspace: SkillHubWorkspaceRecord[];
  manifestsDir: string;
  catalogIndexPath: string;
  force: boolean;
  limit: number;
}): Promise<SkillHubCatalogRecord[]> {
  const catalog = await input.agentSdk.catalog(input.force, input.limit);
  const records = buildSkillHubCatalogRecords(
    catalog,
    input.workspace,
    input.manifestsDir,
  );
  writeSkillHubCatalogSnapshot(input.catalogIndexPath, records);
  return records;
}

export async function loadSkillHubCatalogEntry(input: {
  agentSdk: AgentSdkService;
  slug: string;
  workspace: SkillHubWorkspaceRecord[];
  manifestsDir: string;
}): Promise<SkillHubCatalogRecord | undefined> {
  const entry = await input.agentSdk.catalogSkill(input.slug);
  if (!entry) {
    return undefined;
  }
  return buildSkillHubCatalogRecord(entry, input.workspace, input.manifestsDir);
}

export function buildSkillHubSyncArtifacts(input: {
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

export function writeSkillHubSyncSnapshot(
  hubDir: string,
  report: SkillHubSyncReport,
  manifests: SkillHubManifest[],
): void {
  writeFileSync(
    join(hubDir, "sync-latest.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  writeFileSync(
    join(hubDir, "index.json"),
    JSON.stringify(
      {
        generatedAt: report.refreshedAt,
        report,
        manifests,
      },
      null,
      2,
    ),
    "utf8",
  );
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
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
  return {
    bundlePath,
    manifestCount: manifests.length + installed.length,
    workspaceCount: workspace.length,
    catalogCount: sync.catalogTotal,
    installedCount: installed.length,
    sync,
  };
}

export async function installSkillHubCatalogManifest(input: {
  agentSdk: AgentSdkService;
  manifestHost: SkillsHubManifestHost;
  manifestsDir: string;
  slug: string;
  importManifest: (sourcePath: string) => SkillHubImportResult;
}): Promise<SkillHubImportResult> {
  const entry = await input.agentSdk.catalogSkill(input.slug);
  if (!entry) {
    throw new Error(`Skill catalog entry not found: ${input.slug}`);
  }
  const manifest = buildSkillHubCatalogManifest(
    input.manifestHost,
    input.slug,
    entry,
  );
  const sourcePath = join(input.manifestsDir, `${manifest.slug}.json`);
  writeSkillHubManifest(sourcePath, manifest);
  return input.importManifest(sourcePath);
}
