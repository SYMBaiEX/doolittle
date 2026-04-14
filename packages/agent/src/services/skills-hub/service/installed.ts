import {
  findInstalledSkillHubManifest,
  listInstalledSkillHubManifests,
} from "../manifests";
import { normalizeSkillHubSlug } from "../records";
import type { SkillHubInstalledRecord, SkillHubManifest } from "../types";
import type { SkillHubServiceContext } from "./context";

export function listInstalledRecords(
  context: Pick<SkillHubServiceContext, "paths">,
): SkillHubInstalledRecord[] {
  return listInstalledSkillHubManifests(context.paths.installedIndexPath);
}

export function resolveInstalledManifest(
  context: Pick<SkillHubServiceContext, "paths">,
  slug: string,
): SkillHubManifest | undefined {
  return findInstalledSkillHubManifest(
    context.paths.installedIndexPath,
    slug,
    normalizeSkillHubSlug,
  );
}
