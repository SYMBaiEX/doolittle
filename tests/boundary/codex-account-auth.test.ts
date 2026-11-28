import type { CodexAuth } from "@elizaos/plugin-codex-cli";
import { expect, it, vi } from "vitest";
import {
  loadOfficialCodexAccountAuth,
  refreshOfficialCodexAccountAuth,
  selectOfficialCodexAccount,
} from "../../packages/agent/src/runtime/native/plugin-registry/codex-account-auth";

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-one",
    providerId: "openai-codex",
    label: "user@example.com",
    source: "oauth",
    credentials: {
      access: "official-access",
      refresh: "official-refresh",
      expires: Date.now() + 3_600_000,
    },
    createdAt: 1,
    updatedAt: 10,
    organizationId: "org-official",
    ...overrides,
  } as never;
}

function cliAuth(overrides: Record<string, unknown> = {}): CodexAuth {
  return {
    OPENAI_API_KEY: null,
    auth_mode: "chatgpt",
    last_refresh: "2026-01-01T00:00:00.000Z",
    tokens: {
      id_token: "",
      access_token: "cli-access",
      refresh_token: "cli-refresh",
      account_id: "cli-account",
    },
    ...overrides,
  } as CodexAuth;
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    listAccounts: vi.fn(() => []),
    resolveAccessToken: vi.fn(async () => "resolved-access"),
    loadCliAuth: vi.fn(async () => {
      throw new Error("ENOENT: no such file or directory");
    }),
    refreshCliAuth: vi.fn(async () => cliAuth()),
    storagePolicy: vi.fn(() => ({})),
    ...overrides,
  } as never;
}

it("prefers CLI-store credentials when the CLI auth file has a token pair", async () => {
  const deps = dependencies({
    listAccounts: vi.fn(() => [account()]),
    loadCliAuth: vi.fn(async () => cliAuth()),
  });
  const auth = await loadOfficialCodexAccountAuth("/tmp/auth.json", deps);
  expect(auth.tokens.access_token).toBe("cli-access");
});

it("resolves official account tokens when the CLI store is missing", async () => {
  const resolveAccessToken = vi.fn(async () => "resolved-access");
  const deps = dependencies({
    listAccounts: vi.fn(() => [account()]),
    resolveAccessToken,
  });
  const auth = await loadOfficialCodexAccountAuth("/tmp/auth.json", deps);
  expect(auth.tokens.access_token).toBe("resolved-access");
  expect(auth.tokens.account_id).toBe("org-official");
  // The rotating grant stays inside the official record; the execution copy
  // never carries it.
  expect(auth.tokens.refresh_token).toBe("");
  expect(resolveAccessToken).toHaveBeenCalledWith(
    "openai-codex",
    "account-one",
    expect.objectContaining({ storagePolicy: expect.anything() }),
  );
});

it("ignores malformed CLI auth files and uses the official account", async () => {
  const deps = dependencies({
    listAccounts: vi.fn(() => [account()]),
    loadCliAuth: vi.fn(async () => {
      throw new Error("codex auth.json malformed");
    }),
  });
  const auth = await loadOfficialCodexAccountAuth("/tmp/auth.json", deps);
  expect(auth.tokens.access_token).toBe("resolved-access");
});

it("rethrows the upstream CLI error when no credential source exists", async () => {
  const missing = vi.fn(async () => {
    throw new Error("ENOENT: no such file or directory");
  });
  const deps = dependencies({ loadCliAuth: missing });
  await expect(
    loadOfficialCodexAccountAuth("/tmp/auth.json", deps),
  ).rejects.toThrow("ENOENT");
  expect(missing).toHaveBeenCalledTimes(2);
});

it("rejects with sign-in guidance when the official account yields no token", async () => {
  const deps = dependencies({
    listAccounts: vi.fn(() => [account()]),
    resolveAccessToken: vi.fn(async () => null),
  });
  await expect(
    loadOfficialCodexAccountAuth("/tmp/auth.json", deps),
  ).rejects.toThrow("could not produce an access token");
});

it("prefers valid official accounts over expired ones", () => {
  const expired = account({
    id: "expired",
    updatedAt: 99,
    credentials: {
      access: "old-access",
      refresh: "old-refresh",
      expires: Date.now() - 1_000,
    },
  });
  const valid = account({ id: "valid", updatedAt: 1 });
  const selected = selectOfficialCodexAccount(
    vi.fn(() => [expired, valid]) as never,
    vi.fn(() => ({})) as never,
  );
  expect(selected?.id).toBe("valid");
});

it("reloads account-store sourced credentials through the official record", async () => {
  const resolveAccessToken = vi.fn(async () => "fresh-access");
  const deps = dependencies({
    listAccounts: vi.fn(() => [account()]),
    resolveAccessToken,
  });
  const refreshed = await refreshOfficialCodexAccountAuth(
    cliAuth({ tokens: { ...cliAuth().tokens, refresh_token: "" } }),
    "/tmp/auth.json",
    deps,
  );
  expect(refreshed.tokens.access_token).toBe("fresh-access");
});

it("keeps the CLI file refresh for CLI-sourced credentials", async () => {
  const refreshCliAuth = vi.fn(async () =>
    cliAuth({ tokens: { ...cliAuth().tokens, access_token: "cli-renewed" } }),
  );
  const deps = dependencies({
    listAccounts: vi.fn(() => [account()]),
    refreshCliAuth,
  });
  const refreshed = await refreshOfficialCodexAccountAuth(
    cliAuth(),
    "/tmp/auth.json",
    deps,
  );
  expect(refreshed.tokens.access_token).toBe("cli-renewed");
});

it("falls back to the official account when the CLI refresh grant is dead", async () => {
  const deps = dependencies({
    listAccounts: vi.fn(() => [account()]),
    refreshCliAuth: vi.fn(async () => {
      throw new Error("refresh failed: 401");
    }),
    resolveAccessToken: vi.fn(async () => "fallback-access"),
  });
  const refreshed = await refreshOfficialCodexAccountAuth(
    cliAuth(),
    "/tmp/auth.json",
    deps,
  );
  expect(refreshed.tokens.access_token).toBe("fallback-access");
});

it("propagates the CLI refresh failure when no official account exists", async () => {
  const deps = dependencies({
    refreshCliAuth: vi.fn(async () => {
      throw new Error("refresh failed: 401");
    }),
  });
  await expect(
    refreshOfficialCodexAccountAuth(cliAuth(), "/tmp/auth.json", deps),
  ).rejects.toThrow("refresh failed: 401");
});
