import type {
  SkillHubImportResult,
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";
import { resetFamilyCache } from "./cache";
import type { SkillHubServiceContext } from "./context";
import { importManifest as importManifestFile } from "./import";
import { installFromCatalog } from "./install";
import {
  exportManifest as buildManifestFile,
  resolveManifestInput,
  writeBundle,
} from "./manifests";
import type { SkillHubServiceCache } from "./state";

export function resolveServiceManifest(input: {
  context: Pick<SkillHubServiceContext, "manifestHost">;
  workspace: SkillHubWorkspaceRecord[];
  slug: string;
  installedLookup: (slug: string) => SkillHubManifest | undefined;
}): SkillHubManifest | undefined {
  return resolveManifestInput({
    workspace: input.workspace,
    manifestHost: input.context.manifestHost,
    slug: input.slug,
    installedLookup: input.installedLookup,
  });
}

export function exportServiceManifest(input: {
  context: Pick<SkillHubServiceContext, "manifestHost">;
  workspace: SkillHubWorkspaceRecord[];
  slug: string;
  destinationPath?: string;
}): SkillHubManifest {
  return buildManifestFile({
    workspace: input.workspace,
    manifestHost: input.context.manifestHost,
    slug: input.slug,
    destinationPath: input.destinationPath,
  });
}

export function exportServiceBundle(input: {
  context: Pick<SkillHubServiceContext, "paths">;
  label: string;
  workspace: SkillHubWorkspaceRecord[];
  installed: SkillHubInstalledRecord[];
  sync: SkillHubSyncReport;
  exportManifest(slug: string): SkillHubManifest;
}) {
  return writeBundle({
    exportsDir: input.context.paths.exportsDir,
    label: input.label,
    workspace: input.workspace,
    installed: input.installed,
    sync: input.sync,
    exportManifest: input.exportManifest,
  });
}

export function importServiceManifest(input: {
  cache: SkillHubServiceCache;
  context: Pick<SkillHubServiceContext, "manifestHost">;
  sourcePath: string;
}): SkillHubImportResult {
  const imported = importManifestFile(input.context, input.sourcePath);
  resetFamilyCache(input.cache);
  return imported;
}

export function installServiceCatalogEntry(input: {
  context: Pick<SkillHubServiceContext, "agentSdk" | "manifestHost" | "paths">;
  slug: string;
  importManifest: (sourcePath: string) => SkillHubImportResult;
}): Promise<SkillHubImportResult> {
  return installFromCatalog({
    context: input.context,
    slug: input.slug,
    importManifest: input.importManifest,
  });
}
