import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { resolveCloudApiBaseUrl } from "@elizaos/agent/cloud/base-url";
import { readJson, writeJson } from "./shared";
import type {
  LinkedClaudeCodeCredentials,
  LinkedCodexCredentials,
  LinkedElizaCloudCredentials,
  LinkedProviderName,
  ProviderAuthStoreShape,
} from "./types";

const PROVIDER_AUTH_STORE_VERSION = 1 as const;

export function getProviderAuthStorePath(): string {
  const dataDir =
    process.env.DOOLITTLE_DATA_DIR?.trim() ||
    process.env.DOOLITTLE_DATA_PATH?.trim() ||
    ".doolittle";
  const root = isAbsolute(dataDir) ? dataDir : join(process.cwd(), dataDir);
  return join(root, "auth", "providers.json");
}

export function readProviderAuthStore(): ProviderAuthStoreShape {
  const path = getProviderAuthStorePath();
  const payload = existsSync(path) ? readJson(path) : undefined;
  if (
    payload &&
    typeof payload === "object" &&
    "providers" in payload &&
    typeof (payload as { providers?: unknown }).providers === "object"
  ) {
    return payload as ProviderAuthStoreShape;
  }
  return {
    version: PROVIDER_AUTH_STORE_VERSION,
    providers: {},
  };
}

function writeProviderAuthStore(store: ProviderAuthStoreShape): void {
  writeJson(getProviderAuthStorePath(), store);
}

export function persistProviderCredentials(
  provider: LinkedProviderName,
  credentials:
    | LinkedCodexCredentials
    | LinkedClaudeCodeCredentials
    | LinkedElizaCloudCredentials
    | undefined,
): void {
  if (!credentials) {
    return;
  }
  if (
    typeof (credentials as LinkedElizaCloudCredentials).apiKey !== "undefined"
  ) {
    if (!(credentials as LinkedElizaCloudCredentials).apiKey) {
      return;
    }
  } else if (
    !(credentials as LinkedCodexCredentials | LinkedClaudeCodeCredentials)
      .accessToken &&
    !(credentials as LinkedCodexCredentials | LinkedClaudeCodeCredentials)
      .refreshToken
  ) {
    return;
  }
  const store = readProviderAuthStore();
  store.providers[provider] = {
    ...credentials,
    ...((provider === "elizacloud" &&
    "baseUrl" in credentials &&
    typeof credentials.baseUrl === "string" &&
    credentials.baseUrl.trim()
      ? {
          baseUrl: resolveCloudApiBaseUrl(credentials.baseUrl),
        }
      : {}) as object),
    storedAt: new Date().toISOString(),
  } as never;
  writeProviderAuthStore(store);
}

export function getStoredElizaCloudCredentials():
  | LinkedElizaCloudCredentials
  | undefined {
  const record = readProviderAuthStore().providers.elizacloud;
  if (!record || !("apiKey" in record) || !record.apiKey) {
    return undefined;
  }
  return {
    apiKey: record.apiKey,
    authMode: record.authMode,
    baseUrl: resolveCloudApiBaseUrl(record.baseUrl),
    source: "eliza-auth-store",
  };
}

export function getStoredClaudeCodeCredentials():
  | LinkedClaudeCodeCredentials
  | undefined {
  const record = readProviderAuthStore().providers["claude-code"];
  if (!record?.accessToken && !record?.refreshToken) {
    return undefined;
  }
  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt: record.expiresAt,
    accountLabel: record.accountLabel,
    authMode: record.authMode,
    source: "eliza-auth-store",
  };
}
