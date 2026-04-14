import type {
  SkillHubCatalogRecord,
  SkillHubInstalledRecord,
  SkillHubManifest,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "../types";
import {
  primeCatalogCache,
  rememberSyncReport,
  resetCatalogCache,
} from "./cache";
import { loadCatalogEntry, loadCatalogRecords } from "./catalog";
import type { SkillHubServiceContext } from "./context";
import type { SkillHubServiceCache } from "./state";
import { syncCatalogArtifacts } from "./sync";

export async function loadServiceCatalog(input: {
  cache: SkillHubServiceCache;
  context: Pick<SkillHubServiceContext, "agentSdk" | "paths">;
  workspace: SkillHubWorkspaceRecord[];
  force: boolean;
  limit: number;
}): Promise<SkillHubCatalogRecord[]> {
  if (input.force) {
    resetCatalogCache(input.cache);
  } else if (input.cache.catalog) {
    return input.cache.catalog.slice(0, input.limit);
  }

  const catalog = await loadCatalogRecords({
    agentSdk: input.context.agentSdk,
    paths: input.context.paths,
    workspace: input.workspace,
    force: input.force,
    limit: input.limit,
  });

  return primeCatalogCache(input.cache, catalog).slice(0, input.limit);
}

export function loadServiceCatalogEntry(input: {
  context: Pick<SkillHubServiceContext, "agentSdk" | "paths">;
  slug: string;
  workspace: SkillHubWorkspaceRecord[];
}): Promise<SkillHubCatalogRecord | undefined> {
  return loadCatalogEntry({
    agentSdk: input.context.agentSdk,
    paths: input.context.paths,
    slug: input.slug,
    workspace: input.workspace,
  });
}

export async function syncServiceCatalog(input: {
  cache: SkillHubServiceCache;
  context: Pick<SkillHubServiceContext, "paths">;
  workspace: SkillHubWorkspaceRecord[];
  catalog: SkillHubCatalogRecord[];
  installed: SkillHubInstalledRecord[];
  exportManifest(slug: string): SkillHubManifest;
}): Promise<SkillHubSyncReport> {
  const report = await syncCatalogArtifacts({
    workspace: input.workspace,
    catalog: input.catalog,
    installed: input.installed,
    manifestsDir: input.context.paths.manifestsDir,
    syncDir: input.context.paths.hubDir,
    exportManifest: input.exportManifest,
  });

  return rememberSyncReport(input.cache, report);
}
