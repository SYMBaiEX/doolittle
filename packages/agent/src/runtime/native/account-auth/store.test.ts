import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadAccount, saveAccount } from "@elizaos/agent/auth/account-storage";
import { afterEach, describe, expect, it } from "vitest";
import {
  DOOLITTLE_LINKED_ACCOUNT_IDS,
  getProviderAuthStorePath,
  getStoredClaudeCodeCredentials,
  getStoredCodexCredentials,
  getStoredElizaCloudCredentials,
  persistProviderCredentials,
  readProviderAuthStore,
} from "./store";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.DOOLITTLE_DATA_DIR;
  delete process.env.DOOLITTLE_DATA_PATH;
  delete process.env.ELIZA_HOME;
  while (tempDirs.length) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

function createDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "doolittle-account-auth-store-"));
  tempDirs.push(dir);
  process.env.ELIZA_HOME = dir;
  return dir;
}

function seedLegacyProvider(
  dataDir: string,
  provider: "codex" | "claude-code",
  credentials: Record<string, unknown>,
): void {
  const path = join(dataDir, "auth", "providers.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ version: 1, providers: { [provider]: credentials } }),
    "utf8",
  );
}

describe.sequential("account-auth store helpers", () => {
  it("uses absolute DOOLITTLE_DATA_DIR values without rebasing them onto cwd", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;

    expect(getProviderAuthStorePath()).toBe(
      join(dataDir, "auth", "providers.json"),
    );
  });

  it("persists and reloads canonical Eliza Cloud credentials", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;

    persistProviderCredentials("elizacloud", {
      apiKey: "cloud-test-key",
      authMode: "api-key",
      baseUrl: "https://elizacloud.ai/api/v1/",
      source: "env:ELIZAOS_CLOUD_API_KEY",
    });

    const path = getProviderAuthStorePath();
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      providers?: {
        elizacloud?: {
          baseUrl?: string;
          storedAt?: string;
        };
      };
    };
    expect(dirname(path)).toBe(join(dataDir, "auth"));
    expect(raw.providers?.elizacloud?.baseUrl).toBe(
      "https://elizacloud.ai/api/v1",
    );
    expect(raw.providers?.elizacloud?.storedAt).toBeTruthy();
    expect(readProviderAuthStore().providers.elizacloud?.apiKey).toBe(
      "cloud-test-key",
    );
    expect(getStoredElizaCloudCredentials()).toEqual({
      apiKey: "cloud-test-key",
      authMode: "api-key",
      baseUrl: "https://elizacloud.ai/api/v1",
      source: "eliza-auth-store",
    });
  });

  it("treats invalid provider collections as an empty legacy store", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    const path = getProviderAuthStorePath();
    mkdirSync(dirname(path), { recursive: true });

    for (const providers of [null, [], "invalid"]) {
      writeFileSync(path, JSON.stringify({ version: 1, providers }), "utf8");
      expect(readProviderAuthStore()).toEqual({ version: 1, providers: {} });
    }
  });

  it("persists Claude Code credentials directly to the official account record", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;

    persistProviderCredentials("claude-code", {
      accessToken: "claude-access-token",
      refreshToken: "claude-refresh-token",
      expiresAt: "1710000000000",
      accountLabel: "Symbiotic Operator",
      authMode: "oauth",
      source: "fixture",
    });

    expect(getStoredClaudeCodeCredentials()).toEqual({
      accessToken: "claude-access-token",
      refreshToken: "claude-refresh-token",
      expiresAt: "1710000000000",
      accountLabel: "Symbiotic Operator",
      authMode: "oauth",
      source:
        "@elizaos/agent/auth/anthropic-subscription/doolittle-legacy-claude-code",
    });
    expect(readProviderAuthStore().providers).not.toHaveProperty("claude-code");
    expect(
      loadAccount(
        "anthropic-subscription",
        DOOLITTLE_LINKED_ACCOUNT_IDS["claude-code"],
      ),
    ).toMatchObject({
      label: "Symbiotic Operator",
      credentials: {
        access: "claude-access-token",
        refresh: "claude-refresh-token",
        expires: 1710000000000,
      },
    });
  });

  it("persists Codex credentials and account metadata to the official account record", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;

    persistProviderCredentials("codex", {
      accessToken: "codex-access-token",
      refreshToken: "codex-refresh-token",
      idToken: "codex-id-token",
      accountId: "chatgpt-account-id",
      authMode: "chatgpt",
      lastRefresh: "2026-04-11T12:00:00.000Z",
      source: "fixture",
    });

    expect(getStoredCodexCredentials()).toMatchObject({
      accessToken: "codex-access-token",
      refreshToken: "codex-refresh-token",
      idToken: "codex-id-token",
      accountId: "chatgpt-account-id",
      authMode: "chatgpt",
      source: "@elizaos/agent/auth/openai-codex/doolittle-legacy-codex",
    });
    expect(readProviderAuthStore().providers).not.toHaveProperty("codex");
    expect(
      loadAccount("openai-codex", DOOLITTLE_LINKED_ACCOUNT_IDS.codex),
    ).toMatchObject({
      label: "Codex on this Mac",
      organizationId: "chatgpt-account-id",
      credentials: {
        access: "codex-access-token",
        refresh: "codex-refresh-token",
        idToken: "codex-id-token",
        expires: 0,
      },
    });
  });

  it("migrates legacy provider keys once and preserves expiry and id-token semantics", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    seedLegacyProvider(dataDir, "codex", {
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
      idToken: "legacy-id-token",
      accountId: "legacy-chatgpt-account",
      authMode: "chatgpt",
    });

    expect(getStoredCodexCredentials()).toMatchObject({
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
      idToken: "legacy-id-token",
      accountId: "legacy-chatgpt-account",
    });
    expect(readProviderAuthStore().providers).not.toHaveProperty("codex");
    const first = loadAccount(
      "openai-codex",
      DOOLITTLE_LINKED_ACCOUNT_IDS.codex,
    );
    expect(first?.credentials).toMatchObject({
      access: "legacy-access",
      refresh: "legacy-refresh",
      expires: 0,
      idToken: "legacy-id-token",
    });

    expect(getStoredCodexCredentials()?.accessToken).toBe("legacy-access");
    expect(
      loadAccount("openai-codex", DOOLITTLE_LINKED_ACCOUNT_IDS.codex)
        ?.createdAt,
    ).toBe(first?.createdAt);
  });

  it("never overwrites an existing official account with stale legacy data", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    persistProviderCredentials("codex", {
      accessToken: "official-access",
      refreshToken: "official-refresh",
      idToken: "official-id-token",
      accountId: "official-account",
    });
    seedLegacyProvider(dataDir, "codex", {
      accessToken: "stale-access",
      refreshToken: "stale-refresh",
      idToken: "stale-id-token",
      accountId: "stale-account",
    });

    expect(getStoredCodexCredentials()).toMatchObject({
      accessToken: "official-access",
      refreshToken: "official-refresh",
      idToken: "official-id-token",
      accountId: "official-account",
    });
    expect(readProviderAuthStore().providers).not.toHaveProperty("codex");
  });

  it("retains a legacy key when the official write cannot be verified", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    seedLegacyProvider(dataDir, "codex", {
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
    });
    const providerPath = join(dataDir, "auth", "openai-codex");
    writeFileSync(providerPath, "blocks the provider directory", "utf8");

    expect(getStoredCodexCredentials()).toBeUndefined();
    expect(readProviderAuthStore().providers.codex).toMatchObject({
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
    });

    rmSync(providerPath);
    expect(getStoredCodexCredentials()?.accessToken).toBe("legacy-access");
    expect(readProviderAuthStore().providers).not.toHaveProperty("codex");
  });

  it("keeps an official id-token when a refresh persistence omits a new one", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    persistProviderCredentials("codex", {
      accessToken: "first-access",
      refreshToken: "first-refresh",
      idToken: "login-id-token",
    });
    persistProviderCredentials("codex", {
      accessToken: "refreshed-access",
      refreshToken: "refreshed-refresh",
    });

    expect(getStoredCodexCredentials()).toMatchObject({
      accessToken: "refreshed-access",
      refreshToken: "refreshed-refresh",
      idToken: "login-id-token",
    });
  });

  it("does not mutate Devin records while canonicalizing OAuth providers", () => {
    const dataDir = createDataDir();
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    persistProviderCredentials("devin", {
      command: "devin",
      model: "devin-2",
      accountLabel: "Work Devin",
    });
    const before = readProviderAuthStore().providers.devin;
    saveAccount({
      id: DOOLITTLE_LINKED_ACCOUNT_IDS.codex,
      providerId: "openai-codex",
      label: "Codex",
      source: "oauth",
      credentials: {
        access: "official-access",
        refresh: "official-refresh",
        expires: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(getStoredCodexCredentials()?.accessToken).toBe("official-access");
    expect(readProviderAuthStore().providers.devin).toEqual(before);
  });
});
