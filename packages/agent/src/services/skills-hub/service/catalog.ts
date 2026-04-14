import {
  loadSkillHubCatalogEntry,
  loadSkillHubCatalogRecords,
} from "../catalog-sync";
import type { SkillHubCatalogRecord, SkillHubWorkspaceRecord } from "../types";
import type { SkillHubServiceContext } from "./context";

export async function loadCatalogRecords(
  context: Pick<SkillHubServiceContext, "agentSdk" | "paths"> & {
    workspace: SkillHubWorkspaceRecord[];
    force: boolean;
    limit: number;
  },
): Promise<SkillHubCatalogRecord[]> {
  return loadSkillHubCatalogRecords({
    agentSdk: context.agentSdk,
    workspace: context.workspace,
    manifestsDir: context.paths.manifestsDir,
    catalogIndexPath: context.paths.catalogIndexPath,
    force: context.force,
    limit: context.limit,
  });
}

export async function loadCatalogEntry(
  context: Pick<SkillHubServiceContext, "agentSdk" | "paths"> & {
    slug: string;
    workspace: SkillHubWorkspaceRecord[];
  },
): Promise<SkillHubCatalogRecord | undefined> {
  return loadSkillHubCatalogEntry({
    agentSdk: context.agentSdk,
    slug: context.slug,
    workspace: context.workspace,
    manifestsDir: context.paths.manifestsDir,
  });
}

export function searchCatalog(
  context: Pick<SkillHubServiceContext, "agentSdk">,
  query: string,
  limit: number,
) {
  return context.agentSdk.searchSkillCatalog(query, limit);
}
