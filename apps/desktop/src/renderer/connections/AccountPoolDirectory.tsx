import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { AccountCard } from "@elizaos/ui/components/accounts/AccountCard";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { useState } from "react";
import type {
  AccountPoolAccount,
  AccountPoolProvider,
  AccountPoolProviderSnapshot,
  ProviderAuthProvider,
} from "../../shared/contracts";
import { toElizaAccount } from "../account-pool-ui";
import type { AccountImportDraft } from "../agent-pages-helpers";
import { Badge } from "../lib";

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
  onAccountImportChange,
  onDelete,
  onMove,
  onPatch,
  onRefreshUsage,
  onSignIn,
  onTest,
  selectedAccountId,
  snapshot,
}: {
  accountImport?: AccountImportDraft;
  authProvider: ProviderAuthProvider;
  busy: string;
  descriptor: {
    label: string;
    provider: AccountPoolProvider;
  };
  onAccountImportChange: (draft: AccountImportDraft) => void;
  onDelete: (account: AccountPoolAccount) => Promise<void>;
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
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const accounts = sortedAccounts(snapshot);

  return (
    <section
      className="provider-pool-directory"
      aria-label={`${descriptor.label} accounts`}
    >
      <div className="provider-pool-directory__header">
        <div>
          <h4>Accounts</h4>
          <span className="provider-pool-count">
            {accounts.length || "None"}
          </span>
        </div>
        <small>Credentials stay local in Eliza.</small>
      </div>

      {accounts.length === 0 ? (
        <p className="provider-pool-empty-copy">
          Connect one account to start agent sessions. Add a second for
          automatic fallback.
        </p>
      ) : (
        <ul className="provider-pool-accounts">
          {accounts.map((account, index) => {
            const sourceAccount = snapshot.accounts.find(
              (candidate) => candidate.accountId === account.id,
            );
            return (
              <li
                className={
                  selectedAccountId === account.id
                    ? "provider-pool-account provider-account-previewed"
                    : "provider-pool-account"
                }
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
        className="provider-import-disclosure"
        onToggle={(event) => setSetupOpen(event.currentTarget.open)}
        open={setupOpen}
      >
        <summary>
          <span>
            <strong>
              {accounts.length ? "Add account" : "Connect account"}
            </strong>
          </span>
          <span aria-hidden="true">+</span>
        </summary>
        <div className="provider-import-form">
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
                })
              }
              placeholder={`${authProvider}-timestamp`}
              value={accountImport?.accountId ?? ""}
            />
          </label>
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
                })
              }
              placeholder={`${descriptor.label} account`}
              value={accountImport?.label ?? ""}
            />
          </label>
          <div className="provider-import-action">
            <p>
              The official provider flow opens outside Doolittle. Tokens are
              never returned to this page.
            </p>
            <Button
              onClick={() => onSignIn(authProvider)}
              disabled={Boolean(busy)}
              type="button"
            >
              Sign in &amp; add
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
