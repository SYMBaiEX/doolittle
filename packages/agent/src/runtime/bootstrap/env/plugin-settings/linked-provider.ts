import {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
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
  const linkedCodex =
    dependencies.linkedCredentials?.codex ??
    (config.useLinkedCodexAuth && modelProvider === "codex"
      ? getLinkedCodexCredentials()
      : undefined);
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
  } else if (config.elizaCloudApiKey) {
    settings.ELIZAOS_CLOUD_API_KEY = config.elizaCloudApiKey;
  }

  if (linkedCodex?.accessToken) {
    settings.OPENAI_API_KEY = linkedCodex.accessToken;
    settings.OPENAI_BASE_URL = "https://chatgpt.com/backend-api/codex";
  } else if (config.openAiApiKey) {
    settings.OPENAI_API_KEY = config.openAiApiKey;
  }

  if (linkedClaudeCode?.accessToken) {
    settings.ANTHROPIC_API_KEY = linkedClaudeCode.accessToken;
  } else if (config.anthropicApiKey) {
    settings.ANTHROPIC_API_KEY = config.anthropicApiKey;
  }
}
