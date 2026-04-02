export interface ElizaCloudStatus {
  provider: "elizacloud";
  available: boolean;
  reusable: boolean;
  nativeReady?: boolean;
  source?: string;
  authMode?: string;
  detail: string;
}

export interface ElizaCloudPluginOptions {
  enabled?: boolean;
  enableEmbeddings?: boolean;
  getStatus: () => ElizaCloudStatus;
  getCredentials?: () =>
    | {
        apiKey?: string;
        source?: string;
        authMode?: string;
      }
    | undefined;
}
