export interface DoolittlePluginConfig {
  dataDir: string;
  workspaceDir: string;
  offlineBootstrapMode?: boolean;
  elizaCloudEmbeddingDimensions?: number;
}

export interface RuntimeModelSettings {
  provider?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
