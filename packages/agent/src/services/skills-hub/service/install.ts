import { installSkillHubCatalogManifest } from "../catalog-sync";
import type { SkillHubImportResult } from "../types";
import type { SkillHubServiceContext } from "./context";

export function installFromCatalog(input: {
  context: Pick<SkillHubServiceContext, "agentSdk" | "manifestHost" | "paths">;
  slug: string;
  importManifest: (sourcePath: string) => SkillHubImportResult;
}): Promise<SkillHubImportResult> {
  return installSkillHubCatalogManifest({
    agentSdk: input.context.agentSdk,
    manifestHost: input.context.manifestHost,
    manifestsDir: input.context.paths.manifestsDir,
    slug: input.slug,
    importManifest: input.importManifest,
  });
}
