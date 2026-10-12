import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getClaudeCodeAccountStatus,
  getLinkedClaudeCodeCredentials,
} from "./claude-code";
import type { ClaudeCodeAuthDependencies } from "./claude-code-support";
import { getClaudeCodeAuthDependencies } from "./claude-code-support";
import type { LinkedClaudeCodeCredentials } from "./types";

const nubPath = process.env.DOOLITTLE_NUB_PATH ?? "nub";
const textDecoder = new TextDecoder();
const officialClaudeSource =
  "@elizaos/agent/auth/anthropic-subscription/doolittle-legacy-claude-code";

function claudeSubprocessEnvironment(
  homePath: string,
  dataDir: string,
  inputs: { setupToken?: string; fetchPayload?: Record<string, unknown> } = {},
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  // Real SDK account writes must stay in this fixture, regardless of the
  // operator's account home, provider credentials or Node startup options.
  return {
    PATH: inherited.PATH,
    SystemRoot: inherited.SystemRoot,
    HOME: homePath,
    USERPROFILE: homePath,
    XDG_CONFIG_HOME: join(homePath, ".config"),
    XDG_STATE_HOME: join(homePath, ".local", "state"),
    CLAUDE_CONFIG_DIR: join(homePath, ".claude"),
    ELIZA_HOME: dataDir,
    ELIZA_CONFIG_PATH: join(dataDir, "eliza.json"),
    DOOLITTLE_DATA_DIR: dataDir,
    DOOLITTLE_DATA_PATH: dataDir,
    DOOLITTLE_BOT_RUNTIME: "worker",
    DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
    TEST_HOME_PATH: homePath,
    TEST_FETCH_PAYLOAD: JSON.stringify(inputs.fetchPayload ?? {}),
    CLAUDE_CODE_SETUP_TOKEN: inputs.setupToken ?? "",
  };
}

function expectPrivateClaudeAccount(dataDir: string): void {
  expect(
    existsSync(
      join(
        dataDir,
        "auth",
        "anthropic-subscription",
        "doolittle-legacy-claude-code.json",
      ),
    ),
  ).toBe(true);
}

function parseLastJsonLine<T>(output: Uint8Array): T {
  const line = textDecoder.decode(output).trim().split("\n").at(-1);
  if (!line) throw new Error("subprocess did not emit a JSON result");
  return JSON.parse(line) as T;
}

function createClaudeCodeDeps({
  homePath,
  storedCredentials,
  setupToken,
  cliAvailable = false,
  cliLoggedIn = false,
}: {
  homePath: string;
  storedCredentials?: LinkedClaudeCodeCredentials;
  setupToken?: string;
  cliAvailable?: boolean;
  cliLoggedIn?: boolean;
}): {
  deps: ClaudeCodeAuthDependencies;
  persisted: Array<LinkedClaudeCodeCredentials | undefined>;
} {
  const base = getClaudeCodeAuthDependencies();
  const persisted: Array<LinkedClaudeCodeCredentials | undefined> = [];
  let currentStored = storedCredentials;

  const deps: ClaudeCodeAuthDependencies = {
    ...base,
    resolveHome: () => homePath,
    readEnv: (name) => {
      if (name === "CLAUDE_CODE_SETUP_TOKEN") {
        return setupToken;
      }
      return base.readEnv(name);
    },
    commandExists: () => cliAvailable,
    readCommandJson: () =>
      cliAvailable
        ? {
            loggedIn: cliLoggedIn,
            authMethod: "claude.ai",
            apiProvider: "firstParty",
          }
        : undefined,
    readCommandText: () => (cliLoggedIn ? "logged in" : ""),
    getStoredCredentials: () => currentStored,
    getStoredClaudeCodeCredentials: () => currentStored,
    persistCredentials: (credentials) => {
      currentStored = credentials;
      persisted.push(credentials);
    },
    persistProviderCredentials: (credentials) => {
      currentStored = credentials;
      persisted.push(credentials);
    },
  };

  return { deps, persisted };
}

function runClaudeRefreshSubprocess({
  homePath,
  dataDir,
  fetchPayload,
  setupToken,
  storedCredentials,
}: {
  homePath: string;
  dataDir: string;
  fetchPayload: Record<string, unknown>;
  setupToken?: string;
  storedCredentials?: LinkedClaudeCodeCredentials;
}): {
  credentials?: LinkedClaudeCodeCredentials;
  stored?: LinkedClaudeCodeCredentials;
  requests: string[];
  filePayload?: {
    claudeAiOauth?: {
      accessToken?: string;
      refreshToken?: string;
    };
  };
} {
  if (storedCredentials) {
    mkdirSync(join(dataDir, "auth"), { recursive: true });
    writeFileSync(
      join(dataDir, "auth", "providers.json"),
      JSON.stringify({
        version: 1,
        providers: {
          "claude-code": storedCredentials,
        },
      }),
      "utf8",
    );
  }

  const moduleDir = join(
    process.cwd(),
    "packages/agent/src/runtime/native/account-auth",
  );
  const script = `
    import { readFileSync } from "node:fs";
    import { join } from "node:path";
    import { refreshLinkedClaudeCodeCredentials } from ${JSON.stringify(join(moduleDir, "claude-code/index.ts"))};
    import { getStoredClaudeCodeCredentials } from ${JSON.stringify(join(moduleDir, "store.ts"))};
    const requests = [];
    globalThis.fetch = async (_input, init) => {
      requests.push(
        init?.body instanceof URLSearchParams
          ? init.body.toString()
          : String(init?.body ?? ""),
      );
      return new Response(process.env.TEST_FETCH_PAYLOAD, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const homePath = process.env.TEST_HOME_PATH;
    const credentials = await refreshLinkedClaudeCodeCredentials(homePath);
    const stored = getStoredClaudeCodeCredentials();
    const credentialsPath = join(homePath, ".claude", ".credentials.json");
    const filePayload = JSON.parse(readFileSync(credentialsPath, "utf8"));
    console.log(JSON.stringify({ credentials, stored, requests, filePayload }));
  `;

  const result = spawnSync(nubPath, ["-e", script], {
    env: claudeSubprocessEnvironment(homePath, dataDir, {
      setupToken,
      fetchPayload,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });

  expect(result.status).toBe(0);
  expectPrivateClaudeAccount(dataDir);
  return parseLastJsonLine(result.stdout) as {
    credentials?: LinkedClaudeCodeCredentials;
    stored?: LinkedClaudeCodeCredentials;
    requests: string[];
    filePayload?: {
      claudeAiOauth?: {
        accessToken?: string;
        refreshToken?: string;
      };
    };
  };
}

describe("Claude Code account auth", () => {
  it("isolates subprocess account storage and credentials from inherited configuration", () => {
    const env = claudeSubprocessEnvironment(
      "/fixture/home",
      "/fixture/state",
      { setupToken: "fixture-token" },
      {
        PATH: "fixture-bin",
        ELIZA_HOME: "/must-not-use/account-state",
        ELIZA_CONFIG_PATH: "/must-not-use/config.json",
        HOME: "/must-not-use/home",
        CLAUDE_CONFIG_DIR: "/must-not-use/claude",
        CLAUDE_CODE_SETUP_TOKEN: "inherited-token",
        OPENAI_API_KEY: "inherited-key",
        ANTHROPIC_API_KEY: "inherited-key",
        NODE_OPTIONS: "--require=/must-not-run/startup.js",
      },
    );
    expect(env).toMatchObject({
      PATH: "fixture-bin",
      HOME: "/fixture/home",
      ELIZA_HOME: "/fixture/state",
      ELIZA_CONFIG_PATH: join("/fixture/state", "eliza.json"),
      CLAUDE_CONFIG_DIR: join("/fixture/home", ".claude"),
      DOOLITTLE_DATA_DIR: "/fixture/state",
      DOOLITTLE_DATA_PATH: "/fixture/state",
      CLAUDE_CODE_SETUP_TOKEN: "fixture-token",
      DOOLITTLE_BOT_RUNTIME: "worker",
    });
    for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NODE_OPTIONS"])
      expect(env).not.toHaveProperty(name);
    expect(
      claudeSubprocessEnvironment(
        "/fixture/home",
        "/fixture/state",
        {},
        {
          CLAUDE_CODE_SETUP_TOKEN: "inherited-token",
        },
      ).CLAUDE_CODE_SETUP_TOKEN,
    ).toBe("");
  });

  it("prefers current local Claude auth artifacts over cached credentials", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-claude-auth-"));
    mkdirSync(join(homePath, ".claude"), { recursive: true });
    writeFileSync(
      join(homePath, ".claude", ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-access",
          refreshToken: "file-refresh",
          expiresAt: "1763579600000",
        },
      }),
      "utf8",
    );

    const { deps, persisted } = createClaudeCodeDeps({
      homePath,
      storedCredentials: {
        accessToken: "stored-access",
        refreshToken: "stored-refresh",
        accountLabel: "Stored Claude",
        authMode: "oauth",
        source: "eliza-auth-store",
      },
    });

    const status = getClaudeCodeAccountStatus(homePath, deps);
    const credentials = getLinkedClaudeCodeCredentials(homePath, deps);

    expect(status.source).toContain(".claude/.credentials.json");
    expect(credentials?.accessToken).toBe("file-access");
    expect(persisted).toEqual([credentials]);
  });

  it("loads file-backed Claude OAuth credentials and persists them", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-claude-file-"));
    mkdirSync(join(homePath, ".claude"), { recursive: true });
    writeFileSync(
      join(homePath, ".claude", ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-access",
          refreshToken: "file-refresh",
          expiresAt: "1763579600000",
        },
      }),
      "utf8",
    );
    writeFileSync(
      join(homePath, ".claude.json"),
      JSON.stringify({
        oauthAccount: {
          displayName: "Operator",
          emailAddress: "operator@example.com",
        },
      }),
      "utf8",
    );

    const { deps, persisted } = createClaudeCodeDeps({ homePath });
    const credentials = getLinkedClaudeCodeCredentials(homePath, deps);

    expect(credentials?.accessToken).toBe("file-access");
    expect(credentials?.accountLabel).toBe("Operator <operator@example.com>");
    expect(persisted).toEqual([credentials]);
  });

  it("preserves numeric Claude OAuth expiry timestamps", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-claude-expiry-"));
    mkdirSync(join(homePath, ".claude"), { recursive: true });
    writeFileSync(
      join(homePath, ".claude", ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-access",
          refreshToken: "file-refresh",
          expiresAt: 1_900_000_000_000,
        },
      }),
      "utf8",
    );

    const { deps, persisted } = createClaudeCodeDeps({ homePath });
    const credentials = getLinkedClaudeCodeCredentials(homePath, deps);

    expect(credentials?.expiresAt).toBe("1900000000000");
    expect(persisted).toEqual([credentials]);
  });

  it("reports logged-in local Claude CLI sessions as fallback-only without native creds", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-claude-fallback-"));
    writeFileSync(
      join(homePath, ".claude.json"),
      JSON.stringify({
        oauthAccount: {
          displayName: "Operator",
          emailAddress: "operator@example.com",
        },
      }),
      "utf8",
    );

    const { deps } = createClaudeCodeDeps({
      homePath,
      cliAvailable: true,
      cliLoggedIn: true,
    });
    const status = getClaudeCodeAccountStatus(homePath, deps);

    expect(status.available).toBe(true);
    expect(status.reusable).toBe(true);
    expect(status.nativeReady).toBe(false);
    expect(status.fallbackReady).toBe(true);
    expect(status.authMode).toBe("claude.ai");
    expect(status.source).toContain(".claude.json");
  });

  it("refreshes the authoritative Claude CLI credentials before cached credentials", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-claude-stored-"));
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-claude-store-"));
    const credentialsPath = join(homePath, ".claude", ".credentials.json");

    mkdirSync(join(homePath, ".claude"), { recursive: true });
    writeFileSync(
      credentialsPath,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-access",
          refreshToken: "file-refresh",
          expiresAt: String(Date.now() - 60_000),
        },
      }),
      "utf8",
    );

    const parsed = runClaudeRefreshSubprocess({
      homePath,
      dataDir,
      setupToken: "sk-ant-oat01-env",
      storedCredentials: {
        accessToken: "stored-access",
        refreshToken: "stored-refresh",
        expiresAt: String(Date.now() - 60_000),
        accountLabel: "Stored Claude",
        authMode: "oauth",
        source: "eliza-auth-store",
      },
      fetchPayload: {
        access_token: "stored-refreshed-access",
        refresh_token: "stored-refreshed-refresh",
        expires_in: 7200,
      },
    });

    expect(parsed.requests).toHaveLength(1);
    expect(parsed.requests[0]).toContain('"refresh_token":"file-refresh"');
    expect(parsed.credentials).toEqual(
      expect.objectContaining({
        accessToken: "stored-refreshed-access",
        refreshToken: "stored-refreshed-refresh",
        authMode: "oauth",
        source: credentialsPath,
      }),
    );
    expect(parsed.stored).toEqual(
      expect.objectContaining({
        ...parsed.credentials,
        source: officialClaudeSource,
      }),
    );
    expect(parsed.filePayload?.claudeAiOauth?.accessToken).toBe(
      "stored-refreshed-access",
    );
    expect(parsed.filePayload?.claudeAiOauth?.refreshToken).toBe(
      "stored-refreshed-refresh",
    );
  });

  it("uses refreshed expired file-backed Claude OAuth credentials before env fallback and persists the winner", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-claude-file-"));
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-claude-store-"));

    mkdirSync(join(homePath, ".claude"), { recursive: true });
    writeFileSync(
      join(homePath, ".claude", ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-access",
          refreshToken: "file-refresh",
          expiresAt: String(Date.now() - 60_000),
        },
      }),
      "utf8",
    );
    writeFileSync(
      join(homePath, ".claude.json"),
      JSON.stringify({
        oauthAccount: {
          displayName: "Operator",
          emailAddress: "operator@example.com",
        },
      }),
      "utf8",
    );

    const parsed = runClaudeRefreshSubprocess({
      homePath,
      dataDir,
      setupToken: "sk-ant-oat01-env",
      fetchPayload: {
        access_token: "file-refreshed-access",
        refresh_token: "file-refreshed-refresh",
        expires_in: 7200,
      },
    });

    expect(parsed.requests).toHaveLength(1);
    expect(parsed.requests[0]).toContain('"refresh_token":"file-refresh"');
    expect(parsed.credentials).toEqual(
      expect.objectContaining({
        accessToken: "file-refreshed-access",
        refreshToken: "file-refreshed-refresh",
        accountLabel: "Operator <operator@example.com>",
        authMode: "oauth",
        source: join(homePath, ".claude", ".credentials.json"),
      }),
    );
    expect(parsed.stored).toEqual(
      expect.objectContaining({
        ...parsed.credentials,
        source: officialClaudeSource,
      }),
    );
    expect(parsed.filePayload?.claudeAiOauth?.accessToken).toBe(
      "file-refreshed-access",
    );
    expect(parsed.filePayload?.claudeAiOauth?.refreshToken).toBe(
      "file-refreshed-refresh",
    );
  });

  it("falls back to env Claude credentials when expired file refresh yields no access token and persists the fallback", () => {
    const homePath = mkdtempSync(
      join(tmpdir(), "doolittle-claude-file-fallback-"),
    );
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-claude-store-"));

    mkdirSync(join(homePath, ".claude"), { recursive: true });
    writeFileSync(
      join(homePath, ".claude", ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-access",
          refreshToken: "file-refresh",
          expiresAt: String(Date.now() - 60_000),
        },
      }),
      "utf8",
    );
    writeFileSync(
      join(homePath, ".claude.json"),
      JSON.stringify({
        oauthAccount: {
          displayName: "Operator",
          emailAddress: "operator@example.com",
        },
      }),
      "utf8",
    );

    const parsed = runClaudeRefreshSubprocess({
      homePath,
      dataDir,
      setupToken: "sk-ant-oat01-env",
      fetchPayload: {
        refresh_token: "file-refreshed-refresh",
      },
    });

    expect(parsed.requests).toHaveLength(1);
    expect(parsed.requests[0]).toContain('"refresh_token":"file-refresh"');
    expect(parsed.credentials).toEqual({
      accessToken: "sk-ant-oat01-env",
      accountLabel: "Operator <operator@example.com>",
      authMode: "setup-token",
      source: "env:CLAUDE_CODE_SETUP_TOKEN",
    });
    expect(parsed.stored).toMatchObject({
      accessToken: "sk-ant-oat01-env",
      accountLabel: "Operator <operator@example.com>",
      authMode: "oauth",
      source: officialClaudeSource,
    });
    expect(parsed.filePayload?.claudeAiOauth?.accessToken).toBe("file-access");
    expect(parsed.filePayload?.claudeAiOauth?.refreshToken).toBe(
      "file-refresh",
    );
  });

  it("persists setup-token credentials during Claude refresh resolution", async () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-claude-env-"));
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-claude-store-"));
    const moduleDir = join(
      process.cwd(),
      "packages/agent/src/runtime/native/account-auth",
    );
    const script = `
        import { refreshLinkedClaudeCodeCredentials } from ${JSON.stringify(join(moduleDir, "claude-code/index.ts"))};
        import { getStoredClaudeCodeCredentials } from ${JSON.stringify(join(moduleDir, "store.ts"))};
        const homePath = process.env.TEST_HOME_PATH;
        const credentials = await refreshLinkedClaudeCodeCredentials(homePath);
        const stored = getStoredClaudeCodeCredentials();
        console.log(JSON.stringify({ credentials, stored }));
      `;

    const result = spawnSync(nubPath, ["-e", script], {
      env: claudeSubprocessEnvironment(homePath, dataDir, {
        setupToken: "sk-ant-oat01-test",
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    expectPrivateClaudeAccount(dataDir);
    const parsed = parseLastJsonLine(result.stdout) as {
      credentials?: LinkedClaudeCodeCredentials;
      stored?: LinkedClaudeCodeCredentials;
    };

    expect(parsed.credentials?.accessToken).toBe("sk-ant-oat01-test");
    expect(parsed.credentials?.authMode).toBe("setup-token");
    expect(parsed.credentials?.source).toBe("env:CLAUDE_CODE_SETUP_TOKEN");
    expect(parsed.stored?.accessToken).toBe("sk-ant-oat01-test");
    expect(parsed.stored?.authMode).toBe("oauth");
    expect(parsed.stored?.source).toBe(officialClaudeSource);
  });
});
