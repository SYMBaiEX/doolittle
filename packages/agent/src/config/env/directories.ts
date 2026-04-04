import { mkdirSync } from "node:fs";
import { resolveFromRepoRoot } from "./paths";

export interface ManagedDirectoryInputs {
  DOOLITTLE_DATA_DIR: string;
  DOOLITTLE_SKILLS_DIR: string;
  DOOLITTLE_CRON_OUTPUT_DIR: string;
  DOOLITTLE_GATEWAY_DATA_DIR: string;
  DOOLITTLE_HOOKS_DIR: string;
  DOOLITTLE_WORKSPACE_DIR: string;
}

export interface ManagedDirectories {
  dataDir: string;
  skillsDir: string;
  cronOutputDir: string;
  gatewayDataDir: string;
  hooksDir: string;
  workspaceDir: string;
}

const PREPARED_DIRECTORY_KEYS = [
  "dataDir",
  "skillsDir",
  "cronOutputDir",
  "gatewayDataDir",
  "hooksDir",
] as const satisfies readonly (keyof ManagedDirectories)[];

export function resolveManagedDirectories(
  repoRoot: string,
  values: ManagedDirectoryInputs,
): ManagedDirectories {
  return {
    dataDir: resolveFromRepoRoot(repoRoot, values.DOOLITTLE_DATA_DIR),
    skillsDir: resolveFromRepoRoot(repoRoot, values.DOOLITTLE_SKILLS_DIR),
    cronOutputDir: resolveFromRepoRoot(
      repoRoot,
      values.DOOLITTLE_CRON_OUTPUT_DIR,
    ),
    gatewayDataDir: resolveFromRepoRoot(
      repoRoot,
      values.DOOLITTLE_GATEWAY_DATA_DIR,
    ),
    hooksDir: resolveFromRepoRoot(repoRoot, values.DOOLITTLE_HOOKS_DIR),
    workspaceDir: resolveFromRepoRoot(repoRoot, values.DOOLITTLE_WORKSPACE_DIR),
  };
}

export function prepareManagedDirectories(
  directories: ManagedDirectories,
): ManagedDirectories {
  for (const key of PREPARED_DIRECTORY_KEYS) {
    mkdirSync(directories[key], { recursive: true });
  }

  return directories;
}
