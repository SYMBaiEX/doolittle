import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CodexAuthDependencies } from "../codex-support";
import { hasTokenCredentials } from "../credentials";
import type { OAuthRefreshResult } from "../oauth-refresh";
import { readJsonIfExists } from "../shared";
import {
  readNestedField,
  readTokenField,
  readTokenPair,
  trimTextOrUndefined,
} from "../token-loaders";
import type { CliAuthStatus, LinkedCodexCredentials } from "../types";

export const CODEX_LOGIN_COMMAND = "codex login";
export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

export interface CodexCliStoreRecord {
  authPath: string;
  authFilePresent: boolean;
  payload?: unknown;
  accessToken?: string;
  refreshToken?: string;
  authMode?: string;
  lastRefresh?: string;
}

export function getCodexAuthPath(
  homePath: string | undefined,
  deps: Pick<CodexAuthDependencies, "resolveHome">,
): string {
  return join(deps.resolveHome(homePath), ".codex", "auth.json");
}

export function getCodexCliAuthStatus(
  homePath: string | undefined,
  deps: Pick<CodexAuthDependencies, "commandExists" | "readCommandText">,
): CliAuthStatus {
  if (!deps.commandExists("codex")) {
    return {
      available: false,
      loggedIn: false,
    };
  }

  const output = deps.readCommandText("codex", ["login", "status"], homePath);
  const lowered = output.toLowerCase();
  return {
    available: true,
    loggedIn: lowered.includes("logged in"),
    authMethod: lowered.includes("chatgpt") ? "chatgpt" : undefined,
    source: "codex login status",
    detail: output || "Codex CLI status is available.",
  };
}

export function readCodexCliStore(
  homePath: string | undefined,
  deps: Pick<CodexAuthDependencies, "resolveHome" | "readJson">,
): CodexCliStoreRecord {
  const authPath = getCodexAuthPath(homePath, deps);
  const payload = readJsonIfExists(authPath, deps.readJson);
  const tokens = readNestedField(payload, ["tokens"]);

  return {
    authPath,
    authFilePresent: existsSync(authPath),
    payload,
    ...readTokenPair(tokens, "access_token", "refresh_token"),
    authMode: readTokenField(payload, "auth_mode"),
    lastRefresh: readTokenField(payload, "last_refresh"),
  };
}

export function getCodexCliCredentials(
  store: CodexCliStoreRecord,
): LinkedCodexCredentials | undefined {
  if (!hasTokenCredentials(store)) {
    return undefined;
  }

  return {
    accessToken: store.accessToken,
    refreshToken: store.refreshToken,
    authMode: store.authMode,
    lastRefresh: store.lastRefresh,
    source: store.authPath,
  };
}

export function writeRefreshedCodexCliStore(
  store: CodexCliStoreRecord,
  refreshed: OAuthRefreshResult,
  deps: Pick<CodexAuthDependencies, "writeJson">,
): boolean {
  if (!store.payload || typeof store.payload !== "object") {
    return false;
  }

  deps.writeJson(store.authPath, {
    ...(store.payload as Record<string, unknown>),
    tokens: {
      ...readNestedField(store.payload, ["tokens"]),
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
    },
    last_refresh: trimTextOrUndefined(new Date().toISOString()),
  });
  return true;
}
