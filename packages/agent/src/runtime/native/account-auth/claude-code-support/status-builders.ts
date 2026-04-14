import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildReusableProviderStatus,
  buildUnavailableProviderStatus,
} from "../account-auth-helpers";
import {
  getReusableStoredTokenCredentials,
  hasTokenCredentials,
} from "../credentials";
import type { LinkedProviderAccountStatus } from "../types";
import { getClaudeCodeCliAuthStatus } from "./cli";
import {
  CLAUDE_CODE_LOGIN_COMMAND,
  CLAUDE_CODE_SETUP_COMMAND,
} from "./commands";
import type { ClaudeCodeAuthDependencies } from "./dependencies";
import {
  getClaudeCodeCredentialsPath,
  getClaudeCodeProfileLabel,
  readClaudeCodeFileCredentials,
  resolveClaudeCodeEnvCredentials,
} from "./files";

function buildStoredClaudeCodeStatus(
  stored: NonNullable<
    ReturnType<ClaudeCodeAuthDependencies["getStoredCredentials"]>
  >,
): LinkedProviderAccountStatus {
  return buildReusableProviderStatus({
    provider: "claude-code",
    source: stored.source,
    authMode: stored.authMode || "oauth",
    lastRefresh: stored.expiresAt,
    accountLabel: stored.accountLabel,
    loginCommand: CLAUDE_CODE_LOGIN_COMMAND,
    setupCommand: CLAUDE_CODE_SETUP_COMMAND,
    fallbackReady: true,
    detail:
      "Eliza-managed Claude Code credentials are available in the local provider auth store.",
  });
}

function buildFileClaudeCodeStatus({
  fileCreds,
  accountLabel,
  fallbackReady,
}: {
  fileCreds: ReturnType<typeof readClaudeCodeFileCredentials>;
  accountLabel?: string;
  fallbackReady: boolean;
}): LinkedProviderAccountStatus {
  return buildReusableProviderStatus({
    provider: "claude-code",
    source: fileCreds?.source,
    authMode: "oauth",
    lastRefresh: fileCreds?.expiresAt,
    accountLabel,
    loginCommand: CLAUDE_CODE_LOGIN_COMMAND,
    setupCommand: CLAUDE_CODE_SETUP_COMMAND,
    fallbackReady,
    detail:
      "Refreshable Claude Code OAuth credentials are available from the local Claude CLI store.",
  });
}

function buildEnvClaudeCodeStatus({
  envCredentials,
  accountLabel,
  fallbackReady,
}: {
  envCredentials: NonNullable<
    ReturnType<typeof resolveClaudeCodeEnvCredentials>
  >;
  accountLabel?: string;
  fallbackReady: boolean;
}): LinkedProviderAccountStatus {
  return buildReusableProviderStatus({
    provider: "claude-code",
    source: envCredentials.source,
    authMode: envCredentials.authMode,
    accountLabel: envCredentials.accountLabel || accountLabel,
    loginCommand: CLAUDE_CODE_LOGIN_COMMAND,
    setupCommand: CLAUDE_CODE_SETUP_COMMAND,
    fallbackReady,
    detail:
      envCredentials.authMode === "setup-token"
        ? "A Claude Code setup token is configured for native Claude execution."
        : "A Claude Code OAuth token is configured for native Claude execution.",
  });
}

function buildLocalClaudeCodeStatus({
  accountLabel,
  credentialsPath,
  profilePath,
  cliStatus,
}: {
  accountLabel?: string;
  credentialsPath: string;
  profilePath: string;
  cliStatus: ReturnType<typeof getClaudeCodeCliAuthStatus>;
}): LinkedProviderAccountStatus {
  const credentialsPresent = existsSync(credentialsPath);
  const profilePresent = existsSync(profilePath);

  return buildUnavailableProviderStatus({
    provider: "claude-code",
    available: true,
    reusable: cliStatus.loggedIn,
    source: credentialsPresent
      ? credentialsPath
      : profilePresent
        ? profilePath
        : cliStatus.source,
    authMode: cliStatus.authMethod || (profilePresent ? "profile" : undefined),
    accountLabel,
    loginCommand: CLAUDE_CODE_LOGIN_COMMAND,
    setupCommand: CLAUDE_CODE_SETUP_COMMAND,
    fallbackReady: cliStatus.loggedIn,
    detail: accountLabel
      ? cliStatus.loggedIn
        ? "Claude account profile is present and Claude CLI reports logged in. Doolittle can use the local Claude CLI directly even though no reusable credential file was found."
        : "Claude account profile is present locally, but that profile alone is not a reusable Claude Code login. Run `claude auth login`."
      : cliStatus.available
        ? cliStatus.loggedIn
          ? "Claude CLI reports a logged-in session, and Doolittle can use the local Claude CLI directly even though no reusable credential file was found."
          : "Claude CLI is installed, but no reusable OAuth credential store was found. Run `claude auth login`."
        : "Claude CLI presence was detected, but no reusable OAuth credential store was found.",
  });
}

export function getClaudeCodeAccountStatus(
  homePath: string | undefined,
  deps: ClaudeCodeAuthDependencies,
): LinkedProviderAccountStatus {
  const stored = getReusableStoredTokenCredentials(deps.getStoredCredentials());
  if (stored) {
    return buildStoredClaudeCodeStatus(stored);
  }

  const home = deps.resolveHome(homePath);
  const cliStatus = getClaudeCodeCliAuthStatus(homePath, deps);
  const credentialsPath = getClaudeCodeCredentialsPath(homePath, deps);
  const profilePath = join(home, ".claude.json");
  const fileCreds = readClaudeCodeFileCredentials(homePath, deps);
  const accountLabel = getClaudeCodeProfileLabel(home, deps);
  const envCredentials = resolveClaudeCodeEnvCredentials(homePath, deps);

  if (fileCreds && hasTokenCredentials(fileCreds)) {
    return buildFileClaudeCodeStatus({
      fileCreds,
      accountLabel,
      fallbackReady: cliStatus.loggedIn,
    });
  }

  if (envCredentials) {
    return buildEnvClaudeCodeStatus({
      envCredentials,
      accountLabel,
      fallbackReady: cliStatus.loggedIn,
    });
  }

  if (accountLabel || existsSync(credentialsPath) || cliStatus.available) {
    return buildLocalClaudeCodeStatus({
      accountLabel,
      credentialsPath,
      profilePath,
      cliStatus,
    });
  }

  return buildUnavailableProviderStatus({
    provider: "claude-code",
    available: false,
    reusable: false,
    loginCommand: CLAUDE_CODE_LOGIN_COMMAND,
    setupCommand: CLAUDE_CODE_SETUP_COMMAND,
    detail: "No Claude Code CLI login artifacts were found on this machine.",
  });
}
