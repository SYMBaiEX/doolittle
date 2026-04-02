import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  getProviderAuthStorePath,
  getStoredClaudeCodeCredentials,
  getStoredElizaCloudCredentials,
  persistProviderCredentials,
  readProviderAuthStore,
} from "./store";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.DOOLITTLE_DATA_DIR;
  delete process.env.DOOLITTLE_DATA_PATH;
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
  return dir;
}

describe("account-auth store helpers", () => {
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
      "https://www.elizacloud.ai/api/v1",
    );
    expect(raw.providers?.elizacloud?.storedAt).toBeTruthy();
    expect(readProviderAuthStore().providers.elizacloud?.apiKey).toBe(
      "cloud-test-key",
    );
    expect(getStoredElizaCloudCredentials()).toEqual({
      apiKey: "cloud-test-key",
      authMode: "api-key",
      baseUrl: "https://www.elizacloud.ai/api/v1",
      source: "eliza-auth-store",
    });
  });

  it("persists and reloads canonical Claude Code credentials", () => {
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
      source: "eliza-auth-store",
    });
  });
});
