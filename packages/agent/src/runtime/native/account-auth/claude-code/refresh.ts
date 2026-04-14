import {
  type ClaudeCodeAuthDependencies,
  claudeCodeAccessTokenIsExpiring,
  getClaudeCodeCredentialsPath,
  readClaudeCodeFileCredentials,
  refreshClaudeOAuthCredentialsFromRecord,
  resolveClaudeCodeEnvCredentials,
  writeClaudeCodeFileCredentials,
} from "../claude-code-support";
import {
  getReusableStoredTokenCredentials,
  persistResolvedTokenCredentials,
} from "../credentials";
import type { LinkedClaudeCodeCredentials } from "../types";
import { getLinkedClaudeCodeCredentials } from "./credentials";

async function refreshStoredClaudeCodeCredentials(
  deps: ClaudeCodeAuthDependencies,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  const stored = getReusableStoredTokenCredentials(deps.getStoredCredentials());
  if (
    !stored?.refreshToken ||
    stored.authMode !== "oauth" ||
    (stored.expiresAt && !claudeCodeAccessTokenIsExpiring(stored.expiresAt))
  ) {
    return undefined;
  }

  const updated = await refreshClaudeOAuthCredentialsFromRecord(
    stored.refreshToken,
    "eliza-auth-store",
    stored.accountLabel,
  );
  if (!updated) {
    return undefined;
  }

  return persistResolvedTokenCredentials(updated, deps.persistCredentials);
}

async function refreshEnvBackedClaudeCodeCredentials(
  envCredentials: LinkedClaudeCodeCredentials,
  fileCreds: LinkedClaudeCodeCredentials | undefined,
  deps: ClaudeCodeAuthDependencies,
): Promise<LinkedClaudeCodeCredentials | undefined> {
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
      return persistResolvedTokenCredentials(
        refreshed,
        deps.persistCredentials,
      );
    }
  }

  return persistResolvedTokenCredentials(
    envCredentials,
    deps.persistCredentials,
  );
}

async function refreshFileBackedClaudeCodeCredentials(
  homePath: string | undefined,
  fileCreds: LinkedClaudeCodeCredentials | undefined,
  deps: ClaudeCodeAuthDependencies,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  if (!fileCreds?.refreshToken) {
    return undefined;
  }

  const refreshed = await refreshClaudeOAuthCredentialsFromRecord(
    fileCreds.refreshToken,
    fileCreds.source || getClaudeCodeCredentialsPath(homePath, deps),
    fileCreds.accountLabel,
  );
  if (!refreshed?.accessToken) {
    throw new Error(
      "Claude Code OAuth refresh response did not include access_token",
    );
  }

  writeClaudeCodeFileCredentials(homePath, refreshed, deps);
  return persistResolvedTokenCredentials(
    getLinkedClaudeCodeCredentials(homePath, deps),
    deps.persistCredentials,
  );
}

export async function refreshLinkedClaudeCodeCredentials(
  homePath: string | undefined,
  deps: ClaudeCodeAuthDependencies,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  const refreshedStored = await refreshStoredClaudeCodeCredentials(deps);
  if (refreshedStored) {
    return refreshedStored;
  }

  const envCredentials = resolveClaudeCodeEnvCredentials(homePath, deps);
  const fileCreds = readClaudeCodeFileCredentials(homePath, deps);
  if (envCredentials) {
    return refreshEnvBackedClaudeCodeCredentials(
      envCredentials,
      fileCreds,
      deps,
    );
  }

  return refreshFileBackedClaudeCodeCredentials(homePath, fileCreds, deps);
}
