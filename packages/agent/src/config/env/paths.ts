import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function getDefaultRepoRoot(): string {
  return fileURLToPath(new URL("../../../../../", import.meta.url));
}

export function resolveFromRepoRoot(repoRoot: string, value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}
