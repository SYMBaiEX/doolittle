import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        accountId: "chatgpt-account",
      });
      persistProviderCredentials("claude-code", {
        accessToken: "claude-access-token",
        refreshToken: "claude-refresh-token",
      });

      expect(importLegacyDoolittleAccounts()).toBe(2);
      expect(importLegacyDoolittleAccounts()).toBe(0);
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
      initializeDoolittleAccountPool(process.env.DOOLITTLE_DATA_DIR);
      setDoolittleAccountPoolStrategy("openai-codex", "round-robin");
      const bridge = (
        globalThis as Record<
          symbol,
          { select(agentType: string): Promise<unknown> }
        >
      )[Symbol.for("eliza.account-pool.coding-agent.v1")];
      expect(await bridge.select("codex")).toMatchObject({
        accountId: "doolittle-legacy-codex",
        strategy: "round-robin",
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
});
