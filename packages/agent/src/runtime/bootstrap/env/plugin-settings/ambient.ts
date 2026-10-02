import type { PluginSettings } from "./types";

export function applyAmbientProcessSettings(
  settings: PluginSettings,
  env: NodeJS.ProcessEnv,
): void {
  settings.E2B_MODE = env.E2B_MODE ?? "local";
  settings.NODE_ENV = env.NODE_ENV ?? "development";
  // Core getSetting reads character/runtime settings, not process.env. In
  // particular the SDK audit writer only consults this setting surface.
  if (env.ELIZA_ACP_STATE_DIR?.trim()) {
    settings.ELIZA_ACP_STATE_DIR = env.ELIZA_ACP_STATE_DIR.trim();
  }
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
