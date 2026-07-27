import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function getDefaultRepoRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredRoot = env.DOOLITTLE_REPO_ROOT?.trim();
  if (configuredRoot) {
    return resolve(configuredRoot);
  }
  return fileURLToPath(new URL("../../../../../", import.meta.url));
}

export function resolveFromRepoRoot(repoRoot: string, value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}
