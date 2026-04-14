import type { EnvConfig, PluginSettings } from "./types";

export function shouldUseCloudEmbeddings(
  config: EnvConfig,
  env: NodeJS.ProcessEnv,
): boolean {
  return (
    Boolean(config.elizaCloudEmbeddingUrl?.trim()) ||
    Boolean(config.elizaCloudEmbeddingApiKey?.trim()) ||
    Boolean(config.elizaCloudEmbeddingDimensions) ||
    env.DOOLITTLE_EMBEDDING_PROVIDER?.trim().toLowerCase() === "elizacloud"
  );
}

export function applyEmbeddingSettings(
  settings: PluginSettings,
  config: EnvConfig,
  env: NodeJS.ProcessEnv,
): void {
  if (!shouldUseCloudEmbeddings(config, env)) {
    return;
  }

  if (config.elizaCloudEmbeddingUrl) {
    settings.ELIZAOS_CLOUD_EMBEDDING_URL = config.elizaCloudEmbeddingUrl;
  }
  if (config.elizaCloudEmbeddingApiKey) {
    settings.ELIZAOS_CLOUD_EMBEDDING_API_KEY = config.elizaCloudEmbeddingApiKey;
  }
  if (config.elizaCloudEmbeddingDimensions) {
    settings.ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS = String(
      config.elizaCloudEmbeddingDimensions,
    );
  }
}
