import type { PluginSettings } from "./types";

export function applyAmbientProcessSettings(
  settings: PluginSettings,
  env: NodeJS.ProcessEnv,
): void {
  settings.E2B_MODE = env.E2B_MODE ?? "local";
  settings.NODE_ENV = env.NODE_ENV ?? "development";

  if (env.E2B_API_KEY) {
    settings.E2B_API_KEY = env.E2B_API_KEY;
  }

  if (env.GITHUB_TOKEN) {
    settings.GITHUB_TOKEN = env.GITHUB_TOKEN;
  }
}
