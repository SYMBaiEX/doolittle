import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SkillHubManifest } from "../types";

export * from "./builders";
export * from "./imports";
export * from "./installed";
export * from "./types";

export function writeSkillHubManifest(
  manifestPath: string,
  manifest: SkillHubManifest,
): SkillHubManifest {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return {
    ...manifest,
    path: manifestPath,
  };
}
