import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

export function getLinkedProviderAccountsSnapshot(
  homePath?: string,
): LinkedProviderAccountsSnapshot {
  return {
    codex: getCodexAccountStatus(homePath),
    claudeCode: getClaudeCodeAccountStatus(homePath),
  };
}
