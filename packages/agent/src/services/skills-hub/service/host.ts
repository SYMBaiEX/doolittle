import type { SkillsHubManifestHost } from "../manifests";
import {
  categoryFromSkillHubSlug,
  countSkillHubLines,
  hashSkillHubContent,
  normalizeSkillHubSlug,
  nowIso,
  rootFromSkillHubSlug,
  tagsFromSkillHubCatalog,
  tagsFromSkillHubText,
} from "../records";
import type { SkillHubServicePaths } from "./paths";

export function createSkillHubManifestHost(
  paths: SkillHubServicePaths,
): SkillsHubManifestHost {
  return {
    manifestsDir: paths.manifestsDir,
    importsDir: paths.importsDir,
    installedIndexPath: paths.installedIndexPath,
    nowIso,
    normalizeSlug: normalizeSkillHubSlug,
    rootFromSlug: rootFromSkillHubSlug,
    categoryFromSlug: categoryFromSkillHubSlug,
    countLines: countSkillHubLines,
    hashContent: hashSkillHubContent,
    tagsFromText: tagsFromSkillHubText,
    tagsFromCatalog: tagsFromSkillHubCatalog,
  };
}
