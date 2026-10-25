import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Source modules and bundled CLI entries have different depths in the monorepo. */
export function resolveApplicationRoot(moduleUrl: string): string {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const path = resolve(directory, "package.json");
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, "utf8")) as {
        name?: string;
        workspaces?: unknown;
      };
      if (manifest.name === "doolittle" && Array.isArray(manifest.workspaces))
        return directory;
    }
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error(
        "Could not locate the Doolittle application root. Set DOOLITTLE_REPO_ROOT for a packaged runtime.",
      );
    directory = parent;
  }
}

let sourceRoot: string | undefined;
export function getDefaultRepoRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredRoot = env.DOOLITTLE_REPO_ROOT?.trim();
  if (configuredRoot) return resolve(configuredRoot);
  sourceRoot ??= resolveApplicationRoot(import.meta.url);
  return sourceRoot;
}

export function resolveFromRepoRoot(repoRoot: string, value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}
