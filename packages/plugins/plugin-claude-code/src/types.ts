export interface LinkedAccountStatus {
  provider: string;
  available: boolean;
  reusable: boolean;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  detail: string;
}

export interface ClaudeCodePluginOptions {
  enabled?: boolean;
  allowCliFallback?: boolean;
  getStatus: () => LinkedAccountStatus;
  invokeCliPrint?: (params: {
    prompt: string;
    model: string;
    appendSystemPrompt?: string;
  }) => Promise<string>;
  getCredentials?: () =>
    | {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
        accountLabel?: string;
        source?: string;
      }
    | undefined;
  refreshCredentials?: () => Promise<
    | {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
        accountLabel?: string;
        source?: string;
      }
    | undefined
  >;
}

export interface ClaudeCodeLiveGenerateParams {
  prompt: string;
  maxTokens?: number;
}
