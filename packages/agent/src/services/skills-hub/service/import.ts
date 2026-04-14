import { importSkillHubManifest } from "../manifests";
import type { SkillHubImportResult } from "../types";
import type { SkillHubServiceContext } from "./context";

export function importManifest(
  context: Pick<SkillHubServiceContext, "manifestHost">,
  sourcePath: string,
): SkillHubImportResult {
  return importSkillHubManifest(context.manifestHost, sourcePath);
}
