import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { AccountCard } from "@elizaos/ui/components/accounts/AccountCard";
import { RotationStrategyPicker } from "@elizaos/ui/components/accounts/RotationStrategyPicker";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { useState } from "react";
import type {
  AccountPoolAccount,
  AccountPoolProvider,
  AccountPoolProviderSnapshot,
  AccountPoolStrategy,
  ProviderAuthProvider,
} from "../../shared/contracts";
import { toElizaAccount } from "../account-pool-ui";
import type { AccountImportDraft } from "../agent-pages-helpers";
import { accountPoolProgress } from "../agent-pages-helpers";
import { Badge, EmptyBlock } from "../lib";

function sortedAccounts(snapshot: AccountPoolProviderSnapshot) {
  return snapshot.accounts
    .map(toElizaAccount)
    .sort((left, right) =>
      left.priority === right.priority
        ? left.createdAt - right.createdAt
        : left.priority - right.priority,
    );
}

export function AccountPoolPanel({
  accountImport,
  authProvider,
  bridgeInstalled,
  busy,
  descriptor,
  onAccountImportChange,
  onDelete,
  onMove,
  onPatch,
  onPreview,
  onRefreshUsage,
  onSetStrategy,
  onSignIn,
  onTest,
  selectedAccountId,
  snapshot,
}: {
  accountImport?: AccountImportDraft;
  authProvider: ProviderAuthProvider;
  bridgeInstalled: boolean;
  busy: string;
  descriptor: {
    label: string;
    shortLabel: string;
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
  onPreview: () => void;
  onRefreshUsage: (account: AccountWithCredentialFlag) => Promise<void>;
  onSetStrategy: (strategy: AccountPoolStrategy) => void;
  onSignIn: (provider: ProviderAuthProvider) => void;
  onTest: (account: AccountWithCredentialFlag) => Promise<void>;
  selectedAccountId?: string;
  snapshot?: AccountPoolProviderSnapshot;
}) {
  const [setupOpen, setSetupOpen] = useState(
    !snapshot || snapshot.accounts.length === 0,
  );

  if (!snapshot) {
    return (
      <article className="provider-pool-panel is-unavailable">
        <div className="provider-pool-panel__header">
          <div className="provider-identity-mark" aria-hidden="true">
            {descriptor.shortLabel}
          </div>
          <div>
            <span className="eyebrow">Spawned-agent routing</span>
            <h3>{descriptor.label}</h3>
          </div>
          <div className="provider-pool-bridge-badge">
            <Badge tone="warn">Pool unavailable</Badge>
          </div>
        </div>
        <EmptyBlock title="Account pool is not available">
          Refresh runtime services, then return here to configure agent routing.
        </EmptyBlock>
      </article>
    );
  }

  const progress = accountPoolProgress(snapshot.accounts);
  const accounts = sortedAccounts(snapshot);

  return (
    <article className="provider-pool-panel">
      <header className="provider-pool-panel__header">
        <div className="provider-identity-mark" aria-hidden="true">
          {descriptor.shortLabel}
        </div>
        <div className="provider-pool-panel__title">
          <span className="eyebrow">Spawned-agent routing</span>
          <h3>{descriptor.label}</h3>
          <p>
            Selects an eligible account when a Codex or Claude agent session
            starts.
          </p>
        </div>
        <div className="provider-pool-bridge-badge">
          <Badge tone={bridgeInstalled ? "good" : "warn"}>
            {bridgeInstalled ? "Bridge ready" : "Bridge unavailable"}
          </Badge>
        </div>
      </header>

      <div className="provider-pool-layout">
        <aside className="provider-pool-control">
          <dl className="provider-pool-summary">
            <div>
              <dt>Total</dt>
              <dd>{accounts.length}</dd>
            </div>
            <div>
              <dt>Enabled</dt>
              <dd>{progress.enabled}</dd>
            </div>
            <div>
              <dt>Healthy</dt>
              <dd>{progress.healthy}</dd>
            </div>
          </dl>

          <div className="provider-pool-routing">
            <div>
              <span className="eyebrow">Selection policy</span>
              <p>Applied once when each spawned-agent session begins.</p>
            </div>
            <label
              className="sr-only"
              htmlFor={`rotation-strategy-${descriptor.provider}`}
            >
              Routing strategy
            </label>
            <RotationStrategyPicker
              disabled={Boolean(busy)}
              onChange={(strategy) =>
                onSetStrategy(strategy as AccountPoolStrategy)
              }
              providerId={descriptor.provider}
              value={snapshot.strategy}
            />
            <Button
              onClick={onPreview}
              disabled={Boolean(busy) || progress.enabled === 0}
              type="button"
              variant="secondary"
            >
              Preview next account
            </Button>
          </div>

          <ol
            className="provider-pool-journey"
            aria-label="Pool setup progress"
          >
            {[
              ["first-account", "01", "Connect", "Add the first account"],
              ["second-account", "02", "Resilience", "Add a backup account"],
              ["strategy", "03", "Route", "Choose a selection policy"],
              ["verify", "04", "Verify", "Preview the next account"],
            ].map(([step, number, label, detail]) => {
              const order = [
                "first-account",
                "second-account",
                "strategy",
                "verify",
              ];
              const currentIndex = order.indexOf(progress.nextStep);
              const stepIndex = order.indexOf(step);
              return (
                <li
                  className={
                    step === progress.nextStep
                      ? "current"
                      : stepIndex < currentIndex
                        ? "complete"
                        : ""
                  }
                  key={step}
                >
                  <span>{number}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </li>
              );
            })}
          </ol>
        </aside>

        <section
          className="provider-pool-directory"
          aria-label={`${descriptor.label} accounts`}
        >
          <div className="provider-pool-directory__header">
            <div>
              <span className="eyebrow">Account roster</span>
              <h4>
                {accounts.length
                  ? `${accounts.length} available`
                  : "No accounts yet"}
              </h4>
            </div>
            <small>
              Credentials remain in Eliza&apos;s private local store.
            </small>
          </div>

          {accounts.length === 0 ? (
            <EmptyBlock title={`Connect ${descriptor.label}`}>
              Add one account to start agent sessions, or two to unlock
              resilient routing.
            </EmptyBlock>
          ) : (
            <div className="stack-list provider-pool-accounts">
              {accounts.map((account, index) => {
                const sourceAccount = snapshot.accounts.find(
                  (candidate) => candidate.accountId === account.id,
                );
                return (
                  <div
                    className={
                      selectedAccountId === account.id
                        ? "provider-account-previewed"
                        : undefined
                    }
                    key={account.id}
                  >
                    {selectedAccountId === account.id ? (
                      <Badge tone="good">Previewed next</Badge>
                    ) : null}
                    <AccountCard
                      account={account}
                      isFirst={index === 0}
                      isLast={index === accounts.length - 1}
                      onDelete={() =>
                        sourceAccount
                          ? onDelete(sourceAccount)
                          : Promise.resolve()
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
                  </div>
                );
              })}
            </div>
          )}

          <details
            className="provider-import-disclosure"
            onToggle={(event) => setSetupOpen(event.currentTarget.open)}
            open={setupOpen}
          >
            <summary>
              <span>
                <strong>
                  {accounts.length
                    ? "Add another account"
                    : "Set up first account"}
                </strong>
                <small>Optional ID and label</small>
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
      </div>
    </article>
  );
}
