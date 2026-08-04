import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAccount, saveAccount } from "@elizaos/agent/auth/account-storage";
import { listProviderAccounts } from "@elizaos/agent/auth/credentials";
import {
  __resetDefaultAccountPoolForTests,
  AccountPool,
} from "@elizaos/app-core/account-pool";
import { describe, expect, it } from "vitest";
import { persistProviderCredentials } from "@/runtime/native/account-auth/store";
import {
  deleteDoolittleAccount,
  getDoolittleAccountPool,
  importCurrentDoolittleAccount,
  importLegacyDoolittleAccounts,
  initializeDoolittleAccountPool,
  setDoolittleAccountPoolStrategy,
  snapshotDoolittleAccountPool,
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

describe.sequential("Doolittle official account pool adapter", () => {
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
      persistProviderCredentials("codex", {
        accessToken: "codex-access-token",
        refreshToken: "codex-refresh-token",
        idToken: "codex-id-token",
        accountId: "chatgpt-account",
      });
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        refreshToken: "claude-refresh-token",
      });

      expect(importLegacyDoolittleAccounts()).toBe(2);
      expect(importLegacyDoolittleAccounts()).toBe(0);
      expect(
        loadAccount("openai-codex", "doolittle-legacy-codex")?.credentials,
      ).toMatchObject({
        access: "codex-access-token",
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
        accessToken: "updated-codex-access-token",
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
          access: "updated-codex-access-token",
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
        tokens: { id_token: "codex-id-token" },
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
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        refreshToken: "claude-refresh-token",
        expiresAt: String(expiresAt),
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
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        refreshToken: "claude-refresh-token",
        expiresAt,
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(Date.parse(expiresAt));
    }));

  it("forces refresh for missing Claude expiry when a refresh token exists", async () =>
    await withIsolatedAccountPool(() => {
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        refreshToken: "claude-refresh-token",
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(0);
    }));

  it("forces refresh for malformed Claude expiry when a refresh token exists", async () =>
    await withIsolatedAccountPool(() => {
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        refreshToken: "claude-refresh-token",
        expiresAt: "not-an-expiry",
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(0);
    }));

  it("uses a conservative fallback for non-refreshable Claude credentials", async () =>
    await withIsolatedAccountPool(() => {
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        expiresAt: "not-an-expiry",
      });

      expect(importLegacyDoolittleAccounts()).toBe(1);
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(Number.MAX_SAFE_INTEGER);
    }));

  it("repairs matching known legacy credentials after upgrade", async () =>
    await withIsolatedAccountPool(() => {
      const claudeExpiresAt = Date.now() + 3_600_000;
      persistProviderCredentials("codex", {
        accessToken: "codex-access-token",
        refreshToken: "codex-refresh-token",
        idToken: "codex-id-token",
      });
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        refreshToken: "claude-refresh-token",
        expiresAt: String(claudeExpiresAt),
      });
      expect(importLegacyDoolittleAccounts()).toBe(2);

      const codex = loadAccount("openai-codex", "doolittle-legacy-codex");
      const claude = loadAccount(
        "anthropic-subscription",
        "doolittle-legacy-claude-code",
      );
      if (!codex || !claude)
        throw new Error("legacy accounts were not imported");
      saveAccount({
        ...codex,
        credentials: { ...codex.credentials, idToken: undefined },
      });
      saveAccount({
        ...claude,
        credentials: {
          ...claude.credentials,
          expires: Number.MAX_SAFE_INTEGER,
        },
      });

      expect(importLegacyDoolittleAccounts()).toBe(2);
      expect(
        loadAccount("openai-codex", "doolittle-legacy-codex")?.credentials
          .idToken,
      ).toBe("codex-id-token");
      expect(
        loadAccount("anthropic-subscription", "doolittle-legacy-claude-code")
          ?.credentials.expires,
      ).toBe(claudeExpiresAt);
    }));

  it("does not repair known legacy records when singleton credentials do not match", async () =>
    await withIsolatedAccountPool(() => {
      persistProviderCredentials("codex", {
        accessToken: "current-access-token",
        refreshToken: "current-refresh-token",
        idToken: "current-id-token",
      });
      saveAccount({
        id: "doolittle-legacy-codex",
        providerId: "openai-codex",
        label: "Imported Codex account",
        source: "oauth",
        credentials: {
          access: "other-access-token",
          refresh: "other-refresh-token",
          expires: Number.MAX_SAFE_INTEGER,
        },
        createdAt: 1,
        updatedAt: 1,
      });

      expect(importLegacyDoolittleAccounts()).toBe(0);
      expect(
        loadAccount("openai-codex", "doolittle-legacy-codex"),
      ).toMatchObject({
        credentials: {
          access: "other-access-token",
          refresh: "other-refresh-token",
        },
      });
      expect(
        loadAccount("openai-codex", "doolittle-legacy-codex")?.credentials
          .idToken,
      ).toBeUndefined();
    }));
});
