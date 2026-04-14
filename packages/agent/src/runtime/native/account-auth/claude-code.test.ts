import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getClaudeCodeAccountStatus,
  getLinkedClaudeCodeCredentials,
} from "./claude-code";
import type { ClaudeCodeAuthDependencies } from "./claude-code-support";
import { getClaudeCodeAuthDependencies } from "./claude-code-support";
import type { LinkedClaudeCodeCredentials } from "./types";

const bunPath = process.execPath;
const textDecoder = new TextDecoder();

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

  const result = Bun.spawnSync({
    cmd: [bunPath, "-e", script],
    env: {
      ...process.env,
      DOOLITTLE_DATA_DIR: dataDir,
      TEST_HOME_PATH: homePath,
      TEST_FETCH_PAYLOAD: JSON.stringify(fetchPayload),
      ...(setupToken
        ? {
            CLAUDE_CODE_SETUP_TOKEN: setupToken,
          }
        : {}),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  return JSON.parse(textDecoder.decode(result.stdout).trim()) as {
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

describe.serial("Claude Code account auth", () => {
  it("prefers reusable stored credentials over local Claude auth artifacts", () => {
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

    expect(status.source).toBe("eliza-auth-store");
    expect(status.accountLabel).toBe("Stored Claude");
    expect(credentials?.accessToken).toBe("stored-access");
    expect(persisted).toHaveLength(0);
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

  it.serial(
    "refreshes stored Claude OAuth credentials before file or env fallbacks and persists the winner",
    () => {
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
      expect(parsed.requests[0]).toContain("refresh_token=stored-refresh");
      expect(parsed.credentials).toEqual(
        expect.objectContaining({
          accessToken: "stored-refreshed-access",
          refreshToken: "stored-refreshed-refresh",
          accountLabel: "Stored Claude",
          authMode: "oauth",
          source: "eliza-auth-store",
        }),
      );
      expect(parsed.stored).toEqual(parsed.credentials);
      expect(parsed.filePayload?.claudeAiOauth?.accessToken).toBe(
        "file-access",
      );
      expect(parsed.filePayload?.claudeAiOauth?.refreshToken).toBe(
        "file-refresh",
      );
    },
  );

  it.serial(
    "uses refreshed expired file-backed Claude OAuth credentials before env fallback and persists the winner",
    () => {
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
      expect(parsed.requests[0]).toContain("refresh_token=file-refresh");
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
          source: "eliza-auth-store",
        }),
      );
      expect(parsed.filePayload?.claudeAiOauth?.accessToken).toBe(
        "file-access",
      );
      expect(parsed.filePayload?.claudeAiOauth?.refreshToken).toBe(
        "file-refresh",
      );
    },
  );

  it.serial(
    "falls back to env Claude credentials when expired file refresh yields no access token and persists the fallback",
    () => {
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
      expect(parsed.requests[0]).toContain("refresh_token=file-refresh");
      expect(parsed.credentials).toEqual({
        accessToken: "sk-ant-oat01-env",
        accountLabel: "Operator <operator@example.com>",
        authMode: "setup-token",
        source: "env:CLAUDE_CODE_SETUP_TOKEN",
      });
      expect(parsed.stored).toEqual({
        accessToken: "sk-ant-oat01-env",
        accountLabel: "Operator <operator@example.com>",
        authMode: "setup-token",
        source: "eliza-auth-store",
      });
      expect(parsed.filePayload?.claudeAiOauth?.accessToken).toBe(
        "file-access",
      );
      expect(parsed.filePayload?.claudeAiOauth?.refreshToken).toBe(
        "file-refresh",
      );
    },
  );

  it.serial(
    "persists setup-token credentials during Claude refresh resolution",
    async () => {
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

      const result = Bun.spawnSync({
        cmd: [bunPath, "-e", script],
        env: {
          ...process.env,
          CLAUDE_CODE_SETUP_TOKEN: "sk-ant-oat01-test",
          DOOLITTLE_DATA_DIR: dataDir,
          TEST_HOME_PATH: homePath,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(textDecoder.decode(result.stdout).trim()) as {
        credentials?: LinkedClaudeCodeCredentials;
        stored?: LinkedClaudeCodeCredentials;
      };

      expect(parsed.credentials?.accessToken).toBe("sk-ant-oat01-test");
      expect(parsed.credentials?.authMode).toBe("setup-token");
      expect(parsed.credentials?.source).toBe("env:CLAUDE_CODE_SETUP_TOKEN");
      expect(parsed.stored?.accessToken).toBe("sk-ant-oat01-test");
      expect(parsed.stored?.authMode).toBe("setup-token");
      expect(parsed.stored?.source).toBe("eliza-auth-store");
    },
  );
});
