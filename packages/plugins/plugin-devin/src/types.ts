export interface LinkedAccountStatus {
  provider: string;
  available: boolean;
  reusable: boolean;
  nativeReady?: boolean;
  fallbackReady?: boolean;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  detail: string;
}

export interface DevinCliPrintParams {
  prompt: string;
  model: string;
  command?: string;
  cwd?: string;
  timeoutMs?: number;
  permissionMode?: "auto" | "dangerous";
}

export interface DevinPluginOptions {
  enabled?: boolean;
  command?: string;
  model?: string;
  cwd?: string;
  getCwd?: () => string;
  timeoutMs?: number;
  getStatus: () => LinkedAccountStatus;
  invokeCliPrint?: (params: DevinCliPrintParams) => Promise<string>;
}

export interface DevinLiveGenerateParams {
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
