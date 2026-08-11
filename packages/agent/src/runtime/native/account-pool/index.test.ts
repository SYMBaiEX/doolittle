import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAccount, saveAccount } from "@elizaos/agent/auth/account-storage";
import { listProviderAccounts } from "@elizaos/agent/auth/credentials";
import {
  __resetDefaultAccountPoolForTests,
  AccountPool,
} from "@elizaos/app-core/account-pool";
import { describe, expect, it, vi } from "vitest";
import { persistProviderCredentials } from "@/runtime/native/account-auth/store";
import {
  deleteDoolittleAccount,
  getDoolittleAccountPool,
  importCurrentDoolittleAccount,
  importLegacyDoolittleAccounts,
  initializeDoolittleAccountPool,
  reconcileDoolittleAccountPoolCredentials,
  refreshDoolittleAccountUsage,
  setDoolittleAccountPoolStrategy,
  snapshotDoolittleAccountPool,
  synchronizeDoolittleAccountPoolFromNativeStores,
  testDoolittleAccountCredentials,
} from "./index";

async function withIsolatedAccountPool<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "doolittle-account-pool-"));
  const previousDoolittle = process.env.DOOLITTLE_DATA_DIR;
  const previousEliza = process.env.ELIZA_HOME;
  process.env.DOOLITTLE_DATA_DIR = root;
  process.env.ELIZA_HOME = root;
  delete (globalThis as Record<symbol, unknown>)[
    Symbol.for("eliza.account-pool.coding-agent.v1")
  ];
  __resetDefaultAccountPoolForTests();
  try {
    return await fn();
  } finally {
    __resetDefaultAccountPoolForTests();
    if (previousDoolittle === undefined) delete process.env.DOOLITTLE_DATA_DIR;
    else process.env.DOOLITTLE_DATA_DIR = previousDoolittle;
    if (previousEliza === undefined) delete process.env.ELIZA_HOME;
    else process.env.ELIZA_HOME = previousEliza;
    rmSync(root, { recursive: true, force: true });
  }
}

function seedLegacyCredentials(
  providers: Record<string, Record<string, unknown>>,
): void {
  const authDir = join(process.env.DOOLITTLE_DATA_DIR as string, "auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    join(authDir, "providers.json"),
    JSON.stringify({ version: 1, providers }),
    "utf8",
  );
}

function createUnexpiredJwt(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3_600 }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

describe.sequential("Doolittle official account pool adapter", () => {
  it("resolves credentials without returning them and updates official health", async () => {
    const account = {
      id: "work",
      providerId: "openai-codex",
      label: "Work",
      source: "oauth",
      enabled: true,
      priority: 0,
      createdAt: 1,
      health: "needs-reauth",
      organizationId: "org-123",
    };
    const pool = {
      get: vi.fn(() => account),
      markHealthy: vi.fn().mockResolvedValue(undefined),
      markNeedsReauth: vi.fn().mockResolvedValue(undefined),
      markRateLimited: vi.fn().mockResolvedValue(undefined),
      refreshUsage: vi.fn().mockResolvedValue(undefined),
    } as unknown as AccountPool;

    await expect(
      testDoolittleAccountCredentials(
        "openai-codex",
        "work",
        pool,
        async () => "secret-token",
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(pool.markHealthy).toHaveBeenCalledWith("work", {
      providerId: "openai-codex",
    });

    await expect(
      testDoolittleAccountCredentials(
        "openai-codex",
        "work",
        pool,
        async () => null,
      ),
    ).resolves.toEqual({
      ok: false,
      latencyMs: expect.any(Number),
      error: "Unable to resolve credentials for this account.",
    });
    expect(pool.markNeedsReauth).toHaveBeenCalledWith(
      "work",
      "Unable to resolve credentials for this account.",
      { providerId: "openai-codex" },
    );

    const rateLimited = Object.assign(new Error("provider failure"), {
      status: 429,
    });
    await testDoolittleAccountCredentials(
      "openai-codex",
      "work",
      pool,
      async () => Promise.reject(rateLimited),
    );
    expect(pool.markRateLimited).toHaveBeenCalledWith(
      "work",
      expect.any(Number),
      "Usage request was rate limited.",
      { providerId: "openai-codex" },
    );
  });

  it("reconciles every linked account after the native login refreshes", async () => {
    const accounts = [
      {
        id: "work",
        providerId: "openai-codex",
        label: "Work",
        source: "oauth",
        enabled: true,
        priority: 0,
        createdAt: 1,
        health: "needs-reauth",
      },
    ];
    const pool = {
      list: vi.fn((providerId: string) =>
        providerId === "openai-codex" ? accounts : [],
      ),
      get: vi.fn(() => accounts[0]),
      markHealthy: vi.fn().mockImplementation(async () => {
        accounts[0].health = "ok";
      }),
      markNeedsReauth: vi.fn().mockResolvedValue(undefined),
      markRateLimited: vi.fn().mockResolvedValue(undefined),
    } as unknown as AccountPool;

    const snapshot = await reconcileDoolittleAccountPoolCredentials(
      "openai-codex",
      pool,
      async () => "current-native-token",
    );

    expect(pool.markHealthy).toHaveBeenCalledWith("work", {
      providerId: "openai-codex",
    });
    expect(snapshot.providers["openai-codex"].accounts[0]?.health).toBe("ok");
  });

  it("heals stale health from an unexpired credential without provider I/O", async () =>
    withIsolatedAccountPool(async () => {
      const accounts = [
        {
          id: "work",
          providerId: "openai-codex",
          label: "Work",
          source: "oauth",
          enabled: true,
          priority: 0,
          createdAt: 1,
          health: "needs-reauth",
        },
      ];
      const pool = {
        list: vi.fn((providerId: string) =>
          providerId === "openai-codex" ? accounts : [],
        ),
        markHealthy: vi.fn().mockImplementation(async () => {
          accounts[0].health = "ok";
        }),
        markNeedsReauth: vi.fn().mockResolvedValue(undefined),
      } as unknown as AccountPool;
      saveAccount({
        providerId: "openai-codex",
        id: "work",
        label: "Work",
        source: "oauth",
        organizationId: undefined,
        createdAt: 1,
        updatedAt: 1,
        credentials: {
          access: "current-access",
          refresh: "current-refresh",
          expires: Date.now() + 3_600_000,
        },
      });

      const snapshot = await synchronizeDoolittleAccountPoolFromNativeStores(
        pool,
        () => undefined,
      );

      expect(pool.markHealthy).toHaveBeenCalledWith("work", {
        providerId: "openai-codex",
      });
      expect(snapshot.providers["openai-codex"].accounts[0]?.health).toBe("ok");
    }));

  it("refreshes usage through the official pool with the Codex account id", async () => {
    const account = {
      id: "work",
      providerId: "openai-codex",
      label: "Work",
      source: "oauth",
      enabled: true,
      priority: 0,
      createdAt: 1,
      health: "ok",
      organizationId: "org-123",
    };
    const pool = {
      get: vi.fn(() => account),
      markHealthy: vi.fn().mockResolvedValue(undefined),
      markNeedsReauth: vi.fn().mockResolvedValue(undefined),
      markRateLimited: vi.fn().mockResolvedValue(undefined),
      refreshUsage: vi.fn().mockResolvedValue(undefined),
    } as unknown as AccountPool;

    await expect(
      refreshDoolittleAccountUsage(
        "openai-codex",
        "work",
        pool,
        async () => "secret-token",
      ),
    ).resolves.toMatchObject({
      source: "pool",
      account: { accountId: "work" },
    });
    expect(pool.refreshUsage).toHaveBeenCalledWith("work", "secret-token", {
      providerId: "openai-codex",
      codexAccountId: "org-123",
    });
  });

  it("uses the official pool for deterministic two-account round-robin selection", async () => {
    const accounts = {
      a: {
        id: "a",
        providerId: "openai-codex",
        label: "A",
        source: "oauth",
        enabled: true,
        priority: 0,
        createdAt: 1,
        health: "ok",
      },
      b: {
        id: "b",
        providerId: "openai-codex",
        label: "B",
        source: "oauth",
        enabled: true,
        priority: 1,
        createdAt: 2,
        health: "ok",
      },
    } as const;
    const pool = new AccountPool({
      readAccounts: () => accounts,
      writeAccount: async () => undefined,
    });

    await expect(
      pool.select({ providerId: "openai-codex", strategy: "round-robin" }),
    ).resolves.toMatchObject({ id: "a" });
    await expect(
      pool.select({ providerId: "openai-codex", strategy: "round-robin" }),
    ).resolves.toMatchObject({ id: "b" });
  });

  it("persists provider strategy and installs the official orchestrator bridge", async () =>
    await withIsolatedAccountPool(() => {
      initializeDoolittleAccountPool(process.env.DOOLITTLE_DATA_DIR);
      expect(
        (globalThis as Record<symbol, unknown>)[
          Symbol.for("eliza.account-pool.coding-agent.v1")
        ],
      ).toBeDefined();

      expect(
        setDoolittleAccountPoolStrategy("openai-codex", "round-robin"),
      ).toBe("round-robin");
      expect(
        snapshotDoolittleAccountPool().providers["openai-codex"].strategy,
      ).toBe("round-robin");
      expect(
        getDoolittleAccountPool().get("missing", "openai-codex"),
      ).toBeNull();
    }));

  it("imports legacy credentials idempotently and retains multiple native imports", async () =>
    await withIsolatedAccountPool(async () => {
      const codexAccessToken = createUnexpiredJwt();
      const updatedCodexAccessToken = createUnexpiredJwt();
      seedLegacyCredentials({
        codex: {
          accessToken: codexAccessToken,
          refreshToken: "codex-refresh-token",
          idToken: "codex-id-token",
          accountId: "chatgpt-account",
        },
        "claude-code": {
          accessToken: "claude-access-token",
          refreshToken: "claude-refresh-token",
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(2);
      expect(importLegacyDoolittleAccounts()).toBe(0);
      expect(
        JSON.parse(
          readFileSync(
            join(
              process.env.DOOLITTLE_DATA_DIR as string,
              "auth",
              "providers.json",
            ),
            "utf8",
          ),
        ),
      ).toEqual({ version: 1, providers: {} });
      expect(
        loadAccount("openai-codex", "doolittle-legacy-codex")?.credentials,
      ).toMatchObject({
        access: codexAccessToken,
        refresh: "codex-refresh-token",
        idToken: "codex-id-token",
      });
      expect(
        importCurrentDoolittleAccount(
          "openai-codex",
          "work-codex",
          "Work Codex",
        ),
      ).toMatchObject({ accountId: "work-codex" });
      expect(
        importCurrentDoolittleAccount(
          "anthropic-subscription",
          "work-claude",
          "Work Claude",
        ),
      ).toMatchObject({ accountId: "work-claude" });
      persistProviderCredentials("codex", {
        accessToken: updatedCodexAccessToken,
        refreshToken: "updated-codex-refresh-token",
        idToken: "updated-codex-id-token",
        accountId: "chatgpt-account",
      });
      expect(
        importCurrentDoolittleAccount(
          "openai-codex",
          "work-codex",
          "Attempted rename",
        ),
      ).toMatchObject({ accountId: "work-codex", label: "Work Codex" });
      expect(loadAccount("openai-codex", "work-codex")).toMatchObject({
        label: "Work Codex",
        organizationId: "chatgpt-account",
        credentials: {
          access: updatedCodexAccessToken,
          refresh: "updated-codex-refresh-token",
          idToken: "updated-codex-id-token",
        },
      });
      initializeDoolittleAccountPool(process.env.DOOLITTLE_DATA_DIR);
      setDoolittleAccountPoolStrategy("openai-codex", "round-robin");
      const bridge = (
        globalThis as Record<
          symbol,
          { select(agentType: string): Promise<unknown> }
        >
      )[Symbol.for("eliza.account-pool.coding-agent.v1")];
      const selectedCodex = (await bridge.select("codex")) as {
        accountId: string;
        strategy: string;
        envPatch: { CODEX_HOME: string };
      };
      expect(selectedCodex).toMatchObject({
        accountId: "doolittle-legacy-codex",
        strategy: "round-robin",
      });
      expect(selectedCodex.envPatch.CODEX_HOME).toBe(
        join(
          process.env.DOOLITTLE_DATA_DIR as string,
          "auth",
          "_codex-home",
          "doolittle-legacy-codex",
        ),
      );
      expect(
        JSON.parse(
          readFileSync(
            join(selectedCodex.envPatch.CODEX_HOME, "auth.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({
        tokens: { id_token: "updated-codex-id-token" },
      });
      expect(await bridge.select("codex")).toMatchObject({
        accountId: "work-codex",
        strategy: "round-robin",
      });
      expect(
        listProviderAccounts("openai-codex").map((account) => account.id),
      ).toEqual(["doolittle-legacy-codex", "work-codex"]);
      expect(
        listProviderAccounts("anthropic-subscription").map(
          (account) => account.id,
        ),
      ).toEqual(["doolittle-legacy-claude-code", "work-claude"]);
      expect(importLegacyDoolittleAccounts()).toBe(0);
      expect(await deleteDoolittleAccount("openai-codex", "work-codex")).toBe(
        true,
      );
      expect(
        listProviderAccounts("openai-codex").map((account) => account.id),
      ).toEqual(["doolittle-legacy-codex"]);
    }));

  it("imports numeric Claude expiration strings with their original refresh deadline", async () =>
    await withIsolatedAccountPool(() => {
      const expiresAt = Date.now() - 60_000;
      seedLegacyCredentials({
        "claude-code": {
          accessToken: "claude-access-token",
          refreshToken: "claude-refresh-token",
          expiresAt: String(expiresAt),
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      const record = loadAccount(
        "anthropic-subscription",
        "doolittle-legacy-claude-code",
      );
      expect(record?.credentials.expires).toBe(expiresAt);
      expect(Number.isFinite(record?.credentials.expires)).toBe(true);
      expect(record?.credentials.expires).toBeLessThan(Date.now());
    }));

  it("falls back to ISO Claude expiration values", async () =>
    await withIsolatedAccountPool(() => {
      const expiresAt = "2030-01-02T03:04:05.000Z";
      seedLegacyCredentials({
        "claude-code": {
          accessToken: "claude-access-token",
          refreshToken: "claude-refresh-token",
          expiresAt,
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(Date.parse(expiresAt));
    }));

  it("forces refresh for missing Claude expiry when a refresh token exists", async () =>
    await withIsolatedAccountPool(() => {
      seedLegacyCredentials({
        "claude-code": {
          accessToken: "claude-access-token",
          refreshToken: "claude-refresh-token",
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(0);
    }));

  it("forces refresh for malformed Claude expiry when a refresh token exists", async () =>
    await withIsolatedAccountPool(() => {
      seedLegacyCredentials({
        "claude-code": {
          accessToken: "claude-access-token",
          refreshToken: "claude-refresh-token",
          expiresAt: "not-an-expiry",
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(0);
    }));

  it("uses a conservative fallback for non-refreshable Claude credentials", async () =>
    await withIsolatedAccountPool(() => {
      seedLegacyCredentials({
        "claude-code": {
          accessToken: "claude-access-token",
          expiresAt: "not-an-expiry",
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(Number.MAX_SAFE_INTEGER);
    }));

  it("keeps existing official and named accounts when stale legacy keys remain", async () =>
    await withIsolatedAccountPool(() => {
      persistProviderCredentials("codex", {
        accessToken: "official-access-token",
        refreshToken: "official-refresh-token",
        idToken: "official-id-token",
        accountId: "official-chatgpt-account",
      });
      saveAccount({
        id: "named-codex",
        providerId: "openai-codex",
        label: "Named Codex",
        source: "oauth",
        credentials: {
          access: "named-access-token",
          refresh: "named-refresh-token",
          expires: Date.now() + 3_600_000,
        },
        createdAt: 1,
        updatedAt: 1,
      });
      seedLegacyCredentials({
        codex: {
          accessToken: "stale-access-token",
          refreshToken: "stale-refresh-token",
          idToken: "stale-id-token",
          accountId: "stale-chatgpt-account",
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(0);
      expect(
        loadAccount("openai-codex", "doolittle-legacy-codex"),
      ).toMatchObject({
        organizationId: "official-chatgpt-account",
        credentials: {
          access: "official-access-token",
          refresh: "official-refresh-token",
          idToken: "official-id-token",
        },
      });
      expect(
        listProviderAccounts("openai-codex").map((account) => account.id),
      ).toEqual(["named-codex", "doolittle-legacy-codex"]);
    }));
});
