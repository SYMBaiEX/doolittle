import { writeFileSync } from "node:fs";

export function writeMediaTextFile(path: string, contents: string): void {
  writeFileSync(path, contents, "utf8");
}

export function writeMediaManifestFile(path: string, manifest: unknown): void {
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf8");
}
