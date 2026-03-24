import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveCloudApiBaseUrl } from "@elizaos/agent/cloud/base-url";

export interface LinkedProviderAccountStatus {
  provider: "codex" | "claude-code" | "elizacloud";
  available: boolean;
  reusable: boolean;
  nativeReady?: boolean;
  fallbackReady?: boolean;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  loginCommand?: string;
  setupCommand?: string;
  detail: string;
}

export interface LinkedProviderAccountsSnapshot {
  codex: LinkedProviderAccountStatus;
  claudeCode: LinkedProviderAccountStatus;
  elizaCloud: LinkedProviderAccountStatus;
}

export interface LinkedProviderConnectAdvice {
  provider: "codex" | "claude-code" | "elizacloud";
  status: LinkedProviderAccountStatus;
  ready: boolean;
  preferredAction: "use" | "refresh" | "login" | "setup-token";
  primaryCommand?: string;
  secondaryCommand?: string;
  detail: string;
}

interface ProviderAuthStoreShape {
  version: 1;
  providers: Partial<{
    codex: LinkedCodexCredentials & { storedAt?: string };
    "claude-code": LinkedClaudeCodeCredentials & { storedAt?: string };
    elizacloud: LinkedElizaCloudCredentials & { storedAt?: string };
  }>;
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
  authMode?: string;
  source?: string;
}

export interface LinkedElizaCloudCredentials {
  apiKey?: string;
  source?: string;
  authMode?: string;
  baseUrl?: string;
}

const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLAUDE_CODE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_CODE_OAUTH_TOKEN_URL =
  "https://console.anthropic.com/v1/oauth/token";
const DEFAULT_REFRESH_SKEW_SECONDS = 120;
const CLAUDE_CODE_ENV_KEYS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_SETUP_TOKEN",
] as const;
const PROVIDER_AUTH_STORE_VERSION = 1 as const;

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

function getClaudeCodeEnvToken(): { key: string; token: string } | undefined {
  for (const key of CLAUDE_CODE_ENV_KEYS) {
    const token = process.env[key]?.trim();
    if (token) {
      return { key, token };
    }
  }
  return undefined;
}

function getElizaCloudEnvKey():
  | {
      key: string;
      value: string;
    }
  | undefined {
  for (const key of ["ELIZAOS_CLOUD_API_KEY", "ELIZA_CLOUD_API_KEY"] as const) {
    const value = process.env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return undefined;
}

function isElizaCloudInferenceEnabled(): boolean {
  const value = process.env.ELIZAOS_CLOUD_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
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

function getProviderAuthStorePath(): string {
  const dataDir =
    process.env.ELIZA_AGENT_DATA_DIR?.trim() ||
    process.env.ELIZA_AGENT_DATA_PATH?.trim() ||
    ".eliza-agent";
  return join(process.cwd(), dataDir, "auth", "providers.json");
}

function readProviderAuthStore(): ProviderAuthStoreShape {
  const path = getProviderAuthStorePath();
  const payload = existsSync(path) ? readJson(path) : undefined;
  if (
    payload &&
    typeof payload === "object" &&
    "providers" in payload &&
    typeof (payload as { providers?: unknown }).providers === "object"
  ) {
    return payload as ProviderAuthStoreShape;
  }
  return {
    version: PROVIDER_AUTH_STORE_VERSION,
    providers: {},
  };
}

function writeProviderAuthStore(store: ProviderAuthStoreShape): void {
  writeJson(getProviderAuthStorePath(), store);
}

function persistProviderCredentials(
  provider: "codex" | "claude-code" | "elizacloud",
  credentials:
    | (
        | LinkedCodexCredentials
        | LinkedClaudeCodeCredentials
        | LinkedElizaCloudCredentials
      )
    | undefined,
): void {
  if (!credentials) {
    return;
  }
  if (
    typeof (credentials as LinkedElizaCloudCredentials).apiKey !== "undefined"
  ) {
    if (!(credentials as LinkedElizaCloudCredentials).apiKey) {
      return;
    }
  } else if (
    !(credentials as LinkedCodexCredentials | LinkedClaudeCodeCredentials)
      .accessToken &&
    !(credentials as LinkedCodexCredentials | LinkedClaudeCodeCredentials)
      .refreshToken
  ) {
    return;
  }
  const store = readProviderAuthStore();
  store.providers[provider] = {
    ...credentials,
    ...((provider === "elizacloud" &&
    "baseUrl" in credentials &&
    typeof credentials.baseUrl === "string" &&
    credentials.baseUrl.trim()
      ? {
          baseUrl: resolveCloudApiBaseUrl(credentials.baseUrl),
        }
      : {}) as object),
    storedAt: new Date().toISOString(),
  } as never;
  writeProviderAuthStore(store);
}

function getStoredCodexCredentials(): LinkedCodexCredentials | undefined {
  const record = readProviderAuthStore().providers.codex;
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

function getStoredClaudeCodeCredentials():
  | LinkedClaudeCodeCredentials
  | undefined {
  const record = readProviderAuthStore().providers["claude-code"];
  if (!record?.accessToken && !record?.refreshToken) {
    return undefined;
  }
  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt: record.expiresAt,
    accountLabel: record.accountLabel,
    authMode: record.authMode,
    source: "eliza-auth-store",
  };
}

function getStoredElizaCloudCredentials():
  | LinkedElizaCloudCredentials
  | undefined {
  const record = readProviderAuthStore().providers.elizacloud;
  if (!record || !("apiKey" in record) || !record.apiKey) {
    return undefined;
  }
  return {
    apiKey: record.apiKey,
    authMode: record.authMode,
    baseUrl: resolveCloudApiBaseUrl(record.baseUrl),
    source: "eliza-auth-store",
  };
}

async function refreshClaudeOAuthCredentialsFromRecord(
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
  const stored = getStoredCodexCredentials();
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
      nativeReady: true,
      fallbackReady: false,
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
    nativeReady: false,
    fallbackReady: false,
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
  const stored = getStoredCodexCredentials();
  if (stored?.accessToken || stored?.refreshToken) {
    return stored;
  }

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

  const resolved = {
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    authMode: authMode || undefined,
    lastRefresh: lastRefresh || undefined,
    source: authPath,
  };
  persistProviderCredentials("codex", resolved);
  return resolved;
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
  const resolved = getLinkedCodexCredentials(homePath);
  persistProviderCredentials("codex", resolved);
  return resolved;
}

function getClaudeCodeAccountStatus(
  homePath?: string,
): LinkedProviderAccountStatus {
  const stored = getStoredClaudeCodeCredentials();
  if (stored?.accessToken || stored?.refreshToken) {
    return {
      provider: "claude-code",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: true,
      source: stored.source,
      authMode: stored.authMode || "oauth",
      lastRefresh: stored.expiresAt,
      accountLabel: stored.accountLabel,
      loginCommand: "claude auth login",
      setupCommand: "claude setup-token",
      detail:
        "Eliza-managed Claude Code credentials are available in the local provider auth store.",
    };
  }

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
  const envToken = getClaudeCodeEnvToken();

  if (accessToken || refreshToken) {
    return {
      provider: "claude-code",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: cliStatus.loggedIn,
      source: credentialsPath,
      authMode: "oauth",
      lastRefresh: expiresAt,
      accountLabel,
      loginCommand: "claude auth login",
      setupCommand: "claude setup-token",
      detail:
        "Refreshable Claude Code OAuth credentials are available from the local Claude CLI store.",
    };
  }

  if (envToken?.token) {
    return {
      provider: "claude-code",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: cliStatus.loggedIn,
      source: `env:${envToken.key}`,
      authMode:
        envToken.key === "CLAUDE_CODE_SETUP_TOKEN" ? "setup-token" : "oauth",
      accountLabel,
      loginCommand: "claude auth login",
      setupCommand: "claude setup-token",
      detail:
        envToken.key === "CLAUDE_CODE_SETUP_TOKEN"
          ? "A Claude Code setup token is configured for native Claude execution."
          : "A Claude Code OAuth token is configured for native Claude execution.",
    };
  }

  if (accountLabel || existsSync(profilePath) || cliStatus.available) {
    return {
      provider: "claude-code",
      available: true,
      reusable: cliStatus.loggedIn,
      nativeReady: false,
      fallbackReady: cliStatus.loggedIn,
      source: existsSync(credentialsPath)
        ? credentialsPath
        : existsSync(profilePath)
          ? profilePath
          : cliStatus.source,
      authMode:
        cliStatus.authMethod ||
        (existsSync(profilePath) ? "profile" : undefined),
      accountLabel,
      loginCommand: "claude auth login",
      setupCommand: "claude setup-token",
      detail: accountLabel
        ? cliStatus.loggedIn
          ? "Claude account profile is present and Claude CLI reports logged in. Eliza Agent can use the local Claude CLI directly even though no reusable credential file was found."
          : "Claude account profile is present locally, but that profile alone is not a reusable Claude Code login. Run `claude auth login`."
        : cliStatus.available
          ? cliStatus.loggedIn
            ? "Claude CLI reports a logged-in session, and Eliza Agent can use the local Claude CLI directly even though no reusable credential file was found."
            : "Claude CLI is installed, but no reusable OAuth credential store was found. Run `claude auth login`."
          : "Claude CLI presence was detected, but no reusable OAuth credential store was found.",
    };
  }

  return {
    provider: "claude-code",
    available: false,
    reusable: false,
    nativeReady: false,
    fallbackReady: false,
    loginCommand: "claude auth login",
    setupCommand: "claude setup-token",
    detail: "No Claude Code CLI login artifacts were found on this machine.",
  };
}

export function getLinkedClaudeCodeCredentials(
  homePath?: string,
): LinkedClaudeCodeCredentials | undefined {
  const stored = getStoredClaudeCodeCredentials();
  if (stored?.accessToken || stored?.refreshToken) {
    return stored;
  }

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
  const envToken = getClaudeCodeEnvToken();

  if (!accessToken && !refreshToken) {
    if (!envToken?.token) {
      return undefined;
    }
    const resolved = {
      accessToken: envToken.token,
      accountLabel,
      authMode:
        envToken.key === "CLAUDE_CODE_SETUP_TOKEN" ? "setup-token" : "oauth",
      source: `env:${envToken.key}`,
    };
    persistProviderCredentials("claude-code", resolved);
    return resolved;
  }

  const resolved = {
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    expiresAt: expiresAt || undefined,
    accountLabel,
    authMode: "oauth",
    source: existsSync(credentialsPath) ? credentialsPath : profilePath,
  };
  persistProviderCredentials("claude-code", resolved);
  return resolved;
}

function getElizaCloudAccountStatus(
  _homePath?: string,
): LinkedProviderAccountStatus {
  const cloudInferenceEnabled = isElizaCloudInferenceEnabled();
  const stored = getStoredElizaCloudCredentials();
  if (stored?.apiKey) {
    return {
      provider: "elizacloud",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: stored.source,
      authMode: stored.authMode ?? "api-key",
      loginCommand: "elizaos login",
      detail: cloudInferenceEnabled
        ? "Eliza Cloud is already connected and active as the managed inference path for this workspace."
        : "Eliza Cloud is already connected from the local Eliza auth store and can be activated as the managed inference path.",
    };
  }

  const envKey = getElizaCloudEnvKey();
  if (envKey?.value) {
    return {
      provider: "elizacloud",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: `env:${envKey.key}`,
      authMode: "api-key",
      loginCommand: "elizaos login",
      detail: cloudInferenceEnabled
        ? "Eliza Cloud is already connected and active for managed inference in this workspace."
        : "Eliza Cloud API key is already configured for this workspace and can be activated as the managed inference path.",
    };
  }

  return {
    provider: "elizacloud",
    available: commandExists("elizaos"),
    reusable: false,
    nativeReady: false,
    fallbackReady: false,
    loginCommand: "elizaos login",
    detail: commandExists("elizaos")
      ? "Eliza Cloud is not active yet. Run `elizaos login` from this project to save ELIZAOS_CLOUD_API_KEY."
      : "Eliza Cloud is not active yet, and the `elizaos` CLI was not found on this machine.",
  };
}

export function getLinkedElizaCloudCredentials(
  _homePath?: string,
): LinkedElizaCloudCredentials | undefined {
  const stored = getStoredElizaCloudCredentials();
  if (stored?.apiKey) {
    return stored;
  }

  const envKey = getElizaCloudEnvKey();
  if (!envKey?.value) {
    return undefined;
  }

  const resolved = {
    apiKey: envKey.value,
    authMode: "api-key",
    baseUrl: resolveCloudApiBaseUrl(process.env.ELIZAOS_CLOUD_BASE_URL),
    source: `env:${envKey.key}`,
  };
  persistProviderCredentials("elizacloud", resolved);
  return resolved;
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
  const stored = getStoredClaudeCodeCredentials();
  if (
    stored?.refreshToken &&
    stored.authMode === "oauth" &&
    (!stored.expiresAt || claudeCodeAccessTokenIsExpiring(stored.expiresAt))
  ) {
    const updated = await refreshClaudeOAuthCredentialsFromRecord(
      stored.refreshToken,
      "eliza-auth-store",
      stored.accountLabel,
    );
    if (updated) {
      persistProviderCredentials("claude-code", updated);
      return updated;
    }
  }

  const envToken = getClaudeCodeEnvToken();
  if (envToken?.token) {
    const resolved = {
      accessToken: envToken.token,
      authMode:
        envToken.key === "CLAUDE_CODE_SETUP_TOKEN" ? "setup-token" : "oauth",
      source: `env:${envToken.key}`,
    };
    const fileCreds = (() => {
      const home = resolveHome(homePath);
      const credentialsPath = join(home, ".claude", ".credentials.json");
      const payload = existsSync(credentialsPath)
        ? readJson(credentialsPath)
        : undefined;
      const oauth =
        payload && typeof payload === "object" && "claudeAiOauth" in payload
          ? (payload as { claudeAiOauth?: Record<string, unknown> })
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
        expiresAt,
        accountLabel: undefined,
        authMode: "oauth" as const,
        source: credentialsPath,
      };
    })();
    if (
      fileCreds?.refreshToken &&
      (!fileCreds.expiresAt ||
        claudeCodeAccessTokenIsExpiring(fileCreds.expiresAt))
    ) {
      const refreshed = await refreshClaudeOAuthCredentialsFromRecord(
        fileCreds.refreshToken,
        fileCreds.source || "claude-code-credentials",
        fileCreds.accountLabel,
      );
      if (refreshed) {
        persistProviderCredentials("claude-code", refreshed);
        return refreshed;
      }
    }
    persistProviderCredentials("claude-code", resolved);
    return resolved;
  }

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

  const refreshed = await refreshClaudeOAuthCredentialsFromRecord(
    refreshToken,
    credentialsPath,
  );
  if (!refreshed?.accessToken) {
    throw new Error(
      "Claude Code OAuth refresh response did not include access_token",
    );
  }
  const updatedPayload = {
    ...(payload as Record<string, unknown>),
    claudeAiOauth: {
      ...oauth,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || refreshToken,
      expiresAt: Number(refreshed.expiresAt),
    },
  };
  writeJson(credentialsPath, updatedPayload);
  const resolved = getLinkedClaudeCodeCredentials(homePath);
  persistProviderCredentials("claude-code", resolved);
  return resolved;
}

export async function resolveLinkedProviderCredentials(
  provider: "codex" | "claude-code" | "elizacloud",
  homePath?: string,
): Promise<
  | LinkedCodexCredentials
  | LinkedClaudeCodeCredentials
  | LinkedElizaCloudCredentials
  | undefined
> {
  if (provider === "codex") {
    const credentials = getLinkedCodexCredentials(homePath);
    if (
      credentials?.refreshToken &&
      codexAccessTokenIsExpiring(credentials.accessToken)
    ) {
      return refreshLinkedCodexCredentials(homePath);
    }
    return credentials;
  }

  if (provider === "elizacloud") {
    return getLinkedElizaCloudCredentials(homePath);
  }

  const credentials = getLinkedClaudeCodeCredentials(homePath);
  if (
    credentials?.refreshToken &&
    (!credentials.expiresAt ||
      claudeCodeAccessTokenIsExpiring(credentials.expiresAt))
  ) {
    return refreshLinkedClaudeCodeCredentials(homePath);
  }
  return credentials;
}

export function getLinkedProviderAccountsSnapshot(
  homePath?: string,
): LinkedProviderAccountsSnapshot {
  return {
    codex: getCodexAccountStatus(homePath),
    claudeCode: getClaudeCodeAccountStatus(homePath),
    elizaCloud: getElizaCloudAccountStatus(homePath),
  };
}

export function getLinkedProviderLoginCommand(
  provider: "codex" | "claude-code" | "elizacloud",
): string {
  if (provider === "codex") {
    return "codex login";
  }
  if (provider === "elizacloud") {
    return "elizaos login";
  }
  return "claude auth login";
}

export function getLinkedProviderSetupCommand(
  provider: "codex" | "claude-code" | "elizacloud",
): string | undefined {
  return provider === "claude-code" ? "claude setup-token" : undefined;
}

export function getLinkedProviderConnectAdvice(
  provider: "codex" | "claude-code" | "elizacloud",
  homePath?: string,
): LinkedProviderConnectAdvice {
  const snapshot = getLinkedProviderAccountsSnapshot(homePath);
  const status =
    provider === "codex"
      ? snapshot.codex
      : provider === "claude-code"
        ? snapshot.claudeCode
        : snapshot.elizaCloud;
  const nativeReady = status.nativeReady ?? status.reusable;
  const fallbackReady = status.fallbackReady ?? false;

  if (nativeReady) {
    return {
      provider,
      status,
      ready: true,
      preferredAction: "use",
      primaryCommand: `/accounts connect ${provider}`,
      detail:
        provider === "codex"
          ? "Codex is already bound for native Eliza execution. Run `/accounts connect codex` to activate it here."
          : provider === "elizacloud"
            ? "Eliza Cloud is already available in this workspace. Run `/accounts connect elizacloud` to activate managed cloud inference here."
            : "Claude Code is already bound for native Eliza execution. Run `/accounts connect claude-code` to activate it here.",
    };
  }

  if (provider === "claude-code" && fallbackReady) {
    return {
      provider,
      status,
      ready: false,
      preferredAction: "setup-token",
      primaryCommand: status.setupCommand,
      secondaryCommand: `/accounts connect ${provider}`,
      detail:
        "Claude Code is signed in locally, but native Eliza auth material is still missing. Run `claude setup-token` to complete the native path, or run `/accounts connect claude-code` to use the local CLI fallback now.",
    };
  }

  return {
    provider,
    status,
    ready: false,
    preferredAction: "login",
    primaryCommand: status.loginCommand,
    secondaryCommand: `/accounts connect ${provider}`,
    detail:
      provider === "codex"
        ? "Codex still needs a linked local login. Run `codex login`, then `/accounts connect codex` to bind it in Eliza."
        : provider === "elizacloud"
          ? "Eliza Cloud is not active yet. Run `elizaos login` from this project to save ELIZAOS_CLOUD_API_KEY, then `/accounts connect elizacloud` to use the managed cloud path."
          : "Claude Code still needs an official login. Run `claude auth login`, then `/accounts connect claude-code` to bind it in Eliza.",
  };
}
