import { beforeEach, describe, expect, it, vi } from "vitest";

const accountPool = vi.hoisted(() => ({
  deleteDoolittleAccount: vi.fn(),
  importCurrentDoolittleAccount: vi.fn(),
  isAccountPoolProvider: vi.fn((value: unknown) => value === "openai-codex"),
  selectDoolittleAccount: vi.fn(),
  setDoolittleAccountPoolStrategy: vi.fn(),
  snapshotDoolittleAccountPool: vi.fn(),
  updateDoolittleAccount: vi.fn(),
}));

vi.mock("@/runtime/native/account-pool", () => accountPool);

import { handleRuntimeAccountRoutes } from "./accounts";

const context = {} as never;

describe("Doolittle account-pool routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("imports the current native login without accepting credential fields", async () => {
    accountPool.importCurrentDoolittleAccount.mockReturnValue({
      providerId: "openai-codex",
      accountId: "work",
      label: "Work",
    });
    accountPool.isAccountPoolProvider.mockReturnValue(true);
    const response = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/runtime/account-pool/openai-codex/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: "work",
          label: "Work",
          accessToken: "must-not-be-forwarded",
        }),
      }),
      new URL("http://localhost/runtime/account-pool/openai-codex/import"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      account: expect.objectContaining({ accountId: "work" }),
    });
    expect(accountPool.importCurrentDoolittleAccount).toHaveBeenCalledWith(
      "openai-codex",
      "work",
      "Work",
    );
  });

  it("persists strategy and reports credential deletion", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);
    accountPool.setDoolittleAccountPoolStrategy.mockReturnValue("round-robin");
    accountPool.deleteDoolittleAccount.mockResolvedValue(true);

    const strategy = await handleRuntimeAccountRoutes(
      context,
      new Request(
        "http://localhost/runtime/account-pool/openai-codex/strategy",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ strategy: "round-robin" }),
        },
      ),
      new URL("http://localhost/runtime/account-pool/openai-codex/strategy"),
    );
    await expect(strategy?.json()).resolves.toEqual({
      providerId: "openai-codex",
      strategy: "round-robin",
    });

    const deleted = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/runtime/account-pool/openai-codex/work", {
        method: "DELETE",
      }),
      new URL("http://localhost/runtime/account-pool/openai-codex/work"),
    );
    await expect(deleted?.json()).resolves.toEqual({
      deleted: true,
      credentialsRetained: false,
    });
  });
});
