export interface ProviderSelectionState {
  provider: import("../../../types").ProviderMode;
  openaiApiKey: string;
  useLinkedCodexAuth: boolean;
  openaiModel: string;
  elizaCloudApiKey: string;
  elizaCloudEnabled: boolean;
  elizaCloudSmallModel: string;
  elizaCloudModel: string;
  elizaCloudEmbeddingModel: string;
  ollamaApiEndpoint: string;
  ollamaSmallModel: string;
  ollamaLargeModel: string;
  ollamaEmbeddingModel: string;
  anthropicApiKey: string;
  useLinkedClaudeCodeAuth: boolean;
  claudeCodeCliFallback: boolean;
  claudeCodeOauthToken: string;
  anthropicModel: string;
}
