import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_REFRESH_SKEW_SECONDS,
  readJsonIfExists,
  resolveHome,
} from "../shared";
import {
  hasTokens,
  readNestedField,
  readTokenPair,
  trimTextOrUndefined,
} from "../token-loaders";
import type { LinkedClaudeCodeCredentials } from "../types";
import {
  type ClaudeCodeAuthDependencies,
  getClaudeCodeAuthDependencies,
} from "./dependencies";

const CLAUDE_CODE_ENV_KEYS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_SETUP_TOKEN",
] as const;

function getClaudeCodeEnvToken(
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): { key: (typeof CLAUDE_CODE_ENV_KEYS)[number]; token: string } | undefined {
  for (const key of CLAUDE_CODE_ENV_KEYS) {
    const token = deps.readEnv(key)?.trim();
    if (token) {
      return { key, token };
    }
  }
  return undefined;
}

export function getClaudeCodeProfileLabel(
  homePath: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): string | undefined {
  const profilePath = join(homePath, ".claude.json");
  const profile = readJsonIfExists(profilePath, deps.readJson);
  const account = readNestedField(profile, ["oauthAccount"]);
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

export function getClaudeCodeCredentialsPath(
  homePath?: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): string {
  return join(deps.resolveHome(homePath), ".claude", ".credentials.json");
}

export function readClaudeCodeFileCredentials(
  homePath?: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): LinkedClaudeCodeCredentials | undefined {
  const home = deps.resolveHome(homePath);
  const credentialsPath = getClaudeCodeCredentialsPath(homePath, deps);
  const profilePath = join(home, ".claude.json");
  const credentialsPayload = readJsonIfExists(credentialsPath, deps.readJson);
  const oauth = readNestedField(credentialsPayload, ["claudeAiOauth"]);
  const tokenPair = readTokenPair(oauth, "accessToken", "refreshToken");
  const expiresAt = trimTextOrUndefined(
    (oauth as Record<string, unknown> | undefined)?.expiresAt,
  );

  if (!hasTokens(tokenPair)) {
    return undefined;
  }

  return {
    ...tokenPair,
    expiresAt: expiresAt?.trim(),
    accountLabel: getClaudeCodeProfileLabel(home, deps),
    authMode: "oauth",
    source: existsSync(credentialsPath) ? credentialsPath : profilePath,
  };
}

export function resolveClaudeCodeEnvCredentials(
  homePath?: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): LinkedClaudeCodeCredentials | undefined {
  const envToken = getClaudeCodeEnvToken(deps);
  if (!envToken?.token) {
    return undefined;
  }

  return {
    accessToken: envToken.token,
    accountLabel: getClaudeCodeProfileLabel(resolveHome(homePath), deps),
    authMode:
      envToken.key === "CLAUDE_CODE_SETUP_TOKEN" ? "setup-token" : "oauth",
    source: `env:${envToken.key}`,
  };
}

export function claudeCodeAccessTokenIsExpiring(
  expiresAt?: string,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  const parsed = expiresAt ? Number(expiresAt) : Number.NaN;
  return getClaudeCodeAuthDependencies().isUnixMillisecondsExpiring(
    Number.isFinite(parsed) ? parsed : undefined,
    skewSeconds,
  );
}

export function writeClaudeCodeFileCredentials(
  homePath: string | undefined,
  refreshed: LinkedClaudeCodeCredentials,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): boolean {
  const credentialsPath = getClaudeCodeCredentialsPath(homePath, deps);
  const payload = readJsonIfExists(credentialsPath, deps.readJson);
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
  deps.writeJson(credentialsPath, updatedPayload);
  return true;
}
