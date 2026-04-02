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

export interface CodexPluginOptions {
  enabled?: boolean;
  getStatus: () => LinkedAccountStatus;
  getCredentials?: () =>
    | {
        accessToken?: string;
        refreshToken?: string;
        authMode?: string;
        lastRefresh?: string;
        source?: string;
      }
    | undefined;
  refreshCredentials?: () => Promise<
    | {
        accessToken?: string;
        refreshToken?: string;
        authMode?: string;
        lastRefresh?: string;
        source?: string;
      }
    | undefined
  >;
}

export interface CodexLiveGenerateParams {
  prompt: string;
  maxTokens?: number;
}

export interface RuntimeModelSettings {
  provider?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}
