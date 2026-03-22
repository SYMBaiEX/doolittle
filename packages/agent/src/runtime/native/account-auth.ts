import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface LinkedProviderAccountStatus {
  provider: "codex" | "claude-code";
  available: boolean;
  reusable: boolean;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  detail: string;
}

export interface LinkedProviderAccountsSnapshot {
  codex: LinkedProviderAccountStatus;
  claudeCode: LinkedProviderAccountStatus;
}

export interface LinkedCodexCredentials {
  accessToken?: string;
  refreshToken?: string;
  authMode?: string;
  lastRefresh?: string;
  source?: string;
}

export interface LinkedClaudeCodeCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  accountLabel?: string;
  source?: string;
}

const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLAUDE_CODE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_CODE_OAUTH_TOKEN_URL =
  "https://console.anthropic.com/v1/oauth/token";
const DEFAULT_REFRESH_SKEW_SECONDS = 120;

function resolveHome(homePath?: string): string {
  return homePath?.trim() || process.env.HOME?.trim() || homedir();
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function decodeJwtPayload(token?: string): Record<string, unknown> | undefined {
  const parts = token?.split(".");
  if (!parts || parts.length < 2) {
    return undefined;
  }
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

function isUnixSecondsExpiring(
  expiresAtSeconds?: number,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  if (!expiresAtSeconds || !Number.isFinite(expiresAtSeconds)) {
    return false;
  }
  return Date.now() >= expiresAtSeconds * 1000 - skewSeconds * 1000;
}

function isUnixMsExpiring(
  expiresAtMs?: number,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  if (!expiresAtMs || !Number.isFinite(expiresAtMs)) {
    return false;
  }
  return Date.now() >= expiresAtMs - skewSeconds * 1000;
}

function getCodexAccountStatus(homePath?: string): LinkedProviderAccountStatus {
  const authPath = join(resolveHome(homePath), ".codex", "auth.json");
  const payload = existsSync(authPath) ? readJson(authPath) : undefined;
  const tokens =
    payload && typeof payload === "object" && "tokens" in payload
      ? (payload as { tokens?: Record<string, unknown> }).tokens
      : undefined;
  const accessToken =
    tokens && typeof tokens.access_token === "string"
      ? tokens.access_token.trim()
      : "";
  const refreshToken =
    tokens && typeof tokens.refresh_token === "string"
      ? tokens.refresh_token.trim()
      : "";
  const authMode =
    payload && typeof payload === "object" && "auth_mode" in payload
      ? String((payload as { auth_mode?: unknown }).auth_mode ?? "")
      : undefined;
  const lastRefresh =
    payload && typeof payload === "object" && "last_refresh" in payload
      ? String((payload as { last_refresh?: unknown }).last_refresh ?? "")
      : undefined;

  if (accessToken || refreshToken) {
    return {
      provider: "codex",
      available: true,
      reusable: true,
      source: authPath,
      authMode: authMode || "chatgpt",
      lastRefresh,
      detail:
        "Signed-in Codex account detected through the local Codex CLI auth store.",
    };
  }

  return {
    provider: "codex",
    available: existsSync(authPath) || commandExists("codex"),
    reusable: false,
    source: existsSync(authPath) ? authPath : undefined,
    authMode,
    lastRefresh,
    detail: existsSync(authPath)
      ? "Codex auth store exists, but no reusable access and refresh token pair was found."
      : commandExists("codex")
        ? "Codex CLI is installed, but no local signed-in auth store was found."
        : "Codex CLI is not installed and no local auth store was found.",
  };
}

export function getLinkedCodexCredentials(
  homePath?: string,
): LinkedCodexCredentials | undefined {
  const authPath = join(resolveHome(homePath), ".codex", "auth.json");
  const payload = existsSync(authPath) ? readJson(authPath) : undefined;
  const tokens =
    payload && typeof payload === "object" && "tokens" in payload
      ? (payload as { tokens?: Record<string, unknown> }).tokens
      : undefined;
  const accessToken =
    tokens && typeof tokens.access_token === "string"
      ? tokens.access_token.trim()
      : "";
  const refreshToken =
    tokens && typeof tokens.refresh_token === "string"
      ? tokens.refresh_token.trim()
      : "";
  const authMode =
    payload && typeof payload === "object" && "auth_mode" in payload
      ? String((payload as { auth_mode?: unknown }).auth_mode ?? "")
      : undefined;
  const lastRefresh =
    payload && typeof payload === "object" && "last_refresh" in payload
      ? String((payload as { last_refresh?: unknown }).last_refresh ?? "")
      : undefined;

  if (!accessToken && !refreshToken) {
    return undefined;
  }

  return {
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    authMode: authMode || undefined,
    lastRefresh: lastRefresh || undefined,
    source: authPath,
  };
}

export function codexAccessTokenIsExpiring(
  accessToken?: string,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  const payload = decodeJwtPayload(accessToken);
  const exp =
    payload && typeof payload.exp === "number" ? payload.exp : undefined;
  return isUnixSecondsExpiring(exp, skewSeconds);
}

export async function refreshLinkedCodexCredentials(
  homePath?: string,
): Promise<LinkedCodexCredentials | undefined> {
  const authPath = join(resolveHome(homePath), ".codex", "auth.json");
  const payload = existsSync(authPath) ? readJson(authPath) : undefined;
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

  const updatedPayload = {
    ...(payload as Record<string, unknown>),
    tokens: {
      ...tokens,
      access_token: refreshPayload.access_token.trim(),
      refresh_token: refreshPayload.refresh_token?.trim() || refreshToken,
    },
    last_refresh: new Date().toISOString(),
  };
  writeJson(authPath, updatedPayload);
  return getLinkedCodexCredentials(homePath);
}

function getClaudeCodeAccountStatus(
  homePath?: string,
): LinkedProviderAccountStatus {
  const home = resolveHome(homePath);
  const credentialsPath = join(home, ".claude", ".credentials.json");
  const profilePath = join(home, ".claude.json");
  const credentialsPayload = existsSync(credentialsPath)
    ? readJson(credentialsPath)
    : undefined;
  const oauth =
    credentialsPayload &&
    typeof credentialsPayload === "object" &&
    "claudeAiOauth" in credentialsPayload
      ? (credentialsPayload as { claudeAiOauth?: Record<string, unknown> })
          .claudeAiOauth
      : undefined;
  const accessToken =
    oauth && typeof oauth.accessToken === "string"
      ? oauth.accessToken.trim()
      : "";
  const refreshToken =
    oauth && typeof oauth.refreshToken === "string"
      ? oauth.refreshToken.trim()
      : "";
  const expiresAt =
    oauth && typeof oauth.expiresAt !== "undefined"
      ? String(oauth.expiresAt ?? "")
      : undefined;

  const profile = existsSync(profilePath) ? readJson(profilePath) : undefined;
  const account =
    profile && typeof profile === "object" && "oauthAccount" in profile
      ? (profile as { oauthAccount?: Record<string, unknown> }).oauthAccount
      : undefined;
  const displayName =
    account && typeof account.displayName === "string"
      ? account.displayName.trim()
      : "";
  const emailAddress =
    account && typeof account.emailAddress === "string"
      ? account.emailAddress.trim()
      : "";
  const accountLabel =
    displayName && emailAddress
      ? `${displayName} <${emailAddress}>`
      : displayName || emailAddress || undefined;

  if (accessToken || refreshToken) {
    return {
      provider: "claude-code",
      available: true,
      reusable: true,
      source: credentialsPath,
      authMode: "oauth",
      lastRefresh: expiresAt,
      accountLabel,
      detail:
        "Refreshable Claude Code OAuth credentials are available from the local Claude CLI store.",
    };
  }

  if (accountLabel || existsSync(profilePath) || commandExists("claude")) {
    return {
      provider: "claude-code",
      available: true,
      reusable: false,
      source: existsSync(credentialsPath)
        ? credentialsPath
        : existsSync(profilePath)
          ? profilePath
          : undefined,
      authMode: existsSync(profilePath) ? "profile" : undefined,
      accountLabel,
      detail: accountLabel
        ? "Claude account profile is present locally, but no reusable refreshable credential store was found."
        : "Claude CLI presence was detected, but no reusable OAuth credential store was found.",
    };
  }

  return {
    provider: "claude-code",
    available: false,
    reusable: false,
    detail: "No Claude Code CLI login artifacts were found on this machine.",
  };
}

export function getLinkedClaudeCodeCredentials(
  homePath?: string,
): LinkedClaudeCodeCredentials | undefined {
  const home = resolveHome(homePath);
  const credentialsPath = join(home, ".claude", ".credentials.json");
  const profilePath = join(home, ".claude.json");
  const credentialsPayload = existsSync(credentialsPath)
    ? readJson(credentialsPath)
    : undefined;
  const oauth =
    credentialsPayload &&
    typeof credentialsPayload === "object" &&
    "claudeAiOauth" in credentialsPayload
      ? (credentialsPayload as { claudeAiOauth?: Record<string, unknown> })
          .claudeAiOauth
      : undefined;
  const accessToken =
    oauth && typeof oauth.accessToken === "string"
      ? oauth.accessToken.trim()
      : "";
  const refreshToken =
    oauth && typeof oauth.refreshToken === "string"
      ? oauth.refreshToken.trim()
      : "";
  const expiresAt =
    oauth && typeof oauth.expiresAt !== "undefined"
      ? String(oauth.expiresAt ?? "")
      : undefined;

  const profile = existsSync(profilePath) ? readJson(profilePath) : undefined;
  const account =
    profile && typeof profile === "object" && "oauthAccount" in profile
      ? (profile as { oauthAccount?: Record<string, unknown> }).oauthAccount
      : undefined;
  const displayName =
    account && typeof account.displayName === "string"
      ? account.displayName.trim()
      : "";
  const emailAddress =
    account && typeof account.emailAddress === "string"
      ? account.emailAddress.trim()
      : "";
  const accountLabel =
    displayName && emailAddress
      ? `${displayName} <${emailAddress}>`
      : displayName || emailAddress || undefined;

  if (!accessToken && !refreshToken) {
    return undefined;
  }

  return {
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    expiresAt: expiresAt || undefined,
    accountLabel,
    source: existsSync(credentialsPath) ? credentialsPath : profilePath,
  };
}

export function claudeCodeAccessTokenIsExpiring(
  expiresAt?: string,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  const parsed = expiresAt ? Number(expiresAt) : NaN;
  return isUnixMsExpiring(
    Number.isFinite(parsed) ? parsed : undefined,
    skewSeconds,
  );
}

export async function refreshLinkedClaudeCodeCredentials(
  homePath?: string,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  const home = resolveHome(homePath);
  const credentialsPath = join(home, ".claude", ".credentials.json");
  const payload = existsSync(credentialsPath)
    ? readJson(credentialsPath)
    : undefined;
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const oauth =
    "claudeAiOauth" in payload
      ? {
          ...(payload as { claudeAiOauth?: Record<string, unknown> })
            .claudeAiOauth,
        }
      : {};
  const refreshToken =
    typeof oauth.refreshToken === "string" ? oauth.refreshToken.trim() : "";
  if (!refreshToken) {
    return undefined;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLAUDE_CODE_CLIENT_ID,
  });
  const response = await fetch(CLAUDE_CODE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "claude-cli/2.1.74 (external, cli)",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Claude Code OAuth refresh failed (${response.status}): ${detail}`,
    );
  }

  const refreshPayload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!refreshPayload.access_token?.trim()) {
    throw new Error(
      "Claude Code OAuth refresh response did not include access_token",
    );
  }

  const expiresInSeconds =
    typeof refreshPayload.expires_in === "number"
      ? refreshPayload.expires_in
      : 3600;
  const updatedPayload = {
    ...(payload as Record<string, unknown>),
    claudeAiOauth: {
      ...oauth,
      accessToken: refreshPayload.access_token.trim(),
      refreshToken: refreshPayload.refresh_token?.trim() || refreshToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    },
  };
  writeJson(credentialsPath, updatedPayload);
  return getLinkedClaudeCodeCredentials(homePath);
}

export function getLinkedProviderAccountsSnapshot(
  homePath?: string,
): LinkedProviderAccountsSnapshot {
  return {
    codex: getCodexAccountStatus(homePath),
    claudeCode: getClaudeCodeAccountStatus(homePath),
  };
}
