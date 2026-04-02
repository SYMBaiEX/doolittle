import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  claudeCodeAccessTokenIsExpiring,
  getClaudeCodeCliAuthStatus,
  getClaudeCodeCredentialsPath,
  getClaudeCodeEnvToken,
  getClaudeCodeProfileLabel,
  getStoredClaudeCodeCredentials,
  persistProviderCredentials,
  readClaudeCodeFileCredentials,
  refreshClaudeOAuthCredentialsFromRecord,
  resolveHome,
  writeClaudeCodeFileCredentials,
} from "./claude-code-support";
import type {
  LinkedClaudeCodeCredentials,
  LinkedProviderAccountStatus,
} from "./types";

export { claudeCodeAccessTokenIsExpiring };

export function getClaudeCodeAccountStatus(
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
  const credentialsPath = getClaudeCodeCredentialsPath(homePath);
  const profilePath = join(home, ".claude.json");
  const fileCreds = readClaudeCodeFileCredentials(homePath);
  const accountLabel = getClaudeCodeProfileLabel(home);
  const envToken = getClaudeCodeEnvToken();

  if (fileCreds?.accessToken || fileCreds?.refreshToken) {
    return {
      provider: "claude-code",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: cliStatus.loggedIn,
      source: fileCreds.source,
      authMode: "oauth",
      lastRefresh: fileCreds.expiresAt,
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

  if (accountLabel || existsSync(credentialsPath) || cliStatus.available) {
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
          ? "Claude account profile is present and Claude CLI reports logged in. Doolittle can use the local Claude CLI directly even though no reusable credential file was found."
          : "Claude account profile is present locally, but that profile alone is not a reusable Claude Code login. Run `claude auth login`."
        : cliStatus.available
          ? cliStatus.loggedIn
            ? "Claude CLI reports a logged-in session, and Doolittle can use the local Claude CLI directly even though no reusable credential file was found."
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

  const fileCreds = readClaudeCodeFileCredentials(homePath);
  if (fileCreds) {
    persistProviderCredentials(fileCreds);
    return fileCreds;
  }

  const envToken = getClaudeCodeEnvToken();
  if (!envToken?.token) {
    return undefined;
  }

  const resolved = {
    accessToken: envToken.token,
    accountLabel: getClaudeCodeProfileLabel(resolveHome(homePath)),
    authMode:
      envToken.key === "CLAUDE_CODE_SETUP_TOKEN" ? "setup-token" : "oauth",
    source: `env:${envToken.key}`,
  };
  persistProviderCredentials(resolved);
  return resolved;
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
      persistProviderCredentials(updated);
      return updated;
    }
  }

  const envToken = getClaudeCodeEnvToken();
  const fileCreds = readClaudeCodeFileCredentials(homePath);
  if (envToken?.token) {
    const resolved = {
      accessToken: envToken.token,
      authMode:
        envToken.key === "CLAUDE_CODE_SETUP_TOKEN" ? "setup-token" : "oauth",
      source: `env:${envToken.key}`,
    };
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
        persistProviderCredentials(refreshed);
        return refreshed;
      }
    }
    persistProviderCredentials(resolved);
    return resolved;
  }

  if (!fileCreds?.refreshToken) {
    return undefined;
  }

  const refreshed = await refreshClaudeOAuthCredentialsFromRecord(
    fileCreds.refreshToken,
    fileCreds.source || getClaudeCodeCredentialsPath(homePath),
    fileCreds.accountLabel,
  );
  if (!refreshed?.accessToken) {
    throw new Error(
      "Claude Code OAuth refresh response did not include access_token",
    );
  }

  writeClaudeCodeFileCredentials(homePath, refreshed);
  const resolved = getLinkedClaudeCodeCredentials(homePath);
  persistProviderCredentials(resolved);
  return resolved;
}
