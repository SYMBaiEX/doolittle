import { beforeEach, describe, expect, it, vi } from "vitest";

const accountPool = vi.hoisted(() => ({
  applyAccountPoolApiCredentials: vi.fn(),
  deleteDoolittleAccount: vi.fn(),
  importDoolittleApiAccount: vi.fn(),
  importCurrentDoolittleAccount: vi.fn(),
  isDoolittleDirectApiProvider: vi.fn(
    (value: unknown) => value === "openai-api" || value === "anthropic-api",
  ),
  isAccountPoolProvider: vi.fn((value: unknown) => value === "openai-codex"),
  reconcileDoolittleAccountPoolCredentials: vi.fn(),
  refreshDoolittleAccountUsage: vi.fn(),
  selectDoolittleAccount: vi.fn(),
  setDoolittleAccountPoolStrategy: vi.fn(),
  snapshotDoolittleAccountPool: vi.fn(),
  synchronizeDoolittleAccountPoolFromNativeStores: vi.fn(),
  testDoolittleAccountCredentials: vi.fn(),
  updateDoolittleAccount: vi.fn(),
}));

vi.mock("@/runtime/native/account-pool", () => accountPool);
const secrets = vi.hoisted(() => ({ getEffectiveSecret: vi.fn() }));
vi.mock("@/runtime/native/service-bridge/autocoder", () => secrets);

import { handleRuntimeAccountRoutes } from "./accounts";

const runtime = {};
const context = {
  runtime,
  services: { settings: { get: () => ({ model: { provider: "openai" } }) } },
} as never;

describe("Doolittle account-pool routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountPool.isDoolittleDirectApiProvider.mockImplementation(
      (value: unknown) => value === "openai-api" || value === "anthropic-api",
    );
  });

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

  it("resolves a named secret server-side for direct API account import", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);
    secrets.getEffectiveSecret.mockResolvedValue("sk-server-secret");
    accountPool.importDoolittleApiAccount.mockReturnValue({
      accountId: "api-work",
      providerId: "openai-api",
      label: "API Work",
      source: "api-key",
    });

    const response = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/runtime/account-pool/openai-api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: "api-work",
          label: "API Work",
          secretKeyName: "OPENAI_API_KEY",
        }),
      }),
      new URL("http://localhost/runtime/account-pool/openai-api/import"),
    );

    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body).toEqual({
      account: expect.objectContaining({ accountId: "api-work" }),
    });
    expect(JSON.stringify(body)).not.toContain("sk-server-secret");
    expect(secrets.getEffectiveSecret).toHaveBeenCalledWith(
      runtime,
      "OPENAI_API_KEY",
    );
    expect(accountPool.importDoolittleApiAccount).toHaveBeenCalledWith(
      "openai-api",
      "api-work",
      "API Work",
      "sk-server-secret",
    );
    expect(accountPool.applyAccountPoolApiCredentials).toHaveBeenCalledOnce();
    expect(accountPool.applyAccountPoolApiCredentials).toHaveBeenCalledWith({
      activeBackend: "openai",
    });
  });

  it("rejects refresh-usage for direct API accounts", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);

    const response = await handleRuntimeAccountRoutes(
      context,
      new Request(
        "http://localhost/runtime/account-pool/openai-api/api-work/refresh-usage",
        { method: "POST" },
      ),
      new URL(
        "http://localhost/runtime/account-pool/openai-api/api-work/refresh-usage",
      ),
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      error: "usage refresh is unavailable for API-key accounts",
    });
    expect(accountPool.refreshDoolittleAccountUsage).not.toHaveBeenCalled();
  });

  it("rejects secret names that are not environment-style identifiers", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);

    const response = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/runtime/account-pool/openai-api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: "api-work",
          label: "API Work",
          secretKeyName: "../../secret",
        }),
      }),
      new URL("http://localhost/runtime/account-pool/openai-api/import"),
    );

    expect(response?.status).toBe(400);
    expect(secrets.getEffectiveSecret).not.toHaveBeenCalled();
    expect(accountPool.importDoolittleApiAccount).not.toHaveBeenCalled();
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

  it("reprojects direct API credentials after pool mutations", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);
    accountPool.isDoolittleDirectApiProvider.mockReturnValue(true);
    accountPool.updateDoolittleAccount.mockResolvedValue({
      accountId: "work",
      providerId: "openai-api",
      enabled: false,
    });
    accountPool.deleteDoolittleAccount.mockResolvedValue(true);

    const updated = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/runtime/account-pool/openai-api/work", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/runtime/account-pool/openai-api/work"),
    );
    expect(updated?.status).toBe(200);

    const deleted = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/runtime/account-pool/openai-api/work", {
        method: "DELETE",
      }),
      new URL("http://localhost/runtime/account-pool/openai-api/work"),
    );
    expect(deleted?.status).toBe(200);
    expect(accountPool.applyAccountPoolApiCredentials).toHaveBeenCalledTimes(2);
    expect(accountPool.applyAccountPoolApiCredentials).toHaveBeenLastCalledWith(
      { activeBackend: "openai" },
    );
  });

  it("serializes account-pool mutations that project process credentials", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);
    accountPool.isDoolittleDirectApiProvider.mockReturnValue(true);
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    accountPool.updateDoolittleAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          releases.push(() => {
            active -= 1;
            resolve({
              accountId: `account-${releases.length}`,
              providerId: "openai-api",
              enabled: true,
            });
          });
        }),
    );

    const request = () =>
      handleRuntimeAccountRoutes(
        context,
        new Request("http://localhost/runtime/account-pool/openai-api/work", {
          method: "PATCH",
          body: JSON.stringify({ enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        new URL("http://localhost/runtime/account-pool/openai-api/work"),
      );

    const first = request();
    const second = request();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maximumActive).toBe(1);
    expect(accountPool.updateDoolittleAccount).toHaveBeenCalledOnce();

    releases.shift()?.();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(accountPool.updateDoolittleAccount).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await second;
    expect(maximumActive).toBe(1);
  });

  it("tests credentials and refreshes usage without exposing credentials", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);
    accountPool.testDoolittleAccountCredentials.mockResolvedValue({
      ok: true,
      latencyMs: 12,
    });
    accountPool.refreshDoolittleAccountUsage.mockResolvedValue({
      source: "pool",
      account: { accountId: "work", providerId: "openai-codex" },
    });

    const tested = await handleRuntimeAccountRoutes(
      context,
      new Request(
        "http://localhost/runtime/account-pool/openai-codex/work/test",
        {
          method: "POST",
        },
      ),
      new URL("http://localhost/runtime/account-pool/openai-codex/work/test"),
    );
    expect(tested?.status).toBe(200);
    await expect(tested?.json()).resolves.toEqual({ ok: true, latencyMs: 12 });
    expect(accountPool.testDoolittleAccountCredentials).toHaveBeenCalledWith(
      "openai-codex",
      "work",
    );

    const refreshed = await handleRuntimeAccountRoutes(
      context,
      new Request(
        "http://localhost/runtime/account-pool/openai-codex/work/refresh-usage",
        { method: "POST" },
      ),
      new URL(
        "http://localhost/runtime/account-pool/openai-codex/work/refresh-usage",
      ),
    );
    expect(refreshed?.status).toBe(200);
    await expect(refreshed?.json()).resolves.toEqual({
      source: "pool",
      account: { accountId: "work", providerId: "openai-codex" },
    });
  });

  it("returns sanitized account action failures as inspectable results", async () => {
    accountPool.isAccountPoolProvider.mockReturnValue(true);
    accountPool.testDoolittleAccountCredentials.mockResolvedValue({
      ok: false,
      latencyMs: 4,
      error: "Unable to resolve credentials for this account.",
    });

    const response = await handleRuntimeAccountRoutes(
      context,
      new Request(
        "http://localhost/runtime/account-pool/openai-codex/work/test",
        { method: "POST" },
      ),
      new URL("http://localhost/runtime/account-pool/openai-codex/work/test"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      latencyMs: 4,
      error: "Unable to resolve credentials for this account.",
    });
  });

  it("reconciles pool health after refreshing the native laptop login", async () => {
    const routeShared = await import("./shared");
    const refresh = vi
      .spyOn(routeShared, "refreshAccounts")
      .mockResolvedValue({ codex: { reusable: true } } as never);

    const response = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/accounts/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "codex" }),
      }),
      new URL("http://localhost/accounts/refresh"),
    );

    expect(response?.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith(context, "codex");
    expect(
      accountPool.reconcileDoolittleAccountPoolCredentials,
    ).toHaveBeenCalledWith("openai-codex");
  });

  it("reuses one provider snapshot for account status and connect advice", async () => {
    const routeShared = await import("./shared");
    const accounts = {
      codex: { provider: "codex", available: true, reusable: true },
      claudeCode: {
        provider: "claude-code",
        available: false,
        reusable: false,
      },
      devin: { provider: "devin", available: false, reusable: false },
      elizaCloud: {
        provider: "elizacloud",
        available: false,
        reusable: false,
      },
    } as never;
    const getSnapshot = vi
      .spyOn(routeShared, "getAccountsSnapshot")
      .mockReturnValue(accounts);
    const buildAdvice = vi.spyOn(routeShared, "buildAccountConnectAdvice");
    const readContext = {
      services: {
        settings: { get: () => ({ model: { provider: "codex" } }) },
      },
    } as never;

    const response = await handleRuntimeAccountRoutes(
      readContext,
      new Request("http://localhost/runtime/accounts"),
      new URL("http://localhost/runtime/accounts"),
    );

    expect(response?.status).toBe(200);
    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(buildAdvice).toHaveBeenCalledOnce();
    expect(buildAdvice).toHaveBeenCalledWith(accounts);
  });

  it("reuses one login-details snapshot for setup-token guidance", async () => {
    const routeShared = await import("./shared");
    const details = {
      provider: "claude-code",
      setupCommand: "claude setup-token",
      advice: { ready: false },
      accounts: { claudeCode: { reusable: false } },
    } as never;
    const getDetails = vi
      .spyOn(routeShared, "getAccountLoginDetails")
      .mockReturnValue(details);
    const getSnapshot = vi.spyOn(routeShared, "getAccountsSnapshot");

    const response = await handleRuntimeAccountRoutes(
      context,
      new Request("http://localhost/accounts/setup-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "claude-code" }),
      }),
      new URL("http://localhost/accounts/setup-token"),
    );

    expect(response?.status).toBe(200);
    expect(getDetails).toHaveBeenCalledOnce();
    expect(getSnapshot).not.toHaveBeenCalled();
    await expect(response?.json()).resolves.toEqual({
      provider: "claude-code",
      command: "claude setup-token",
      advice: { ready: false },
      accounts: { claudeCode: { reusable: false } },
    });
  });
});
