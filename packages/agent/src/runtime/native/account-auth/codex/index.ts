import {
  buildReusableProviderStatus,
  buildUnavailableProviderStatus,
} from "../account-auth-helpers";
import type { CodexAuthDependencies } from "../codex-support";
import {
  getReusableStoredTokenCredentials,
  persistResolvedTokenCredentials,
  resolveStoredOrLoadedTokenCredentials,
} from "../credentials";
import { refreshOAuthCredentials } from "../oauth-refresh";
import type {
  LinkedCodexCredentials,
  LinkedProviderAccountStatus,
} from "../types";
import {
  CODEX_LOGIN_COMMAND,
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_TOKEN_URL,
  getCodexCliAuthStatus,
  getCodexCliCredentials,
  readCodexCliStore,
  writeRefreshedCodexCliStore,
} from "./local";

function buildStoredCodexStatus(
  stored: NonNullable<
    ReturnType<CodexAuthDependencies["getStoredCredentials"]>
  >,
): LinkedProviderAccountStatus {
  return buildReusableProviderStatus({
    provider: "codex",
    source: stored.source,
    authMode: stored.authMode || "chatgpt",
    lastRefresh: stored.lastRefresh,
    loginCommand: CODEX_LOGIN_COMMAND,
    detail:
      "Eliza-managed Codex credentials are available in the local provider auth store.",
  });
}

function buildCliStoreCodexStatus(
  credentials: NonNullable<ReturnType<typeof getCodexCliCredentials>>,
): LinkedProviderAccountStatus {
  return buildReusableProviderStatus({
    provider: "codex",
    source: credentials.source,
    authMode: credentials.authMode || "chatgpt",
    lastRefresh: credentials.lastRefresh,
    loginCommand: CODEX_LOGIN_COMMAND,
    detail:
      "Signed-in Codex account detected through the local Codex CLI auth store.",
  });
}

export function getCodexAccountStatus(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
): LinkedProviderAccountStatus {
  const stored = getReusableStoredTokenCredentials(deps.getStoredCredentials());
  if (stored) {
    return buildStoredCodexStatus(stored);
  }

  const cliStore = readCodexCliStore(homePath, deps);
  const cliCredentials = getCodexCliCredentials(cliStore);
  if (cliCredentials) {
    return buildCliStoreCodexStatus(cliCredentials);
  }

  const cliStatus = getCodexCliAuthStatus(homePath, deps);
  return buildUnavailableProviderStatus({
    provider: "codex",
    available: cliStore.authFilePresent || cliStatus.available,
    source: cliStore.authFilePresent ? cliStore.authPath : undefined,
    authMode: cliStore.authMode || cliStatus.authMethod,
    lastRefresh: cliStore.lastRefresh,
    loginCommand: CODEX_LOGIN_COMMAND,
    detail: cliStore.authFilePresent
      ? "Codex auth store exists, but no reusable access and refresh token pair was found."
      : cliStatus.loggedIn
        ? "Codex CLI reports a logged-in session, but Doolittle could not read a reusable local auth store yet."
        : cliStatus.available
          ? "Codex CLI is installed, but no reusable local signed-in auth store was found. Run `codex login`."
          : "Codex CLI is not installed and no local auth store was found.",
  });
}

export function getLinkedCodexCredentials(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
): LinkedCodexCredentials | undefined {
  return resolveStoredOrLoadedTokenCredentials({
    stored: deps.getStoredCredentials(),
    loaded: getCodexCliCredentials(readCodexCliStore(homePath, deps)),
    persistCredentials: deps.persistCredentials,
  });
}

export function codexAccessTokenIsExpiring(
  accessToken: string | undefined,
  deps: CodexAuthDependencies,
  skewSeconds = deps.defaultRefreshSkewSeconds,
): boolean {
  const payload = deps.decodeJwtPayload(accessToken);
  const exp =
    payload && typeof payload.exp === "number" ? payload.exp : undefined;
  return deps.isUnixSecondsExpiring(exp, skewSeconds);
}

export async function refreshLinkedCodexCredentials(
  homePath: string | undefined,
  deps: CodexAuthDependencies,
): Promise<LinkedCodexCredentials | undefined> {
  const cliStore = readCodexCliStore(homePath, deps);
  if (
    !cliStore.payload ||
    typeof cliStore.payload !== "object" ||
    !cliStore.refreshToken
  ) {
    return undefined;
  }

  const refreshed = await refreshOAuthCredentials({
    tokenUrl: CODEX_OAUTH_TOKEN_URL,
    clientId: CODEX_OAUTH_CLIENT_ID,
    refreshToken: cliStore.refreshToken,
    throwOnFailure: true,
    failureMessage: (status, detail) =>
      `Codex OAuth refresh failed (${status}): ${detail}`,
  });
  if (!refreshed?.accessToken) {
    throw new Error(
      "Codex OAuth refresh response did not include access_token",
    );
  }

  writeRefreshedCodexCliStore(cliStore, refreshed, deps);
  return persistResolvedTokenCredentials(
    getLinkedCodexCredentials(homePath, deps),
    deps.persistCredentials,
  );
}
