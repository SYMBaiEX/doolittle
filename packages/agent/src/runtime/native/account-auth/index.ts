import { buildUnavailableProviderStatus } from "./account-auth-helpers";
import {
  getClaudeCodeAccountStatus,
  getLinkedClaudeCodeCredentials,
  refreshLinkedClaudeCodeCredentials as refreshLinkedClaudeCodeCredentialsImpl,
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
import { getDevinAccountStatus, getLinkedDevinCredentials } from "./devin";
import {
  getElizaCloudAccountStatus as getElizaCloudAccountStatusImpl,
  getLinkedElizaCloudCredentials as getLinkedElizaCloudCredentialsImpl,
} from "./elizacloud";
import { getElizaCloudAuthDependencies } from "./elizacloud-support";
import { invalidateOfficialSubscriptionStatusCache } from "./official-subscription-status";
import { DEFAULT_REFRESH_SKEW_SECONDS } from "./shared";
import {
  getStoredElizaCloudCredentials,
  persistProviderCredentials,
  readProviderAuthStore,
} from "./store";
import type {
  LinkedClaudeCodeCredentials,
  LinkedCodexCredentials,
  LinkedDevinCredentials,
  LinkedElizaCloudCredentials,
  LinkedProviderAccountsSnapshot,
  LinkedProviderConnectAdvice,
  LinkedProviderName,
} from "./types";

export type {
  CliAuthStatus,
  LinkedClaudeCodeCredentials,
  LinkedCodexCredentials,
  LinkedDevinCredentials,
  LinkedElizaCloudCredentials,
  LinkedProviderAccountStatus,
  LinkedProviderAccountsSnapshot,
  LinkedProviderConnectAdvice,
  LinkedProviderName,
  ProviderAuthStoreShape,
} from "./types";
export {
  buildLinkedProviderConnectAdvice,
  claudeCodeAccessTokenIsExpiring,
  getLinkedClaudeCodeCredentials,
  getLinkedDevinCredentials,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
  invalidateOfficialSubscriptionStatusCache,
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
  try {
    return await refreshLinkedCodexCredentialsImpl(
      homePath,
      getCodexAuthDependencies(),
    );
  } finally {
    invalidateOfficialSubscriptionStatusCache();
  }
}

export async function refreshLinkedClaudeCodeCredentials(
  homePath?: string,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  try {
    return await refreshLinkedClaudeCodeCredentialsImpl(homePath);
  } finally {
    invalidateOfficialSubscriptionStatusCache();
  }
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
  | LinkedDevinCredentials
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

  if (provider === "devin") {
    return getLinkedDevinCredentials(homePath);
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
  providers?: readonly LinkedProviderName[],
): LinkedProviderAccountsSnapshot {
  const selected = providers ? new Set(providers) : undefined;
  const shouldProbe = (provider: LinkedProviderName) =>
    selected === undefined || selected.has(provider);
  const unprobed = (provider: LinkedProviderName) =>
    buildUnavailableProviderStatus({
      provider,
      loginCommand: getLinkedProviderLoginCommand(provider),
      setupCommand: getLinkedProviderSetupCommand(provider),
      detail: "Provider account not probed during startup.",
    });

  return {
    codex: shouldProbe("codex")
      ? getCodexAccountStatus(homePath)
      : unprobed("codex"),
    claudeCode: shouldProbe("claude-code")
      ? getClaudeCodeAccountStatus(homePath)
      : unprobed("claude-code"),
    devin: shouldProbe("devin")
      ? getDevinAccountStatus(homePath)
      : unprobed("devin"),
    elizaCloud: shouldProbe("elizacloud")
      ? getElizaCloudAccountStatusImpl(
          homePath,
          getElizaCloudAuthDependencies(),
        )
      : unprobed("elizacloud"),
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
        : provider === "devin"
          ? snapshot.devin
          : snapshot.elizaCloud;
  return buildLinkedProviderConnectAdvice(provider, status);
}

export const __accountAuthTestOnly = {
  getStoredElizaCloudCredentials,
  persistProviderCredentials,
  readProviderAuthStore,
};
