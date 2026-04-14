import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { CodexAuthDependencies } from "../codex-support";

let storedCredentials: Record<string, unknown> | undefined;
let cliStore: {
  authFilePresent: boolean;
  authPath: string;
  payload?: Record<string, unknown>;
  refreshToken?: string | undefined;
  lastRefresh?: string | undefined;
} = {
  authFilePresent: false,
  authPath: "/tmp/.codex/auth.json",
};
let cliCredentials: Record<string, unknown> | undefined;

function installCodexModuleMocks() {
  mock.module("./local", () => ({
    CODEX_LOGIN_COMMAND: "codex login",
    CODEX_OAUTH_CLIENT_ID: "app-TEST",
    CODEX_OAUTH_TOKEN_URL: "https://auth.openai.com/oauth/token",
    getCodexCliAuthStatus: () => ({
      available: true,
      loggedIn: false,
      source: "codex login status",
      detail: "logged out",
    }),
    getCodexCliCredentials: () => cliCredentials,
    readCodexCliStore: () => cliStore,
    writeRefreshedCodexCliStore: () => true,
  }));
}

async function loadCodexModule() {
  return import(`./index?test=${Date.now()}-${Math.random()}`);
}

beforeEach(() => {
  storedCredentials = undefined;
  cliStore = {
    authFilePresent: false,
    authPath: "/tmp/.codex/auth.json",
  };
  cliCredentials = undefined;
  mock.restore();
  mock.clearAllMocks();
  installCodexModuleMocks();
});

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

function buildDeps(): CodexAuthDependencies {
  return {
    getStoredCredentials: () => storedCredentials,
    persistCredentials: () => {},
    decodeJwtPayload: (token: string | undefined) =>
      token?.startsWith("valid.") ? { exp: 1 } : undefined,
    isUnixSecondsExpiring: () => false,
    defaultRefreshSkewSeconds: 120,
  } as never;
}

describe("Codex auth index helpers", () => {
  it("prefers reusable stored credentials for account status", async () => {
    storedCredentials = {
      source: "eliza-auth-store",
      authMode: "chatgpt",
      accessToken: "stored-access",
      refreshToken: "stored-refresh",
      lastRefresh: "2026-03-21T12:00:00.000Z",
    };
    const mod = await loadCodexModule();
    const status = mod.getCodexAccountStatus("/tmp/home", buildDeps());

    expect(status).toEqual({
      provider: "codex",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: "eliza-auth-store",
      authMode: "chatgpt",
      lastRefresh: "2026-03-21T12:00:00.000Z",
      loginCommand: "codex login",
      detail:
        "Eliza-managed Codex credentials are available in the local provider auth store.",
    });
  });

  it("resolves and persists CLI credentials when stored credentials are absent", async () => {
    cliStore = {
      authFilePresent: true,
      authPath: "/tmp/.codex/auth.json",
      lastRefresh: "2026-03-21T12:00:00.000Z",
    };
    cliCredentials = {
      accessToken: "cli-access",
      refreshToken: "cli-refresh",
      authMode: "chatgpt",
      lastRefresh: "2026-03-22T12:00:00.000Z",
      source: "/tmp/.codex/auth.json",
    };

    const persisted: Array<unknown> = [];
    const mod = await loadCodexModule();
    const deps = {
      ...buildDeps(),
      persistCredentials: (credentials: unknown) => {
        persisted.push(credentials);
      },
    } as never;

    const credentials = mod.getLinkedCodexCredentials("/tmp/home", deps);

    expect(credentials).toEqual(cliCredentials);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toEqual(cliCredentials);
  });

  it("computes token expiry using injected helpers", async () => {
    const mod = await loadCodexModule();
    const deps = {
      ...buildDeps(),
      decodeJwtPayload: (token: string | undefined) =>
        token === "valid.token" ? ({ exp: 10_001 } as never) : undefined,
      isUnixSecondsExpiring: (exp: number | undefined) => exp === 10_001,
    } as never;

    expect(mod.codexAccessTokenIsExpiring("valid.token", deps)).toBe(true);
    expect(mod.codexAccessTokenIsExpiring(undefined, deps)).toBe(false);
  });
});
