import {
  getLinkedClaudeCodeCredentials,
  getLinkedElizaCloudCredentials,
} from "@/runtime/native/account-auth";
import type {
  BuildPluginSettingsDependencies,
  EnvConfig,
  PluginSettings,
  RuntimeSettings,
} from "./types";

export function applyLinkedProviderSettings(
  settings: PluginSettings,
  config: EnvConfig,
  runtimeSettings: RuntimeSettings,
  dependencies: BuildPluginSettingsDependencies,
): void {
  const modelProvider = runtimeSettings.model.provider;
  const linkedElizaCloud =
    dependencies.linkedCredentials?.elizaCloud ??
    (modelProvider === "elizacloud"
      ? getLinkedElizaCloudCredentials()
      : undefined);
  const linkedClaudeCode =
    dependencies.linkedCredentials?.claudeCode ??
    (config.useLinkedClaudeCodeAuth && modelProvider === "claude-code"
      ? getLinkedClaudeCodeCredentials()
      : undefined);

  if (linkedElizaCloud?.apiKey) {
    settings.ELIZAOS_CLOUD_API_KEY = linkedElizaCloud.apiKey;
    settings.ELIZAOS_CLOUD_ENABLED = "true";
    settings.ELIZAOS_CLOUD_BASE_URL =
      linkedElizaCloud.baseUrl || config.elizaCloudBaseUrl;
  } else if (
    config.elizaCloudEnabled &&
    modelProvider === "elizacloud" &&
    config.elizaCloudApiKey
  ) {
    settings.ELIZAOS_CLOUD_API_KEY = config.elizaCloudApiKey;
  }

  if (modelProvider === "codex") {
    settings.CODEX_MODEL = runtimeSettings.model.model;
    settings.CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
  }

  const openAiApiKey = config.openAiApiKey || process.env.OPENAI_API_KEY;
  if (openAiApiKey) {
    settings.OPENAI_API_KEY = openAiApiKey;
  }

  if (modelProvider === "claude-code") {
    settings.ANTHROPIC_AUTH_MODE = linkedClaudeCode?.accessToken
      ? "oauth"
      : config.claudeCodeCliFallback
        ? "claude-cli"
        : "oauth";
  } else {
    const anthropicApiKey =
      config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (anthropicApiKey) settings.ANTHROPIC_API_KEY = anthropicApiKey;
  }
}
