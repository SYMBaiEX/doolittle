import {
  getClaudeCodeAccountStatus,
  getLinkedClaudeCodeCredentials,
  refreshLinkedClaudeCodeCredentials,
} from "./claude-code";
import { claudeCodeAccessTokenIsExpiring } from "./claude-code-support/files";
import {
  codexAccessTokenIsExpiring as codexAccessTokenIsExpiringImpl,
  getCodexAccountStatus as getCodexAccountStatusImpl,
  getLinkedCodexCredentials as getLinkedCodexCredentialsImpl,
  refreshLinkedCodexCredentials as refreshLinkedCodexCredentialsImpl,
} from "./codex";
import { getCodexAuthDependencies } from "./codex-support";
import {
  buildLinkedProviderConnectAdvice,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
} from "./connect-advice";
import {
  getElizaCloudAccountStatus as getElizaCloudAccountStatusImpl,
  getLinkedElizaCloudCredentials as getLinkedElizaCloudCredentialsImpl,
} from "./elizacloud";
import { getElizaCloudAuthDependencies } from "./elizacloud-support";
import { DEFAULT_REFRESH_SKEW_SECONDS } from "./shared";
import {
  getStoredElizaCloudCredentials,
  persistProviderCredentials,
  readProviderAuthStore,
} from "./store";
import type {
  LinkedClaudeCodeCredentials,
  LinkedCodexCredentials,
  LinkedElizaCloudCredentials,
  LinkedProviderAccountsSnapshot,
  LinkedProviderConnectAdvice,
  LinkedProviderName,
} from "./types";

export type {
  CliAuthStatus,
  LinkedClaudeCodeCredentials,
  LinkedCodexCredentials,
  LinkedElizaCloudCredentials,
  LinkedProviderAccountStatus,
  LinkedProviderAccountsSnapshot,
  LinkedProviderConnectAdvice,
  LinkedProviderName,
  ProviderAuthStoreShape,
} from "./types";

export {
  claudeCodeAccessTokenIsExpiring,
  getLinkedClaudeCodeCredentials,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
  refreshLinkedClaudeCodeCredentials,
};

function getCodexAccountStatus(homePath?: string) {
  return getCodexAccountStatusImpl(homePath, getCodexAuthDependencies());
}

export function getLinkedCodexCredentials(
  homePath?: string,
): LinkedCodexCredentials | undefined {
  return getLinkedCodexCredentialsImpl(homePath, getCodexAuthDependencies());
}

export function codexAccessTokenIsExpiring(
  accessToken?: string,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  return codexAccessTokenIsExpiringImpl(
    accessToken,
    getCodexAuthDependencies(),
    skewSeconds,
  );
}

export async function refreshLinkedCodexCredentials(
  homePath?: string,
): Promise<LinkedCodexCredentials | undefined> {
  return refreshLinkedCodexCredentialsImpl(
    homePath,
    getCodexAuthDependencies(),
  );
}

export function getLinkedElizaCloudCredentials(
  homePath?: string,
): LinkedElizaCloudCredentials | undefined {
  return getLinkedElizaCloudCredentialsImpl(
    homePath,
    getElizaCloudAuthDependencies(),
  );
}

export async function resolveLinkedProviderCredentials(
  provider: LinkedProviderName,
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
    elizaCloud: getElizaCloudAccountStatusImpl(
      homePath,
      getElizaCloudAuthDependencies(),
    ),
  };
}

export function getLinkedProviderConnectAdvice(
  provider: LinkedProviderName,
  homePath?: string,
): LinkedProviderConnectAdvice {
  const snapshot = getLinkedProviderAccountsSnapshot(homePath);
  const status =
    provider === "codex"
      ? snapshot.codex
      : provider === "claude-code"
        ? snapshot.claudeCode
        : snapshot.elizaCloud;
  return buildLinkedProviderConnectAdvice(provider, status);
}

export const __accountAuthTestOnly = {
  getStoredElizaCloudCredentials,
  persistProviderCredentials,
  readProviderAuthStore,
};
