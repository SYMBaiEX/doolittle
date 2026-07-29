import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CodexAuthDependencies } from "../codex-support";
import { getCodexAuthDependencies } from "../codex-support";
import {
  getCodexCliAuthStatus,
  getCodexCliCredentials,
  readCodexCliStore,
  writeRefreshedCodexCliStore,
} from "./local";

function createCodexDeps({
  homePath,
  cliAvailable = false,
  cliOutput = "",
}: {
  homePath: string;
  cliAvailable?: boolean;
  cliOutput?: string;
}): CodexAuthDependencies {
  const base = getCodexAuthDependencies();
  return {
    ...base,
    resolveHome: () => homePath,
    commandExists: () => cliAvailable,
    readCommandText: () => cliOutput,
  };
}

describe.sequential("codex local auth helpers", () => {
  it("reads local Codex auth store credentials and metadata", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-codex-local-"));
    const authPath = join(homePath, ".codex", "auth.json");

    mkdirSync(join(homePath, ".codex"), { recursive: true });
    writeFileSync(
      authPath,
      JSON.stringify({
        auth_mode: "chatgpt",
        last_refresh: "2026-03-21T12:00:00.000Z",
        tokens: {
          access_token: " access-token ",
          refresh_token: " refresh-token ",
          account_id: " account-123 ",
          extra_token_field: "keep-me",
        },
      }),
      "utf8",
    );

    const store = readCodexCliStore(homePath, createCodexDeps({ homePath }));

    expect(store).toEqual(
      expect.objectContaining({
        authPath,
        authFilePresent: true,
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accountId: "account-123",
        authMode: "chatgpt",
        lastRefresh: "2026-03-21T12:00:00.000Z",
      }),
    );
    expect(getCodexCliCredentials(store)).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accountId: "account-123",
      authMode: "chatgpt",
      lastRefresh: "2026-03-21T12:00:00.000Z",
      source: authPath,
    });
  });

  it("parses Codex CLI login status output", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-codex-cli-"));
    const status = getCodexCliAuthStatus(
      homePath,
      createCodexDeps({
        homePath,
        cliAvailable: true,
        cliOutput: "Logged in with ChatGPT",
      }),
    );

    expect(status).toEqual({
      available: true,
      loggedIn: true,
      authMethod: "chatgpt",
      source: "codex login status",
      detail: "Logged in with ChatGPT",
    });
  });

  it("writes refreshed Codex tokens while preserving other auth payload fields", () => {
    const homePath = mkdtempSync(join(tmpdir(), "doolittle-codex-refresh-"));
    const authPath = join(homePath, ".codex", "auth.json");
    const deps = createCodexDeps({ homePath });

    mkdirSync(join(homePath, ".codex"), { recursive: true });
    writeFileSync(
      authPath,
      JSON.stringify({
        auth_mode: "chatgpt",
        active_workspace: "ops",
        last_refresh: "2026-03-21T12:00:00.000Z",
        tokens: {
          access_token: "stale-access",
          refresh_token: "stale-refresh",
          account_id: "account-123",
          extra_token_field: "keep-me",
        },
      }),
      "utf8",
    );

    const wrote = writeRefreshedCodexCliStore(
      readCodexCliStore(homePath, deps),
      {
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
      },
      deps,
    );

    const payload = JSON.parse(readFileSync(authPath, "utf8")) as {
      active_workspace?: string;
      last_refresh?: string;
      tokens?: {
        access_token?: string;
        refresh_token?: string;
        account_id?: string;
        extra_token_field?: string;
      };
    };

    expect(wrote).toBe(true);
    expect(payload.active_workspace).toBe("ops");
    expect(payload.tokens).toEqual(
      expect.objectContaining({
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        account_id: "account-123",
        extra_token_field: "keep-me",
      }),
    );
    expect(payload.last_refresh).toBeTruthy();
    expect(payload.last_refresh).not.toBe("2026-03-21T12:00:00.000Z");
  });
});
