import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  commandExists,
  DEFAULT_REFRESH_SKEW_SECONDS,
  isUnixMillisecondsExpiring,
  readCommandJson,
  readCommandText,
  readJson,
  resolveHome,
  writeJson,
} from "./shared";
import {
  getStoredClaudeCodeCredentials as getStoredClaudeCodeCredentialsFromStore,
  persistProviderCredentials as persistProviderCredentialsForProvider,
} from "./store";
import type { CliAuthStatus, LinkedClaudeCodeCredentials } from "./types";

const CLAUDE_CODE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_CODE_OAUTH_TOKEN_URL =
  "https://console.anthropic.com/v1/oauth/token";
const CLAUDE_CODE_ENV_KEYS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_SETUP_TOKEN",
] as const;

export { resolveHome } from "./shared";

export function persistProviderCredentials(
  credentials: LinkedClaudeCodeCredentials | undefined,
): void {
  persistProviderCredentialsForProvider("claude-code", credentials);
}

export function getStoredClaudeCodeCredentials():
  | LinkedClaudeCodeCredentials
  | undefined {
  return getStoredClaudeCodeCredentialsFromStore();
}

export function getClaudeCodeCliAuthStatus(homePath?: string): CliAuthStatus {
  if (!commandExists("claude")) {
    return {
      available: false,
      loggedIn: false,
    };
  }

  const payload = readCommandJson(
    "claude",
    ["auth", "status", "--json"],
    homePath,
  ) as
    | {
        loggedIn?: boolean;
        authMethod?: string;
        apiProvider?: string;
      }
    | undefined;
  if (!payload) {
    const text = readCommandText(
      "claude",
      ["auth", "status", "--text"],
      homePath,
    );
    return {
      available: true,
      loggedIn: /logged in/i.test(text),
      source: "claude auth status",
      detail: text || "Claude Code auth status is available.",
    };
  }

  return {
    available: true,
    loggedIn: Boolean(payload.loggedIn),
    authMethod:
      typeof payload.authMethod === "string" ? payload.authMethod : undefined,
    source: "claude auth status --json",
    detail: payload.loggedIn
      ? `Claude Code CLI reports logged in via ${payload.authMethod ?? "unknown"} auth.`
      : "Claude Code CLI reports no active login.",
  };
}

export function getClaudeCodeEnvToken():
  | { key: (typeof CLAUDE_CODE_ENV_KEYS)[number]; token: string }
  | undefined {
  for (const key of CLAUDE_CODE_ENV_KEYS) {
    const token = process.env[key]?.trim();
    if (token) {
      return { key, token };
    }
  }
  return undefined;
}

export function getClaudeCodeProfileLabel(
  homePath: string,
): string | undefined {
  const profilePath = join(homePath, ".claude.json");
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
  if (displayName && emailAddress) {
    return `${displayName} <${emailAddress}>`;
  }
  return displayName || emailAddress || undefined;
}

export function getClaudeCodeCredentialsPath(homePath?: string): string {
  return join(resolveHome(homePath), ".claude", ".credentials.json");
}

export function readClaudeCodeFileCredentials(
  homePath?: string,
): LinkedClaudeCodeCredentials | undefined {
  const home = resolveHome(homePath);
  const credentialsPath = getClaudeCodeCredentialsPath(homePath);
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

  if (!accessToken && !refreshToken) {
    return undefined;
  }

  return {
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    expiresAt: expiresAt || undefined,
    accountLabel: getClaudeCodeProfileLabel(home),
    authMode: "oauth",
    source: existsSync(credentialsPath) ? credentialsPath : profilePath,
  };
}

export async function refreshClaudeOAuthCredentialsFromRecord(
  refreshToken: string,
  source: string,
  accountLabel?: string,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  const response = await fetch(CLAUDE_CODE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "claude-cli/2.1.74 (external, cli)",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLAUDE_CODE_CLIENT_ID,
    }),
  });
  if (!response.ok) {
    return undefined;
  }
  const refreshPayload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!refreshPayload.access_token?.trim()) {
    return undefined;
  }
  const expiresInSeconds =
    typeof refreshPayload.expires_in === "number"
      ? refreshPayload.expires_in
      : 3600;
  return {
    accessToken: refreshPayload.access_token.trim(),
    refreshToken: refreshPayload.refresh_token?.trim() || refreshToken,
    expiresAt: String(Date.now() + expiresInSeconds * 1000),
    accountLabel,
    authMode: "oauth",
    source,
  };
}

export function claudeCodeAccessTokenIsExpiring(
  expiresAt?: string,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  const parsed = expiresAt ? Number(expiresAt) : Number.NaN;
  return isUnixMillisecondsExpiring(
    Number.isFinite(parsed) ? parsed : undefined,
    skewSeconds,
  );
}

export function writeClaudeCodeFileCredentials(
  homePath: string | undefined,
  refreshed: LinkedClaudeCodeCredentials,
): boolean {
  const credentialsPath = getClaudeCodeCredentialsPath(homePath);
  const payload = existsSync(credentialsPath)
    ? readJson(credentialsPath)
    : undefined;
  if (!payload || typeof payload !== "object") {
    return false;
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
  const updatedPayload = {
    ...(payload as Record<string, unknown>),
    claudeAiOauth: {
      ...oauth,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || refreshToken,
      expiresAt: refreshed.expiresAt
        ? Number(refreshed.expiresAt)
        : oauth.expiresAt,
    },
  };
  writeJson(credentialsPath, updatedPayload);
  return true;
}
