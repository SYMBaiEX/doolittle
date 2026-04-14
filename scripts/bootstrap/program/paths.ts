import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BootstrapPersistencePaths } from "../persistence/types";

export interface BootstrapPaths extends BootstrapPersistencePaths {
  envExamplePath: string;
}

export function resolveBootstrapDirectories(): string[] {
  return [
    ".doolittle",
    ".doolittle/cron-output",
    ".doolittle/gateway",
    ".doolittle/hooks",
    ".doolittle/remote-artifacts",
    ".doolittle/trajectories",
    "packages/skills/generated",
    "packages/skill-packs-optional/generated",
  ];
}

export function resolveBootstrapPaths(root: string): BootstrapPaths {
  return {
    envPath: join(root, ".env"),
    envExamplePath: join(root, ".env.example"),
    settingsPath: join(root, ".doolittle", "settings.json"),
    gatewayPath: join(root, ".doolittle", "gateway", "gateway.json"),
    onboardingPath: join(root, ".doolittle", "onboarding.json"),
    nativeOnboardingPath: join(root, ".doolittle", "onboarding.state.json"),
  };
}

function ensureBootstrapDirectory(path: string, checkOnly: boolean): void {
  if (existsSync(path) || checkOnly) {
    return;
  }
  mkdirSync(path, { recursive: true });
}

export function ensureBootstrapDirectories(options: {
  root: string;
  directories: string[];
  checkOnly: boolean;
}): string[] {
  const createdDirs: string[] = [];
  for (const dir of options.directories) {
    const absolute = join(options.root, dir);
    const existed = existsSync(absolute);
    ensureBootstrapDirectory(absolute, options.checkOnly);
    if (existed) {
      createdDirs.push(`${dir} (exists)`);
    } else if (options.checkOnly) {
      createdDirs.push(`${dir} (missing)`);
    } else {
      createdDirs.push(dir);
    }
  }
  return createdDirs;
}
