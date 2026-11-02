import { writeFileSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/core";

export function writeMediaTextFile(path: string, contents: string): void {
  writeFileSync(path, contents, "utf8");
}

export function writeMediaManifestFile(path: string, manifest: unknown): void {
  writeJsonAtomicSync(path, manifest);
}
