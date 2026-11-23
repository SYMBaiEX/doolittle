import { lstatSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { PluginSettings } from "./types";

export function assertNativeAcpStateDirectories(stateDir: string): void {
  for (const directory of [
    stateDir,
    join(stateDir, "workspaces"),
    join(stateDir, "native"),
    join(stateDir, "native", "git-indexes"),
    join(stateDir, "native", "sessions"),
    join(stateDir, "native", "queues"),
  ]) {
    const stats = lstatSync(directory, { throwIfNoEntry: false });
    if (stats && !stats.isDirectory()) {
      throw new Error(
        "Native ACP state requires ordinary profile directories.",
      );
    }
  }
}

export function resolveNativeAcpStateDir(
  profileDir: string,
  configured: string | undefined,
): string {
  const stateDir = resolve(profileDir, "plugin-acp");
  // The SDK reads its ambient directory ahead of the runtime setting.
  if (
    configured !== undefined &&
    (!isAbsolute(configured) || resolve(configured) !== stateDir)
  ) {
    throw new Error(
      "ELIZA_ACP_STATE_DIR must stay within the Doolittle profile.",
    );
  }
  assertNativeAcpStateDirectories(stateDir);
  return stateDir;
}

export function applyAmbientProcessSettings(
  settings: PluginSettings,
  env: NodeJS.ProcessEnv,
): void {
  settings.E2B_MODE = env.E2B_MODE ?? "local";
  settings.NODE_ENV = env.NODE_ENV ?? "development";
  // Core getSetting reads character/runtime settings, not process.env. In
  // particular the SDK audit writer only consults this setting surface.
  if (env.ACP_AUDIT_LOG_PATH?.trim()) {
    settings.ACP_AUDIT_LOG_PATH = env.ACP_AUDIT_LOG_PATH.trim();
  }

  if (env.E2B_API_KEY) {
    settings.E2B_API_KEY = env.E2B_API_KEY;
  }

  if (env.GITHUB_TOKEN) {
    settings.GITHUB_TOKEN = env.GITHUB_TOKEN;
  }
}
