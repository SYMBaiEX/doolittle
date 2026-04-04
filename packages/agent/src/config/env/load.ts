import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

export interface LoadProcessEnvDependencies {
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  load?: typeof loadEnv;
}

export function resolveRepoEnvPath(repoRoot: string): string {
  return resolve(repoRoot, ".env");
}

export function loadProcessEnv(
  repoRoot: string,
  dependencies: LoadProcessEnvDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const pathExists = dependencies.exists ?? existsSync;
  const load = dependencies.load ?? loadEnv;
  const repoEnvPath = resolveRepoEnvPath(repoRoot);

  env.DOTENV_CONFIG_QUIET ??= "true";

  if (pathExists(repoEnvPath)) {
    return load({ path: repoEnvPath, override: true, quiet: true });
  }

  return load({ override: true, quiet: true });
}
