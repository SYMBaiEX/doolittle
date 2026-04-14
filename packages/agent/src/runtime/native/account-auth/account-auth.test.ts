import { describe, expect, it } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function loadSnapshotModule() {
  return import(`./index.ts?test=${Date.now()}-${Math.random()}`);
}

function createJwtToken(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.sig`;
}

async function withIsolatedAuthStore<T>(
  fn: (paths: { dataDir: string }) => Promise<T> | T,
): Promise<T> {
  const previous = process.env.DOOLITTLE_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "doolittle-auth-store-"));
  process.env.DOOLITTLE_DATA_DIR = dataDir;
  try {
    return await fn({ dataDir });
  } finally {
    if (previous === undefined) {
      delete process.env.DOOLITTLE_DATA_DIR;
    } else {
      process.env.DOOLITTLE_DATA_DIR = previous;
    }
  }
}

describe.serial("linked provider account auth snapshot", () => {
  it("detects reusable Codex auth from the local CLI store", async () => {
    await withIsolatedAuthStore(async () => {
      const home = mkdtempSync(join(tmpdir(), "doolittle-codex-auth-"));
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(
        join(home, ".codex", "auth.json"),
        JSON.stringify({
          auth_mode: "chatgpt",
          last_refresh: "2026-03-21T12:00:00.000Z",
          tokens: {
            access_token: "access",
            refresh_token: "refresh",
          },
        }),
        "utf8",
      );

      const mod = await loadSnapshotModule();
      const snapshot = mod.getLinkedProviderAccountsSnapshot(home);
      expect(snapshot.codex.reusable).toBe(true);
      expect(snapshot.codex.nativeReady).toBe(true);
      expect(snapshot.codex.fallbackReady).toBe(false);
      expect(snapshot.codex.authMode).toBe("chatgpt");
      expect(snapshot.codex.source).toContain(".codex/auth.json");
      const advice = mod.getLinkedProviderConnectAdvice("codex", home);
      expect(advice.ready).toBe(true);
      expect(advice.preferredAction).toBe("use");
    });
  });

  it.serial(
    "refreshes expired Codex credentials and rewrites the local and stored auth state",
    async () => {
      const originalFetch = globalThis.fetch;

      try {
        await withIsolatedAuthStore(async () => {
          const home = mkdtempSync(join(tmpdir(), "doolittle-codex-refresh-"));
          const authPath = join(home, ".codex", "auth.json");
          const expiredAccessToken = createJwtToken(
            Math.floor(Date.now() / 1000) - 60,
          );
          const refreshedAccessToken = createJwtToken(
            Math.floor(Date.now() / 1000) + 3600,
          );
          const requests: string[] = [];

          mkdirSync(join(home, ".codex"), { recursive: true });
          writeFileSync(
            authPath,
            JSON.stringify({
              auth_mode: "chatgpt",
              last_refresh: "2026-03-21T12:00:00.000Z",
              tokens: {
                access_token: expiredAccessToken,
                refresh_token: "codex-refresh-token",
              },
            }),
            "utf8",
          );

          globalThis.fetch = (async (
            _input: RequestInfo | URL,
            init?: RequestInit,
          ) => {
            requests.push(
              init?.body instanceof URLSearchParams
                ? init.body.toString()
                : String(init?.body ?? ""),
            );

            return new Response(
              JSON.stringify({
                access_token: refreshedAccessToken,
                refresh_token: "codex-refreshed-token",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            );
          }) as unknown as typeof fetch;

          const mod = await loadSnapshotModule();
          const credentials = await mod.refreshLinkedCodexCredentials(home);

          expect(requests).toHaveLength(1);
          expect(requests[0]).toContain("grant_type=refresh_token");
          expect(requests[0]).toContain("refresh_token=codex-refresh-token");
          expect(credentials?.accessToken).toBe(refreshedAccessToken);
          expect(credentials?.refreshToken).toBe("codex-refreshed-token");
          expect(credentials?.source).toContain(".codex/auth.json");

          const filePayload = JSON.parse(readFileSync(authPath, "utf8")) as {
            last_refresh?: string;
            tokens?: {
              access_token?: string;
              refresh_token?: string;
            };
          };

          expect(filePayload.tokens?.access_token).toBe(refreshedAccessToken);
          expect(filePayload.tokens?.refresh_token).toBe(
            "codex-refreshed-token",
          );
          expect(filePayload.last_refresh).toBeTruthy();
          expect(filePayload.last_refresh).not.toBe("2026-03-21T12:00:00.000Z");

          expect(mod.__accountAuthTestOnly.readProviderAuthStore()).toEqual(
            expect.objectContaining({
              providers: expect.objectContaining({
                codex: expect.objectContaining({
                  accessToken: refreshedAccessToken,
                  refreshToken: "codex-refreshed-token",
                  authMode: "chatgpt",
                  lastRefresh: filePayload.last_refresh,
                }),
              }),
            }),
          );

          expect(mod.getLinkedCodexCredentials(home)).toEqual({
            accessToken: refreshedAccessToken,
            refreshToken: "codex-refreshed-token",
            authMode: "chatgpt",
            lastRefresh: filePayload.last_refresh,
            source: "eliza-auth-store",
          });
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  it.serial(
    "surfaces Codex OAuth refresh failures without rewriting auth state",
    async () => {
      const originalFetch = globalThis.fetch;

      try {
        await withIsolatedAuthStore(async () => {
          const home = mkdtempSync(join(tmpdir(), "doolittle-codex-fail-"));
          const authPath = join(home, ".codex", "auth.json");
          const expiredAccessToken = createJwtToken(
            Math.floor(Date.now() / 1000) - 60,
          );

          mkdirSync(join(home, ".codex"), { recursive: true });
          writeFileSync(
            authPath,
            JSON.stringify({
              auth_mode: "chatgpt",
              last_refresh: "2026-03-21T12:00:00.000Z",
              tokens: {
                access_token: expiredAccessToken,
                refresh_token: "codex-refresh-token",
              },
            }),
            "utf8",
          );

          globalThis.fetch = (async () =>
            new Response("expired refresh", {
              status: 401,
            })) as unknown as typeof fetch;

          const mod = await loadSnapshotModule();

          await expect(mod.refreshLinkedCodexCredentials(home)).rejects.toThrow(
            "Codex OAuth refresh failed (401): expired refresh",
          );

          const filePayload = JSON.parse(readFileSync(authPath, "utf8")) as {
            last_refresh?: string;
            tokens?: {
              access_token?: string;
              refresh_token?: string;
            };
          };

          expect(filePayload.tokens?.access_token).toBe(expiredAccessToken);
          expect(filePayload.tokens?.refresh_token).toBe("codex-refresh-token");
          expect(filePayload.last_refresh).toBe("2026-03-21T12:00:00.000Z");
          expect(
            mod.__accountAuthTestOnly.readProviderAuthStore().providers,
          ).not.toHaveProperty("codex");
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  it.serial(
    "rejects Codex refresh responses that omit access_token",
    async () => {
      const originalFetch = globalThis.fetch;

      try {
        await withIsolatedAuthStore(async () => {
          const home = mkdtempSync(
            join(tmpdir(), "doolittle-codex-missing-access-"),
          );
          const authPath = join(home, ".codex", "auth.json");
          const expiredAccessToken = createJwtToken(
            Math.floor(Date.now() / 1000) - 60,
          );

          mkdirSync(join(home, ".codex"), { recursive: true });
          writeFileSync(
            authPath,
            JSON.stringify({
              auth_mode: "chatgpt",
              last_refresh: "2026-03-21T12:00:00.000Z",
              tokens: {
                access_token: expiredAccessToken,
                refresh_token: "codex-refresh-token",
              },
            }),
            "utf8",
          );

          globalThis.fetch = (async () =>
            new Response(
              JSON.stringify({ refresh_token: "codex-refreshed-token" }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            )) as unknown as typeof fetch;

          const mod = await loadSnapshotModule();

          await expect(mod.refreshLinkedCodexCredentials(home)).rejects.toThrow(
            "Codex OAuth refresh response did not include access_token",
          );

          const filePayload = JSON.parse(readFileSync(authPath, "utf8")) as {
            last_refresh?: string;
            tokens?: {
              access_token?: string;
              refresh_token?: string;
            };
          };

          expect(filePayload.tokens?.access_token).toBe(expiredAccessToken);
          expect(filePayload.tokens?.refresh_token).toBe("codex-refresh-token");
          expect(filePayload.last_refresh).toBe("2026-03-21T12:00:00.000Z");
          expect(
            mod.__accountAuthTestOnly.readProviderAuthStore().providers,
          ).not.toHaveProperty("codex");
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  it.serial(
    "skips Codex refresh in resolveLinkedProviderCredentials when the access token is not expiring",
    async () => {
      const originalFetch = globalThis.fetch;

      try {
        await withIsolatedAuthStore(async () => {
          const home = mkdtempSync(join(tmpdir(), "doolittle-codex-steady-"));
          const authPath = join(home, ".codex", "auth.json");
          const validAccessToken = createJwtToken(
            Math.floor(Date.now() / 1000) + 3600,
          );
          let fetchCalls = 0;

          mkdirSync(join(home, ".codex"), { recursive: true });
          writeFileSync(
            authPath,
            JSON.stringify({
              auth_mode: "chatgpt",
              last_refresh: "2026-03-21T12:00:00.000Z",
              tokens: {
                access_token: validAccessToken,
                refresh_token: "codex-refresh-token",
              },
            }),
            "utf8",
          );

          globalThis.fetch = (async () => {
            fetchCalls += 1;
            throw new Error("Codex refresh should not run");
          }) as unknown as typeof fetch;

          const mod = await loadSnapshotModule();
          const credentials = await mod.resolveLinkedProviderCredentials(
            "codex",
            home,
          );

          expect(fetchCalls).toBe(0);
          expect(credentials).toEqual({
            accessToken: validAccessToken,
            refreshToken: "codex-refresh-token",
            authMode: "chatgpt",
            lastRefresh: "2026-03-21T12:00:00.000Z",
            source: authPath,
          });
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  it("detects reusable Claude Code oauth credentials", async () => {
    await withIsolatedAuthStore(async () => {
      const home = mkdtempSync(join(tmpdir(), "doolittle-claude-auth-"));
      mkdirSync(join(home, ".claude"), { recursive: true });
      writeFileSync(
        join(home, ".claude", ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "access",
            refreshToken: "refresh",
            expiresAt: "1763579600000",
          },
        }),
        "utf8",
      );
      writeFileSync(
        join(home, ".claude.json"),
        JSON.stringify({
          oauthAccount: {
            displayName: "Symbiotic Operator",
            emailAddress: "solsymbaiex@gmail.com",
          },
        }),
        "utf8",
      );

      const mod = await loadSnapshotModule();
      const snapshot = mod.getLinkedProviderAccountsSnapshot(home);
      expect(snapshot.claudeCode.reusable).toBe(true);
      expect(snapshot.claudeCode.nativeReady).toBe(true);
      expect(snapshot.claudeCode.accountLabel).toContain("Symbiotic Operator");
      expect(snapshot.claudeCode.source).toContain(".claude/.credentials.json");
      expect(snapshot.claudeCode.loginCommand).toBe("claude auth login");
      expect(snapshot.claudeCode.setupCommand).toBe("claude setup-token");
    });
  });

  it.serial("detects reusable Claude Code setup-token from env", async () => {
    const previous = process.env.CLAUDE_CODE_SETUP_TOKEN;
    process.env.CLAUDE_CODE_SETUP_TOKEN = "sk-ant-oat01-test";
    try {
      await withIsolatedAuthStore(async () => {
        const home = mkdtempSync(join(tmpdir(), "doolittle-claude-token-"));
        const mod = await loadSnapshotModule();
        const snapshot = mod.getLinkedProviderAccountsSnapshot(home);
        expect(snapshot.claudeCode.reusable).toBe(true);
        expect(snapshot.claudeCode.nativeReady).toBe(true);
        expect(snapshot.claudeCode.authMode).toBe("setup-token");
        expect(snapshot.claudeCode.source).toBe("env:CLAUDE_CODE_SETUP_TOKEN");

        const credentials = mod.getLinkedClaudeCodeCredentials(home);
        expect(credentials?.accessToken).toBe("sk-ant-oat01-test");
        expect(credentials?.authMode).toBe("setup-token");
      });
    } finally {
      if (previous === undefined) {
        delete process.env.CLAUDE_CODE_SETUP_TOKEN;
      } else {
        process.env.CLAUDE_CODE_SETUP_TOKEN = previous;
      }
    }
  });

  it.serial(
    "skips Claude refresh in resolveLinkedProviderCredentials when file credentials are not expiring",
    async () => {
      const previousSetupToken = process.env.CLAUDE_CODE_SETUP_TOKEN;
      const originalFetch = globalThis.fetch;
      process.env.CLAUDE_CODE_SETUP_TOKEN = "sk-ant-oat01-env";

      try {
        await withIsolatedAuthStore(async () => {
          const home = mkdtempSync(join(tmpdir(), "doolittle-claude-steady-"));
          let fetchCalls = 0;

          mkdirSync(join(home, ".claude"), { recursive: true });
          writeFileSync(
            join(home, ".claude", ".credentials.json"),
            JSON.stringify({
              claudeAiOauth: {
                accessToken: "file-access",
                refreshToken: "file-refresh",
                expiresAt: String(Date.now() + 3_600_000),
              },
            }),
            "utf8",
          );
          writeFileSync(
            join(home, ".claude.json"),
            JSON.stringify({
              oauthAccount: {
                displayName: "Operator",
                emailAddress: "operator@example.com",
              },
            }),
            "utf8",
          );

          globalThis.fetch = (async () => {
            fetchCalls += 1;
            throw new Error("Claude refresh should not run");
          }) as unknown as typeof fetch;

          const mod = await loadSnapshotModule();
          const credentials = await mod.resolveLinkedProviderCredentials(
            "claude-code",
            home,
          );

          expect(fetchCalls).toBe(0);
          expect(credentials).toEqual({
            accessToken: "file-access",
            refreshToken: "file-refresh",
            expiresAt: expect.any(String),
            accountLabel: "Operator <operator@example.com>",
            authMode: "oauth",
            source: join(home, ".claude", ".credentials.json"),
          });
        });
      } finally {
        globalThis.fetch = originalFetch;
        if (previousSetupToken === undefined) {
          delete process.env.CLAUDE_CODE_SETUP_TOKEN;
        } else {
          process.env.CLAUDE_CODE_SETUP_TOKEN = previousSetupToken;
        }
      }
    },
  );

  it("treats local logged-in Claude CLI without native creds as fallback-only", async () => {
    const previousSetupToken = process.env.CLAUDE_CODE_SETUP_TOKEN;
    delete process.env.CLAUDE_CODE_SETUP_TOKEN;

    try {
      const home = mkdtempSync(join(tmpdir(), "doolittle-claude-fallback-"));
      const dataDir = mkdtempSync(join(tmpdir(), "doolittle-auth-store-"));
      writeFileSync(
        join(home, ".claude.json"),
        JSON.stringify({
          oauthAccount: {
            displayName: "Operator",
            emailAddress: "operator@example.com",
          },
        }),
        "utf8",
      );

      const originalPath = process.env.PATH;
      const binDir = join(home, "bin");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(
        join(binDir, "claude"),
        `#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  printf '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'
  exit 0
fi
if [ "$1" = "--version" ]; then
  printf '2.1.74'
  exit 0
fi
exit 0
`,
        "utf8",
      );
      chmodSync(join(binDir, "claude"), 0o755);

      const moduleDir = join(
        process.cwd(),
        "packages/agent/src/runtime/native/account-auth",
      );
      const script = `
        import { getLinkedProviderAccountsSnapshot, getLinkedProviderConnectAdvice } from ${JSON.stringify(join(moduleDir, "index.ts"))};
        const homePath = process.env.TEST_HOME_PATH;
        const snapshot = getLinkedProviderAccountsSnapshot(homePath);
        const advice = getLinkedProviderConnectAdvice("claude-code", homePath);
        console.log(JSON.stringify({ snapshot, advice }));
      `;
      const result = Bun.spawnSync({
        cmd: [process.execPath, "-e", script],
        env: {
          ...process.env,
          DOOLITTLE_DATA_DIR: dataDir,
          TEST_HOME_PATH: home,
          PATH: `${binDir}:${originalPath ?? ""}`,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(new TextDecoder().decode(result.stdout)) as {
        snapshot: {
          claudeCode: {
            reusable: boolean;
            nativeReady: boolean;
            fallbackReady: boolean;
          };
        };
        advice: {
          ready: boolean;
          preferredAction: string;
          primaryCommand: string;
        };
      };

      expect(parsed.snapshot.claudeCode.reusable).toBe(true);
      expect(parsed.snapshot.claudeCode.nativeReady).toBe(false);
      expect(parsed.snapshot.claudeCode.fallbackReady).toBe(true);
      expect(parsed.advice.ready).toBe(false);
      expect(parsed.advice.preferredAction).toBe("setup-token");
      expect(parsed.advice.primaryCommand).toBe("claude setup-token");
    } finally {
      if (previousSetupToken === undefined) {
        delete process.env.CLAUDE_CODE_SETUP_TOKEN;
      } else {
        process.env.CLAUDE_CODE_SETUP_TOKEN = previousSetupToken;
      }
    }
  });

  it("canonicalizes Eliza Cloud base URL from env credentials", async () => {
    const previousKey = process.env.ELIZAOS_CLOUD_API_KEY;
    const previousBaseUrl = process.env.ELIZAOS_CLOUD_BASE_URL;
    process.env.ELIZAOS_CLOUD_API_KEY = "cloud-test-key";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://elizacloud.ai/api/v1/";
    try {
      await withIsolatedAuthStore(async () => {
        const mod = await loadSnapshotModule();
        const credentials = mod.getLinkedElizaCloudCredentials();
        expect(credentials?.apiKey).toBe("cloud-test-key");
        expect(credentials?.baseUrl).toBe("https://www.elizacloud.ai/api/v1");
      });
    } finally {
      if (previousKey === undefined) {
        delete process.env.ELIZAOS_CLOUD_API_KEY;
      } else {
        process.env.ELIZAOS_CLOUD_API_KEY = previousKey;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.ELIZAOS_CLOUD_BASE_URL;
      } else {
        process.env.ELIZAOS_CLOUD_BASE_URL = previousBaseUrl;
      }
    }
  });
});
