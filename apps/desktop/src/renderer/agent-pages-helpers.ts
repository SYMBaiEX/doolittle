import type {
  AccountPoolAccount,
  AccountPoolProvider,
} from "../shared/contracts";

export interface AccountImportDraft {
  accountId: string;
  label: string;
  /** Name of an existing Eliza secret; the raw key never enters renderer state. */
  secretKeyName?: string;
}

export function clearAccountImportDraft(
  drafts: Partial<Record<AccountPoolProvider, AccountImportDraft>>,
  provider: AccountPoolProvider,
): Partial<Record<AccountPoolProvider, AccountImportDraft>> {
  const next = { ...drafts };
  delete next[provider];
  return next;
}

export function accountPoolProgress(accounts: AccountPoolAccount[]): {
  enabled: number;
  healthy: number;
  nextStep: "first-account" | "second-account" | "strategy" | "verify";
} {
  const enabled = accounts.filter((account) => account.enabled).length;
  const healthy = accounts.filter((account) =>
    ["healthy", "ready", "ok", "good"].includes(
      account.health.trim().toLowerCase(),
    ),
  ).length;
  return {
    enabled,
    healthy,
    nextStep:
      accounts.length === 0
        ? "first-account"
        : accounts.length === 1
          ? "second-account"
          : enabled === 0
            ? "strategy"
            : "verify",
  };
}
