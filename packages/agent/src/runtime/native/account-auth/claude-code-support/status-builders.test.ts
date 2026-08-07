import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let storedCredential: Record<string, unknown> | undefined;
let fileCredential: Record<string, unknown> | undefined;
let envCredential:
  | {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: string;
      authMode: string;
      source: string;
      accountLabel?: string;
    }
  | undefined;
let homePath = "/tmp";
let cliStatus: {
  available: boolean;
  loggedIn: boolean;
  authMethod?: string;
  source?: string;
  detail?: string;
} = { available: false, loggedIn: false };

function installStatusBuilderMocks() {
  vi.doMock("../credentials", () => ({
    getReusableStoredTokenCredentials: (stored: unknown) =>
      stored && typeof stored === "object" && "accessToken" in stored
        ? stored
        : stored && typeof stored === "object" && "refreshToken" in stored
          ? stored
          : undefined,
    hasTokenCredentials: (credentials: unknown) =>
      Boolean(
        typeof credentials === "object" &&
          credentials &&
          ("accessToken" in credentials || "refreshToken" in credentials),
      ),
  }));
  vi.doMock("./cli", () => ({
    getClaudeCodeCliAuthStatus: () => cliStatus,
  }));
  vi.doMock("./files", () => ({
    claudeCodeAccessTokenIsExpiring: (expiresAt?: string) =>
      Number(expiresAt) <= Date.now(),
    getClaudeCodeCredentialsPath: () => `${homePath}/.claude/.credentials.json`,
    getClaudeCodeProfileLabel: () => undefined,
    readClaudeCodeFileCredentials: () => fileCredential,
    resolveClaudeCodeEnvCredentials: () => envCredential,
  }));
}

async function loadStatusBuildersModule() {
  return import("./status-builders");
}

beforeEach(() => {
  storedCredential = undefined;
  fileCredential = undefined;
  envCredential = undefined;
  homePath = "/tmp";
  cliStatus = { available: false, loggedIn: false };
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
  installStatusBuilderMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("claude-code status builders", () => {
  it("prefers reusable stored credentials for Claude Code status", async () => {
    storedCredential = {
      accessToken: "stored-access",
      refreshToken: "stored-refresh",
      expiresAt: String(Date.now() + 3_600_000),
      authMode: "oauth",
      accountLabel: "Stored User",
      source: "eliza-auth-store",
    };
    const { getClaudeCodeAccountStatus } = await loadStatusBuildersModule();
    const status = getClaudeCodeAccountStatus("/tmp/home", {
      getStoredCredentials: () => storedCredential,
      resolveHome: () => homePath,
    } as never);

    expect(status).toEqual({
      provider: "claude-code",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: "eliza-auth-store",
      authMode: "oauth",
      lastRefresh: storedCredential.expiresAt,
      accountLabel: "Stored User",
      loginCommand: "claude auth login",
      setupCommand: "claude setup-token",
      detail:
        "Eliza-managed Claude Code credentials are available in the official account record.",
    });
  });

  it("builds file-backed reusable status when no stored credentials exist", async () => {
    fileCredential = {
      accessToken: "file-access",
      refreshToken: "file-refresh",
      expiresAt: String(Date.now() + 3_600_000),
      source: "/tmp/home/.claude/.credentials.json",
    };
    const { getClaudeCodeAccountStatus } = await loadStatusBuildersModule();
    const status = getClaudeCodeAccountStatus("/tmp/home", {
      getStoredCredentials: () => undefined,
      resolveHome: () => homePath,
    } as never);

    expect(status.provider).toBe("claude-code");
    expect(status.reusable).toBe(true);
    expect(status.fallbackReady).toBe(false);
    expect(status.source).toBe("/tmp/home/.claude/.credentials.json");
    expect(status.authMode).toBe("oauth");
  });

  it("does not report an expired stored OAuth session as ready", async () => {
    storedCredential = {
      accessToken: "expired-access",
      refreshToken: "expired-refresh",
      expiresAt: String(Date.now() - 60_000),
      authMode: "oauth",
      source: "eliza-auth-store",
    };
    const { getClaudeCodeAccountStatus } = await loadStatusBuildersModule();
    const status = getClaudeCodeAccountStatus("/tmp/home", {
      getStoredCredentials: () => storedCredential,
      resolveHome: () => homePath,
    } as never);

    expect(status).toMatchObject({
      available: true,
      reusable: false,
      nativeReady: false,
      fallbackReady: false,
    });
    expect(status.detail).toContain("expired");
  });

  it("does not trust stored OAuth credentials without an expiry", async () => {
    storedCredential = {
      accessToken: "unverifiable-access",
      refreshToken: "unverifiable-refresh",
      authMode: "oauth",
      source: "eliza-auth-store",
    };
    const { getClaudeCodeAccountStatus } = await loadStatusBuildersModule();
    const status = getClaudeCodeAccountStatus("/tmp/home", {
      getStoredCredentials: () => storedCredential,
      resolveHome: () => homePath,
    } as never);

    expect(status).toMatchObject({
      reusable: false,
      nativeReady: false,
      fallbackReady: false,
    });
    expect(status.detail).toContain("cannot be verified");
  });

  it("falls back to env credentials when file credentials are unavailable", async () => {
    envCredential = {
      accessToken: "setup-token-access",
      refreshToken: "setup-token-refresh",
      authMode: "setup-token",
      source: "env:CLAUDE_CODE_SETUP_TOKEN",
    };
    const { getClaudeCodeAccountStatus } = await loadStatusBuildersModule();
    const status = getClaudeCodeAccountStatus("/tmp/home", {
      getStoredCredentials: () => undefined,
      resolveHome: () => homePath,
    } as never);

    expect(status.provider).toBe("claude-code");
    expect(status.available).toBe(true);
    expect(status.reusable).toBe(true);
    expect(status.nativeReady).toBe(true);
    expect(status.fallbackReady).toBe(false);
    expect(status.source).toBe("env:CLAUDE_CODE_SETUP_TOKEN");
    expect(status.authMode).toBe("setup-token");
    expect(status.detail).toBe(
      "A Claude Code setup token is configured for native Claude execution.",
    );
  });

  it("builds local CLI fallback status with account label and logged-in fallback", async () => {
    cliStatus = {
      available: true,
      loggedIn: true,
      authMethod: "claude.ai",
      source: "claude auth status",
    };
    const { getClaudeCodeAccountStatus } = await loadStatusBuildersModule();
    const status = getClaudeCodeAccountStatus("/tmp/home", {
      getStoredCredentials: () => undefined,
      resolveHome: () => homePath,
    } as never);

    expect(status.provider).toBe("claude-code");
    expect(status.available).toBe(true);
    expect(status.reusable).toBe(true);
    expect(status.nativeReady).toBe(false);
    expect(status.fallbackReady).toBe(true);
    expect(status.authMode).toBe("claude.ai");
    expect(status.source).toBe("claude auth status");
    expect(status.detail).toContain(
      "Doolittle can use the local Claude CLI directly",
    );
  });

  it("reports unavailable when no reusable credentials or cli artifacts exist", async () => {
    const { getClaudeCodeAccountStatus } = await loadStatusBuildersModule();
    const status = getClaudeCodeAccountStatus("/tmp/home", {
      getStoredCredentials: () => undefined,
      resolveHome: () => homePath,
    } as never);

    expect(status.provider).toBe("claude-code");
    expect(status.available).toBe(false);
    expect(status.reusable).toBe(false);
    expect(status.nativeReady).toBe(false);
    expect(status.fallbackReady).toBe(false);
    expect(status.detail).toBe(
      "No Claude Code CLI login artifacts were found on this machine.",
    );
  });
});
