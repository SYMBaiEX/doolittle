export type LinkedProviderName = "codex" | "claude-code" | "elizacloud";

export interface LinkedProviderAccountStatus {
  provider: LinkedProviderName;
  available: boolean;
  reusable: boolean;
  nativeReady?: boolean;
  fallbackReady?: boolean;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  loginCommand?: string;
  setupCommand?: string;
  detail: string;
}

export interface LinkedProviderAccountsSnapshot {
  codex: LinkedProviderAccountStatus;
  claudeCode: LinkedProviderAccountStatus;
  elizaCloud: LinkedProviderAccountStatus;
}

export interface LinkedProviderConnectAdvice {
  provider: LinkedProviderName;
  status: LinkedProviderAccountStatus;
  ready: boolean;
  preferredAction: "use" | "refresh" | "login" | "setup-token";
  primaryCommand?: string;
  secondaryCommand?: string;
  detail: string;
}

export interface LinkedCodexCredentials {
  accessToken?: string;
  refreshToken?: string;
  authMode?: string;
  lastRefresh?: string;
  source?: string;
}

export interface LinkedClaudeCodeCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  accountLabel?: string;
  authMode?: string;
  source?: string;
}

export interface LinkedElizaCloudCredentials {
  apiKey?: string;
  source?: string;
  authMode?: string;
  baseUrl?: string;
}

export interface CliAuthStatus {
  available: boolean;
  loggedIn: boolean;
  detail?: string;
  authMethod?: string;
  source?: string;
}

export interface ProviderAuthStoreShape {
  version: 1;
  providers: Partial<{
    codex: LinkedCodexCredentials & { storedAt?: string };
    "claude-code": LinkedClaudeCodeCredentials & { storedAt?: string };
    elizacloud: LinkedElizaCloudCredentials & { storedAt?: string };
  }>;
}
