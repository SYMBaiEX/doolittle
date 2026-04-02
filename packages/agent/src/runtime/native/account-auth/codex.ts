import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  CliAuthStatus,
  LinkedCodexCredentials,
  LinkedProviderAccountStatus,
} from "./types";

const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

interface CodexAuthDependencies {
  defaultRefreshSkewSeconds: number;
  resolveHome(homePath?: string): string;
  commandExists(command: string): boolean;
  readCommandText(command: string, args: string[], homePath?: string): string;
  readJson(path: string): unknown;
  writeJson(path: string, value: unknown): void;
  readProviderAuthStore(): {
    providers: Partial<{
      codex: LinkedCodexCredentials & { storedAt?: string };
    }>;
  };
  persistProviderCredentials(
    provider: "codex",
    credentials: LinkedCodexCredentials | undefined,
  ): void;
  decodeJwtPayload(token?: string): Record<string, unknown> | undefined;
  isUnixSecondsExpiring(
    expiresAtSeconds?: number,
    skewSeconds?: number,
  ): boolean;
}

function getStoredCodexCredentials(
  deps: CodexAuthDependencies,
): LinkedCodexCredentials | undefined {
  const record = deps.readProviderAuthStore().providers.codex;
  if (!record?.accessToken && !record?.refreshToken) {
    return undefined;
  }
  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    authMode: record.authMode,
    lastRefresh: record.lastRefresh,
    source: "eliza-auth-store",
  };
}

function getCodexCliAuthStatus(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
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

function readCodexCliStore(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
): {
  authPath: string;
  accessToken?: string;
  refreshToken?: string;
  authMode?: string;
  lastRefresh?: string;
} {
  const authPath = join(deps.resolveHome(homePath), ".codex", "auth.json");
  const payload = existsSync(authPath) ? deps.readJson(authPath) : undefined;
  const tokens =
    payload && typeof payload === "object" && "tokens" in payload
      ? (payload as { tokens?: Record<string, unknown> }).tokens
      : undefined;
  return {
    authPath,
    accessToken:
      tokens && typeof tokens.access_token === "string"
        ? tokens.access_token.trim() || undefined
        : undefined,
    refreshToken:
      tokens && typeof tokens.refresh_token === "string"
        ? tokens.refresh_token.trim() || undefined
        : undefined,
    authMode:
      payload && typeof payload === "object" && "auth_mode" in payload
        ? String((payload as { auth_mode?: unknown }).auth_mode ?? "") ||
          undefined
        : undefined,
    lastRefresh:
      payload && typeof payload === "object" && "last_refresh" in payload
        ? String((payload as { last_refresh?: unknown }).last_refresh ?? "") ||
          undefined
        : undefined,
  };
}

export function getCodexAccountStatus(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
): LinkedProviderAccountStatus {
  const stored = getStoredCodexCredentials(deps);
  if (stored?.accessToken || stored?.refreshToken) {
    return {
      provider: "codex",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: stored.source,
      authMode: stored.authMode || "chatgpt",
      lastRefresh: stored.lastRefresh,
      loginCommand: "codex login",
      detail:
        "Eliza-managed Codex credentials are available in the local provider auth store.",
    };
  }

  const cliStore = readCodexCliStore(homePath, deps);
  const cliStatus = getCodexCliAuthStatus(homePath, deps);

  if (cliStore.accessToken || cliStore.refreshToken) {
    return {
      provider: "codex",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: cliStore.authPath,
      authMode: cliStore.authMode || "chatgpt",
      lastRefresh: cliStore.lastRefresh,
      loginCommand: "codex login",
      detail:
        "Signed-in Codex account detected through the local Codex CLI auth store.",
    };
  }

  return {
    provider: "codex",
    available: existsSync(cliStore.authPath) || cliStatus.available,
    reusable: false,
    nativeReady: false,
    fallbackReady: false,
    source: existsSync(cliStore.authPath) ? cliStore.authPath : undefined,
    authMode: cliStore.authMode || cliStatus.authMethod,
    lastRefresh: cliStore.lastRefresh,
    loginCommand: "codex login",
    detail: existsSync(cliStore.authPath)
      ? "Codex auth store exists, but no reusable access and refresh token pair was found."
      : cliStatus.loggedIn
        ? "Codex CLI reports a logged-in session, but Doolittle could not read a reusable local auth store yet."
        : cliStatus.available
          ? "Codex CLI is installed, but no reusable local signed-in auth store was found. Run `codex login`."
          : "Codex CLI is not installed and no local auth store was found.",
  };
}

export function getLinkedCodexCredentials(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
): LinkedCodexCredentials | undefined {
  const stored = getStoredCodexCredentials(deps);
  if (stored?.accessToken || stored?.refreshToken) {
    return stored;
  }

  const cliStore = readCodexCliStore(homePath, deps);
  if (!cliStore.accessToken && !cliStore.refreshToken) {
    return undefined;
  }

  const resolved = {
    accessToken: cliStore.accessToken,
    refreshToken: cliStore.refreshToken,
    authMode: cliStore.authMode,
    lastRefresh: cliStore.lastRefresh,
    source: cliStore.authPath,
  };
  deps.persistProviderCredentials("codex", resolved);
  return resolved;
}

export function codexAccessTokenIsExpiring(
  accessToken: string | undefined,
  deps: CodexAuthDependencies,
  skewSeconds = deps.defaultRefreshSkewSeconds,
): boolean {
  const payload = deps.decodeJwtPayload(accessToken);
  const exp =
    payload && typeof payload.exp === "number" ? payload.exp : undefined;
  return deps.isUnixSecondsExpiring(exp, skewSeconds);
}

export async function refreshLinkedCodexCredentials(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
): Promise<LinkedCodexCredentials | undefined> {
  const authPath = join(deps.resolveHome(homePath), ".codex", "auth.json");
  const payload = existsSync(authPath) ? deps.readJson(authPath) : undefined;
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const tokens =
    "tokens" in payload
      ? { ...(payload as { tokens?: Record<string, unknown> }).tokens }
      : {};
  const refreshToken =
    typeof tokens.refresh_token === "string" ? tokens.refresh_token.trim() : "";
  if (!refreshToken) {
    return undefined;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CODEX_OAUTH_CLIENT_ID,
  });

  const response = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Codex OAuth refresh failed (${response.status}): ${detail}`,
    );
  }

  const refreshPayload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!refreshPayload.access_token?.trim()) {
    throw new Error(
      "Codex OAuth refresh response did not include access_token",
    );
  }

  deps.writeJson(authPath, {
    ...(payload as Record<string, unknown>),
    tokens: {
      ...tokens,
      access_token: refreshPayload.access_token.trim(),
      refresh_token: refreshPayload.refresh_token?.trim() || refreshToken,
    },
    last_refresh: new Date().toISOString(),
  });
  const resolved = getLinkedCodexCredentials(homePath, deps);
  deps.persistProviderCredentials("codex", resolved);
  return resolved;
}
