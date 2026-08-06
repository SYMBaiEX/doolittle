import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import type { SkillHubManifest } from "../types";

export * from "./builders";
export * from "./imports";
export * from "./installed";
export * from "./types";

export function writeSkillHubManifest(
  manifestPath: string,
  manifest: SkillHubManifest,
): SkillHubManifest {
  writeJsonAtomicSync(manifestPath, manifest);
  return {
    ...manifest,
    path: manifestPath,
  };
}
