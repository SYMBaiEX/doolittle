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
  loginCommand?: string;
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

interface CliAuthStatus {
  available: boolean;
  loggedIn: boolean;
  detail?: string;
  authMethod?: string;
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

function readCommandJson(
  command: string,
  args: string[],
  homePath?: string,
): unknown {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: resolveHome(homePath),
    },
  });
  if (result.status !== 0 || !result.stdout?.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

function readCommandText(
  command: string,
  args: string[],
  homePath?: string,
): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: resolveHome(homePath),
    },
  });
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function getCodexCliAuthStatus(homePath?: string): CliAuthStatus {
  if (!commandExists("codex")) {
    return {
      available: false,
      loggedIn: false,
    };
  }

  const output = readCommandText("codex", ["login", "status"], homePath);
  const lowered = output.toLowerCase();
  return {
    available: true,
    loggedIn: lowered.includes("logged in"),
    authMethod: lowered.includes("chatgpt") ? "chatgpt" : undefined,
    source: "codex login status",
    detail: output || "Codex CLI status is available.",
  };
}

function getClaudeCodeCliAuthStatus(homePath?: string): CliAuthStatus {
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
  const cliStatus = getCodexCliAuthStatus(homePath);
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
      loginCommand: "codex login",
      detail:
        "Signed-in Codex account detected through the local Codex CLI auth store.",
    };
  }

  return {
    provider: "codex",
    available: existsSync(authPath) || cliStatus.available,
    reusable: false,
    source: existsSync(authPath) ? authPath : undefined,
    authMode: authMode || cliStatus.authMethod,
    lastRefresh,
    loginCommand: "codex login",
    detail: existsSync(authPath)
      ? "Codex auth store exists, but no reusable access and refresh token pair was found."
      : cliStatus.loggedIn
        ? "Codex CLI reports a logged-in session, but Eliza Agent could not read a reusable local auth store yet."
        : cliStatus.available
          ? "Codex CLI is installed, but no reusable local signed-in auth store was found. Run `codex login`."
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
  const cliStatus = getClaudeCodeCliAuthStatus(homePath);
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
      loginCommand: "claude auth login",
      detail:
        "Refreshable Claude Code OAuth credentials are available from the local Claude CLI store.",
    };
  }

  if (accountLabel || existsSync(profilePath) || cliStatus.available) {
    return {
      provider: "claude-code",
      available: true,
      reusable: false,
      source: existsSync(credentialsPath)
        ? credentialsPath
        : existsSync(profilePath)
          ? profilePath
          : undefined,
      authMode:
        cliStatus.authMethod ||
        (existsSync(profilePath) ? "profile" : undefined),
      accountLabel,
      loginCommand: "claude auth login",
      detail: accountLabel
        ? cliStatus.loggedIn
          ? "Claude account profile is present and Claude CLI reports logged in, but no reusable OAuth credential store was found yet."
          : "Claude account profile is present locally, but no reusable refreshable credential store was found. Run `claude auth login`."
        : cliStatus.available
          ? cliStatus.loggedIn
            ? "Claude CLI reports a logged-in session, but Eliza Agent could not read a reusable OAuth credential store yet."
            : "Claude CLI is installed, but no reusable OAuth credential store was found. Run `claude auth login`."
          : "Claude CLI presence was detected, but no reusable OAuth credential store was found.",
    };
  }

  return {
    provider: "claude-code",
    available: false,
    reusable: false,
    loginCommand: "claude auth login",
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

export function getLinkedProviderLoginCommand(
  provider: "codex" | "claude-code",
): string {
  return provider === "codex" ? "codex login" : "claude auth login";
}
