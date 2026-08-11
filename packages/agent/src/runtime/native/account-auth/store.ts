import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  type AccountCredentialRecord,
  loadAccount,
  saveAccount,
} from "@elizaos/agent/auth/account-storage";
import { saveCredentials } from "@elizaos/agent/auth/credentials";
import type {
  AccountCredentialProvider,
  OAuthCredentials,
} from "@elizaos/agent/auth/types";
import { resolveCloudApiBaseUrl } from "@/runtime/linked-provider-accounts/cloud-url";
import { hasTokenCredentials } from "./credentials";
import { readJson, writeJson } from "./shared";
import type {
  LinkedClaudeCodeCredentials,
  LinkedCodexCredentials,
  LinkedDevinCredentials,
  LinkedElizaCloudCredentials,
  LinkedProviderName,
  ProviderAuthStoreShape,
} from "./types";

const PROVIDER_AUTH_STORE_VERSION = 1 as const;

export const DOOLITTLE_LINKED_ACCOUNT_IDS = {
  codex: "doolittle-legacy-codex",
  "claude-code": "doolittle-legacy-claude-code",
} as const;

const OFFICIAL_PROVIDER_IDS = {
  codex: "openai-codex",
  "claude-code": "anthropic-subscription",
} as const satisfies Record<"codex" | "claude-code", AccountCredentialProvider>;

type OfficialLinkedProvider = keyof typeof OFFICIAL_PROVIDER_IDS;

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
  const providers =
    payload && typeof payload === "object" && "providers" in payload
      ? (payload as { providers?: unknown }).providers
      : undefined;
  if (providers && typeof providers === "object" && !Array.isArray(providers)) {
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

function withOfficialAuthHome<T>(operation: () => T): T {
  if (process.env.ELIZA_HOME?.trim()) return operation();
  const previous = process.env.ELIZA_HOME;
  process.env.ELIZA_HOME = dirname(dirname(getProviderAuthStorePath()));
  try {
    return operation();
  } finally {
    if (previous === undefined) delete process.env.ELIZA_HOME;
    else process.env.ELIZA_HOME = previous;
  }
}

function linkedProviderRecord(
  provider: OfficialLinkedProvider,
): AccountCredentialRecord | null {
  return withOfficialAuthHome(() =>
    loadAccount(
      OFFICIAL_PROVIDER_IDS[provider],
      DOOLITTLE_LINKED_ACCOUNT_IDS[provider],
    ),
  );
}

function codexExpiry(credentials: LinkedCodexCredentials): number {
  const token = credentials.accessToken;
  if (token) {
    const payload = token.split(".")[1];
    if (payload) {
      try {
        const decoded = JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as { exp?: unknown };
        if (typeof decoded.exp === "number" && Number.isFinite(decoded.exp)) {
          return decoded.exp * 1000;
        }
      } catch {
        // Non-JWT access tokens are valid inputs; expiry then follows refreshability.
      }
    }
  }
  return credentials.refreshToken ? 0 : Number.MAX_SAFE_INTEGER;
}

function claudeExpiry(credentials: LinkedClaudeCodeCredentials): number {
  const value = credentials.expiresAt?.trim();
  if (value) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
    const parsed = /^\d{4}-\d{2}-\d{2}T/.test(value)
      ? Date.parse(value)
      : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return credentials.refreshToken ? 0 : Number.MAX_SAFE_INTEGER;
}

function officialCredentials(
  provider: OfficialLinkedProvider,
  credentials: LinkedCodexCredentials | LinkedClaudeCodeCredentials,
): OAuthCredentials {
  return {
    access: credentials.accessToken ?? "",
    refresh: credentials.refreshToken ?? "",
    expires:
      provider === "codex"
        ? codexExpiry(credentials as LinkedCodexCredentials)
        : claudeExpiry(credentials as LinkedClaudeCodeCredentials),
    ...(provider === "codex" && (credentials as LinkedCodexCredentials).idToken
      ? { idToken: (credentials as LinkedCodexCredentials).idToken }
      : {}),
  };
}

function officialRecordMatches(
  record: AccountCredentialRecord | null,
  credentials: OAuthCredentials,
): record is AccountCredentialRecord {
  return Boolean(
    record &&
      record.credentials.access === credentials.access &&
      record.credentials.refresh === credentials.refresh &&
      record.credentials.expires === credentials.expires &&
      (credentials.idToken === undefined ||
        record.credentials.idToken === credentials.idToken),
  );
}

function removeLegacyProviderRecord(provider: OfficialLinkedProvider): void {
  const store = readProviderAuthStore();
  if (!(provider in store.providers)) return;
  delete store.providers[provider];
  writeProviderAuthStore(store);
}

function saveOfficialProviderCredentials(
  provider: OfficialLinkedProvider,
  credentials: LinkedCodexCredentials | LinkedClaudeCodeCredentials,
): AccountCredentialRecord {
  const providerId = OFFICIAL_PROVIDER_IDS[provider];
  const accountId = DOOLITTLE_LINKED_ACCOUNT_IDS[provider];
  const official = officialCredentials(provider, credentials);
  return withOfficialAuthHome(() => {
    saveCredentials(providerId, official, accountId);
    const saved = loadAccount(providerId, accountId);
    if (!officialRecordMatches(saved, official)) {
      throw new Error(
        `Official ${provider} credentials failed write/read-back verification`,
      );
    }

    const discoveredLabel =
      provider === "claude-code"
        ? (credentials as LinkedClaudeCodeCredentials).accountLabel?.trim()
        : "Codex on this Mac";
    const label =
      discoveredLabel &&
      (provider === "claude-code" || saved.label === saved.id)
        ? discoveredLabel
        : undefined;
    const organizationId =
      provider === "codex"
        ? (credentials as LinkedCodexCredentials).accountId?.trim()
        : undefined;
    if (
      (label && saved.label !== label) ||
      (organizationId && saved.organizationId !== organizationId)
    ) {
      saveAccount({
        ...saved,
        ...(label ? { label } : {}),
        ...(organizationId ? { organizationId } : {}),
      });
    }

    const verified = loadAccount(providerId, accountId);
    if (
      !officialRecordMatches(verified, official) ||
      (label && verified.label !== label) ||
      (organizationId && verified.organizationId !== organizationId)
    ) {
      throw new Error(
        `Official ${provider} account metadata failed write/read-back verification`,
      );
    }
    return verified;
  });
}

function legacyProviderCredentials(
  provider: OfficialLinkedProvider,
): LinkedCodexCredentials | LinkedClaudeCodeCredentials | undefined {
  const record = readProviderAuthStore().providers[provider];
  return record && hasTokenCredentials(record) ? record : undefined;
}

function ensureOfficialProviderRecord(
  provider: OfficialLinkedProvider,
): AccountCredentialRecord | null {
  let existing: AccountCredentialRecord | null;
  try {
    existing = linkedProviderRecord(provider);
  } catch {
    return null;
  }
  const legacy = legacyProviderCredentials(provider);
  if (!legacy) return existing;

  try {
    if (existing) {
      // Re-write and verify the official value itself before deleting a stale
      // legacy source. Legacy data never replaces an existing official account.
      const verified = withOfficialAuthHome(() => {
        saveAccount(existing);
        const readBack = loadAccount(existing.providerId, existing.id);
        if (
          !readBack ||
          readBack.credentials.access !== existing.credentials.access ||
          readBack.credentials.refresh !== existing.credentials.refresh ||
          readBack.credentials.expires !== existing.credentials.expires ||
          readBack.credentials.idToken !== existing.credentials.idToken
        ) {
          throw new Error(
            `Official ${provider} account failed write/read-back verification`,
          );
        }
        return readBack;
      });
      removeLegacyProviderRecord(provider);
      return verified;
    }

    const migrated = saveOfficialProviderCredentials(provider, legacy);
    removeLegacyProviderRecord(provider);
    return migrated;
  } catch {
    // The legacy key remains available for a later retry, but is never returned
    // as the canonical credential value after an official write fails.
    return existing;
  }
}

function officialCodexCredentials(
  record: AccountCredentialRecord,
): LinkedCodexCredentials {
  return {
    ...(record.credentials.access
      ? { accessToken: record.credentials.access }
      : {}),
    ...(record.credentials.refresh
      ? { refreshToken: record.credentials.refresh }
      : {}),
    ...(record.credentials.idToken
      ? { idToken: record.credentials.idToken }
      : {}),
    ...(record.organizationId ? { accountId: record.organizationId } : {}),
    authMode: "chatgpt",
    lastRefresh: new Date(record.updatedAt).toISOString(),
    source: `@elizaos/agent/auth/${record.providerId}/${record.id}`,
  };
}

function officialClaudeCredentials(
  record: AccountCredentialRecord,
): LinkedClaudeCodeCredentials {
  return {
    ...(record.credentials.access
      ? { accessToken: record.credentials.access }
      : {}),
    ...(record.credentials.refresh
      ? { refreshToken: record.credentials.refresh }
      : {}),
    expiresAt: String(record.credentials.expires),
    ...(record.label !== record.id ? { accountLabel: record.label } : {}),
    authMode: "oauth",
    source: `@elizaos/agent/auth/${record.providerId}/${record.id}`,
  };
}

export function persistProviderCredentials(
  provider: LinkedProviderName,
  credentials:
    | LinkedCodexCredentials
    | LinkedClaudeCodeCredentials
    | LinkedDevinCredentials
    | LinkedElizaCloudCredentials
    | undefined,
): void {
  if (!credentials) {
    return;
  }
  if (provider === "codex" || provider === "claude-code") {
    if (!hasTokenCredentials(credentials)) return;
    saveOfficialProviderCredentials(provider, credentials);
    removeLegacyProviderRecord(provider);
    return;
  }
  if (
    typeof (credentials as LinkedElizaCloudCredentials).apiKey !== "undefined"
  ) {
    if (!(credentials as LinkedElizaCloudCredentials).apiKey) {
      return;
    }
  } else if (
    provider === "devin" &&
    !(credentials as LinkedDevinCredentials).command
  ) {
    return;
  } else if (
    provider !== "devin" &&
    !hasTokenCredentials(
      credentials as LinkedCodexCredentials | LinkedClaudeCodeCredentials,
    )
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

export function getStoredCodexCredentials():
  | LinkedCodexCredentials
  | undefined {
  const record = ensureOfficialProviderRecord("codex");
  return record ? officialCodexCredentials(record) : undefined;
}

export function getStoredClaudeCodeCredentials():
  | LinkedClaudeCodeCredentials
  | undefined {
  const record = ensureOfficialProviderRecord("claude-code");
  return record ? officialClaudeCredentials(record) : undefined;
}
