import { existsSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveManagedDirectories } from "@doolittle/agent/config/env/directories";
import { parseEnv } from "@doolittle/agent/config/env/schema";
import type { BootstrapPersistencePaths } from "../persistence/types";

export function resolveBootstrapPaths(
  root: string,
  env: NodeJS.ProcessEnv,
): BootstrapPersistencePaths & { directories: string[] } {
  const directories = resolveManagedDirectories(
    root,
    parseEnv({
      DOOLITTLE_DATA_DIR: env.DOOLITTLE_DATA_DIR,
      DOOLITTLE_SKILLS_DIR: env.DOOLITTLE_SKILLS_DIR,
      DOOLITTLE_GATEWAY_DATA_DIR: env.DOOLITTLE_GATEWAY_DATA_DIR,
      DOOLITTLE_HOOKS_DIR: env.DOOLITTLE_HOOKS_DIR,
    }),
  );
  const { dataDir, gatewayDataDir, hooksDir, skillsDir } = directories;
  return {
    envPath: join(root, ".env"),
    settingsPath: join(dataDir, "settings.json"),
    gatewayPath: join(gatewayDataDir, "gateway.json"),
    onboardingPath: join(dataDir, "onboarding.json"),
    directories: [
      dataDir,
      gatewayDataDir,
      hooksDir,
      join(dataDir, "remote-artifacts"),
      join(dataDir, "trajectories"),
      join(skillsDir, ".generated"),
    ],
  };
}

export function ensureBootstrapDirectories(
  root: string,
  directories: readonly string[],
  checkOnly: boolean,
): string[] {
  return [...new Set(directories)].map((path) => {
    const label = relative(root, path) || ".";
    if (existsSync(path)) return `${label} (exists)`;
    if (checkOnly) return `${label} (missing)`;
    mkdirSync(path, { recursive: true });
    return label;
  });
}
