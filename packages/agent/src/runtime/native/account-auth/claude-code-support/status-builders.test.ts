import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

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
  mock.module("../credentials", () => ({
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
  mock.module("./cli", () => ({
    getClaudeCodeCliAuthStatus: () => cliStatus,
  }));
  mock.module("./files", () => ({
    getClaudeCodeCredentialsPath: () => `${homePath}/.claude/.credentials.json`,
    getClaudeCodeProfileLabel: () => undefined,
    readClaudeCodeFileCredentials: () => fileCredential,
    resolveClaudeCodeEnvCredentials: () => envCredential,
  }));
}

async function loadStatusBuildersModule() {
  return import(`./status-builders?test=${Date.now()}-${Math.random()}`);
}

beforeEach(() => {
  storedCredential = undefined;
  fileCredential = undefined;
  envCredential = undefined;
  homePath = "/tmp";
  cliStatus = { available: false, loggedIn: false };
  mock.restore();
  mock.clearAllMocks();
  installStatusBuilderMocks();
});

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

describe("claude-code status builders", () => {
  it("prefers reusable stored credentials for Claude Code status", async () => {
    storedCredential = {
      accessToken: "stored-access",
      refreshToken: "stored-refresh",
      expiresAt: "1763579600000",
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
      fallbackReady: true,
      source: "eliza-auth-store",
      authMode: "oauth",
      lastRefresh: "1763579600000",
      accountLabel: "Stored User",
      loginCommand: "claude auth login",
      setupCommand: "claude setup-token",
      detail:
        "Eliza-managed Claude Code credentials are available in the local provider auth store.",
    });
  });

  it("builds file-backed reusable status when no stored credentials exist", async () => {
    fileCredential = {
      accessToken: "file-access",
      refreshToken: "file-refresh",
      expiresAt: "1763579600000",
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
