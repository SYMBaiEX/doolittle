import type { AccountCredentialRecord } from "@elizaos/auth/auth/account-storage";
import {
  getAccessToken,
  listProviderAccounts,
} from "@elizaos/auth/auth/credentials";
import {
  type CodexAuth,
  defaultAuthPath,
  loadCodexAuth,
  refreshCodexAuth,
} from "@elizaos/plugin-codex-cli";
import { decodeJwtPayload } from "../account-auth/shared";
import { getOfficialAccountStoragePolicy } from "../account-auth/store";

type AccountStore = typeof listProviderAccounts;
type AccessTokenResolver = typeof getAccessToken;

export interface CodexAccountAuthDependencies {
  listAccounts: AccountStore;
  resolveAccessToken: AccessTokenResolver;
  loadCliAuth: typeof loadCodexAuth;
  refreshCliAuth: typeof refreshCodexAuth;
  storagePolicy: typeof getOfficialAccountStoragePolicy;
}

const defaultDependencies: CodexAccountAuthDependencies = {
  listAccounts: listProviderAccounts,
  resolveAccessToken: getAccessToken,
  loadCliAuth: loadCodexAuth,
  refreshCliAuth: refreshCodexAuth,
  storagePolicy: getOfficialAccountStoragePolicy,
};

function extractAccountId(accessToken: string): string {
  const payload = decodeJwtPayload(accessToken);
  const claim = payload?.["https://api.openai.com/auth"];
  if (claim && typeof claim === "object" && !Array.isArray(claim)) {
    const value = (claim as Record<string, unknown>).chatgpt_account_id;
    if (typeof value === "string") return value;
  }
  return "";
}

/**
 * Pick the official account execution should use when several exist.
 * Accounts whose access token is still valid win over ones that must be
 * refreshed, and ties break toward the most recently updated record.
 */
export function selectOfficialCodexAccount(
  listAccounts: AccountStore = listProviderAccounts,
  storagePolicy: typeof getOfficialAccountStoragePolicy = getOfficialAccountStoragePolicy,
): AccountCredentialRecord | undefined {
  let accounts: AccountCredentialRecord[];
  try {
    accounts = listAccounts("openai-codex", storagePolicy());
  } catch {
    return undefined;
  }
  const usable = accounts.filter(
    (account) =>
      account.credentials.access.trim() || account.credentials.refresh.trim(),
  );
  if (!usable.length) return undefined;
  return usable.sort((left, right) => {
    const leftValid = left.credentials.expires > Date.now() ? 1 : 0;
    const rightValid = right.credentials.expires > Date.now() ? 1 : 0;
    if (leftValid !== rightValid) return rightValid - leftValid;
    return right.updatedAt - left.updatedAt;
  })[0];
}

function toCodexAuth(
  account: AccountCredentialRecord,
  accessToken: string,
): CodexAuth {
  return {
    OPENAI_API_KEY: null,
    auth_mode: "chatgpt",
    last_refresh: new Date(account.updatedAt).toISOString(),
    tokens: {
      id_token: account.credentials.idToken ?? "",
      access_token: accessToken,
      // Blank on purpose: the official record owns the rotating grant and
      // refreshes inside the SDK, never inside this execution-shaped copy.
      // The empty value also marks the credential as account-store sourced
      // for the refresh path below.
      refresh_token: "",
      account_id:
        account.organizationId?.trim() || extractAccountId(accessToken),
    },
  };
}

function hasCliTokenPair(auth: CodexAuth | undefined): auth is CodexAuth {
  return Boolean(
    auth?.tokens.access_token.trim() || auth?.tokens.refresh_token.trim(),
  );
}

async function loadOfficialAccountAuth(
  account: AccountCredentialRecord,
  dependencies: CodexAccountAuthDependencies,
): Promise<CodexAuth> {
  const accessToken = await dependencies.resolveAccessToken(
    "openai-codex",
    account.id,
    { storagePolicy: dependencies.storagePolicy() },
  );
  if (!accessToken) {
    throw new Error(
      `The signed-in Codex account "${account.label}" could not produce an access token. Sign in again.`,
    );
  }
  return toCodexAuth(account, accessToken);
}

/**
 * Resolve Codex execution credentials, preferring the Codex CLI auth store
 * exactly like the account probe chain, then falling back to the official
 * Eliza account store.
 *
 * In-app OAuth sign-in persists accounts only in the official store, while
 * the upstream plugin's default loader reads nothing but the CLI file, so a
 * successful sign-in could not execute a single turn. Tokens are never copied
 * between the two stores: the refresh grant rotates, and a copied snapshot
 * would strand whichever copy did not refresh last.
 */
export async function loadOfficialCodexAccountAuth(
  path?: string,
  dependencies: CodexAccountAuthDependencies = defaultDependencies,
): Promise<CodexAuth> {
  const authPath = path ?? defaultAuthPath();
  const cliAuth = await dependencies.loadCliAuth(authPath).then(
    (auth) => auth,
    () => undefined,
  );
  if (hasCliTokenPair(cliAuth)) {
    return cliAuth;
  }
  const account = selectOfficialCodexAccount(
    dependencies.listAccounts,
    dependencies.storagePolicy,
  );
  if (!account) {
    // Neither store can authenticate. Re-run the upstream load so callers
    // keep the exact CLI error shape they surfaced before this bridge.
    return dependencies.loadCliAuth(authPath);
  }
  return loadOfficialAccountAuth(account, dependencies);
}

/**
 * Refresh hook for host execution. CLI-sourced credentials keep the upstream
 * file-based refresh; account-store credentials reload through the SDK's
 * serialized official-record refresh. When the CLI refresh grant is dead but
 * an official account exists, fall back to it rather than failing the turn.
 */
export async function refreshOfficialCodexAccountAuth(
  currentAuth: CodexAuth,
  path?: string,
  dependencies: CodexAccountAuthDependencies = defaultDependencies,
): Promise<CodexAuth> {
  const accountStoreSourced = !currentAuth.tokens.refresh_token.trim();
  if (!accountStoreSourced) {
    try {
      return await dependencies.refreshCliAuth(
        currentAuth,
        path ?? defaultAuthPath(),
      );
    } catch (error) {
      const account = selectOfficialCodexAccount(
        dependencies.listAccounts,
        dependencies.storagePolicy,
      );
      if (!account) throw error;
      return loadOfficialAccountAuth(account, dependencies);
    }
  }
  const account = selectOfficialCodexAccount(
    dependencies.listAccounts,
    dependencies.storagePolicy,
  );
  if (!account) {
    throw new Error(
      "The signed-in Codex account is no longer available. Sign in again.",
    );
  }
  return loadOfficialAccountAuth(account, dependencies);
}
