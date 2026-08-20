import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { AccountCard } from "@elizaos/ui/components/accounts/AccountCard";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AccountPoolAccount,
  AccountPoolProvider,
  AccountPoolProviderSnapshot,
  ProviderAuthProvider,
} from "../../shared/contracts";
import { toElizaAccount } from "../account-pool-ui";
import type { AccountImportDraft } from "../agent-pages-helpers";
import { UiIcon } from "../components/UiIcon";
import { Badge } from "../lib";
import {
  PROVIDER_ACCOUNT_PREVIEWED_CLASS,
  PROVIDER_IMPORT_ACTION_CLASS,
  PROVIDER_IMPORT_DISCLOSURE_CLASS,
  PROVIDER_IMPORT_FORM_CLASS,
  PROVIDER_POOL_ACCOUNT_CLASS,
  PROVIDER_POOL_ACCOUNTS_CLASS,
  PROVIDER_POOL_COUNT_CLASS,
  PROVIDER_POOL_DIRECT_ACCOUNT_CLASS,
  PROVIDER_POOL_DIRECTORY_CLASS,
  PROVIDER_POOL_DIRECTORY_HEADER_CLASS,
  PROVIDER_POOL_EMPTY_CLASS,
} from "./layout";

function sortedAccounts(snapshot: AccountPoolProviderSnapshot) {
  return snapshot.accounts
    .map(toElizaAccount)
    .sort((left, right) =>
      left.priority === right.priority
        ? left.createdAt - right.createdAt
        : left.priority - right.priority,
    );
}

export function AccountPoolDirectory({
  accountImport,
  authProvider,
  busy,
  descriptor,
  direct,
  onAccountImportChange,
  onDelete,
  onImportDirect,
  onMove,
  onPatch,
  onRefreshUsage,
  onSignIn,
  onTest,
  selectedAccountId,
  snapshot,
}: {
  accountImport?: AccountImportDraft;
  authProvider?: ProviderAuthProvider;
  busy: string;
  descriptor: {
    label: string;
    provider: AccountPoolProvider;
  };
  onAccountImportChange: (draft: AccountImportDraft) => void;
  onDelete: (account: AccountPoolAccount) => Promise<void>;
  onImportDirect?: (draft: AccountImportDraft) => Promise<void>;
  onMove: (
    accounts: AccountWithCredentialFlag[],
    accountId: string,
    direction: "up" | "down",
  ) => Promise<void>;
  onPatch: (
    account: Pick<AccountPoolAccount, "accountId" | "label">,
    changes: Partial<
      Pick<AccountPoolAccount, "label" | "enabled" | "priority">
    >,
  ) => Promise<void>;
  onRefreshUsage: (account: AccountWithCredentialFlag) => Promise<void>;
  onSignIn: (provider: ProviderAuthProvider) => void;
  onTest: (account: AccountWithCredentialFlag) => Promise<void>;
  selectedAccountId?: string;
  snapshot: AccountPoolProviderSnapshot;
  direct?: boolean;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [secretKeyName, setSecretKeyName] = useState(
    accountImport?.secretKeyName ?? "",
  );
  const accounts = sortedAccounts(snapshot);

  useEffect(() => {
    setSecretKeyName(accountImport?.secretKeyName ?? "");
  }, [accountImport?.secretKeyName]);

  return (
    <section
      className={`${PROVIDER_POOL_DIRECTORY_CLASS} ${direct ? "is-direct" : ""}`}
      data-direct-account-pool={direct ? "true" : undefined}
      aria-label={`${descriptor.label} accounts`}
    >
      <div className={PROVIDER_POOL_DIRECTORY_HEADER_CLASS}>
        <div>
          <h4>Accounts</h4>
          <span className={PROVIDER_POOL_COUNT_CLASS}>
            {accounts.length || "None"}
          </span>
        </div>
        <small>Credentials stay local in Eliza.</small>
      </div>

      {accounts.length === 0 ? (
        <p className={PROVIDER_POOL_EMPTY_CLASS}>
          Connect one account to start agent sessions. Add a second for
          automatic fallback.
        </p>
      ) : (
        <ul className={PROVIDER_POOL_ACCOUNTS_CLASS}>
          {accounts.map((account, index) => {
            const sourceAccount = snapshot.accounts.find(
              (candidate) => candidate.accountId === account.id,
            );
            return (
              <li
                className={`${PROVIDER_POOL_ACCOUNT_CLASS} ${direct ? PROVIDER_POOL_DIRECT_ACCOUNT_CLASS : ""} ${selectedAccountId === account.id ? PROVIDER_ACCOUNT_PREVIEWED_CLASS : ""}`}
                key={account.id}
              >
                {selectedAccountId === account.id ? (
                  <Badge tone="good">Next account</Badge>
                ) : null}
                <AccountCard
                  account={account}
                  isFirst={index === 0}
                  isLast={index === accounts.length - 1}
                  onDelete={() =>
                    sourceAccount ? onDelete(sourceAccount) : Promise.resolve()
                  }
                  onMoveDown={() => onMove(accounts, account.id, "down")}
                  onMoveUp={() => onMove(accounts, account.id, "up")}
                  onPatch={(changes) =>
                    onPatch(
                      { accountId: account.id, label: account.label },
                      changes,
                    )
                  }
                  onRefreshUsage={() => onRefreshUsage(account)}
                  onTest={() => onTest(account)}
                  refreshBusy={
                    busy === `${descriptor.provider}:${account.id}:usage`
                  }
                  saving={Boolean(busy)}
                  testBusy={
                    busy === `${descriptor.provider}:${account.id}:test`
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <details
        className={PROVIDER_IMPORT_DISCLOSURE_CLASS}
        onToggle={(event) => setSetupOpen(event.currentTarget.open)}
        open={setupOpen}
      >
        <summary>
          <span>
            <strong>
              {accounts.length ? "Add account" : "Connect account"}
            </strong>
          </span>
          <UiIcon icon={Plus} size="xs" />
        </summary>
        <div className={PROVIDER_IMPORT_FORM_CLASS}>
          <label
            className="form-field"
            htmlFor={`account-pool-${descriptor.provider}-id`}
          >
            <span>Account ID</span>
            <Input
              id={`account-pool-${descriptor.provider}-id`}
              onChange={(event) =>
                onAccountImportChange({
                  accountId: event.target.value,
                  label: accountImport?.label ?? "",
                  secretKeyName: accountImport?.secretKeyName ?? secretKeyName,
                })
              }
              placeholder={
                direct
                  ? `${descriptor.provider}-account`
                  : `${authProvider}-timestamp`
              }
              value={accountImport?.accountId ?? ""}
            />
          </label>
          {direct ? (
            <label
              className="form-field"
              htmlFor={`account-pool-${descriptor.provider}-secret`}
            >
              <span>Eliza secret name</span>
              <Input
                id={`account-pool-${descriptor.provider}-secret`}
                onChange={(event) => {
                  const value = event.target.value;
                  setSecretKeyName(value);
                  onAccountImportChange({
                    accountId: accountImport?.accountId ?? "",
                    label: accountImport?.label ?? "",
                    secretKeyName: value,
                  });
                }}
                placeholder="OPENAI_API_KEY"
                value={accountImport?.secretKeyName ?? secretKeyName}
              />
            </label>
          ) : null}
          <label
            className="form-field"
            htmlFor={`account-pool-${descriptor.provider}-label`}
          >
            <span>Display label</span>
            <Input
              id={`account-pool-${descriptor.provider}-label`}
              onChange={(event) =>
                onAccountImportChange({
                  accountId: accountImport?.accountId ?? "",
                  label: event.target.value,
                  secretKeyName: accountImport?.secretKeyName ?? secretKeyName,
                })
              }
              placeholder={`${descriptor.label} account`}
              value={accountImport?.label ?? ""}
            />
          </label>
          <div className={PROVIDER_IMPORT_ACTION_CLASS}>
            <p>
              {direct
                ? "Use the name of an existing Eliza secret. The raw key never enters Doolittle."
                : "The official provider flow opens outside Doolittle. Tokens are never returned to this page."}
            </p>
            <Button
              onClick={() =>
                direct
                  ? void onImportDirect?.({
                      accountId: accountImport?.accountId ?? "",
                      label: accountImport?.label ?? "",
                      secretKeyName:
                        accountImport?.secretKeyName ?? secretKeyName,
                    })
                  : authProvider && onSignIn(authProvider)
              }
              disabled={Boolean(busy)}
              type="button"
            >
              {direct ? "Add API account" : "Sign in & add"}
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
