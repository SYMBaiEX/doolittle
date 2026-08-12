import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { RotationStrategyPicker } from "@elizaos/ui/components/accounts/RotationStrategyPicker";
import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
import type {
  AccountPoolAccount,
  AccountPoolProvider,
  AccountPoolProviderSnapshot,
  AccountPoolStrategy,
  ProviderAuthProvider,
} from "../../shared/contracts";
import type { AccountImportDraft } from "../agent-pages-helpers";
import { accountPoolProgress } from "../agent-pages-helpers";
import { Badge, EmptyBlock } from "../lib";
import { AccountPoolDirectory } from "./AccountPoolDirectory";

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
  const [expanded, setExpanded] = useState(false);

  if (!snapshot) {
    return (
      <section
        aria-label={`${descriptor.label} spawned-agent account pool`}
        className="provider-pool-panel is-unavailable"
      >
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
      </section>
    );
  }

  const progress = accountPoolProgress(snapshot.accounts);
  const accounts = snapshot.accounts;
  const needsAuthRepair = accounts.some(
    (account) =>
      account.health === "needs-reauth" || account.health === "invalid",
  );

  return (
    <section
      aria-label={`${descriptor.label} spawned-agent account pool`}
      className={
        expanded ? "provider-pool-panel is-expanded" : "provider-pool-panel"
      }
    >
      <header className="provider-pool-panel__header">
        <div className="provider-identity-mark" aria-hidden="true">
          {descriptor.shortLabel}
        </div>
        <div className="provider-pool-panel__title">
          <h3>{descriptor.label}</h3>
          <p>
            {progress.enabled} active · {progress.healthy} ready
          </p>
        </div>
        <div className="provider-pool-header-actions">
          <Badge tone={bridgeInstalled ? "good" : "warn"}>
            {bridgeInstalled ? "Eliza native" : "Unavailable"}
          </Badge>
          {needsAuthRepair ? (
            <Button
              onClick={() => onSignIn(authProvider)}
              disabled={Boolean(busy)}
              type="button"
              variant="secondary"
            >
              Repair auth
            </Button>
          ) : null}
          <Button
            aria-controls={`provider-pool-${descriptor.provider}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            type="button"
            variant="secondary"
          >
            {expanded ? "Done" : "Manage"}
          </Button>
        </div>
      </header>

      <div
        className="provider-pool-body"
        hidden={!expanded}
        id={`provider-pool-${descriptor.provider}`}
      >
        <div className="provider-pool-toolbar">
          <dl className="provider-pool-summary" aria-label="Pool readiness">
            <div>
              <dt>Active</dt>
              <dd>
                {progress.enabled}/{accounts.length}
              </dd>
            </div>
            <div>
              <dt>Ready</dt>
              <dd className={progress.healthy > 0 ? "is-good" : "is-warn"}>
                {progress.healthy}
              </dd>
            </div>
          </dl>

          <div className="provider-pool-routing">
            <label
              className="provider-pool-routing__label"
              htmlFor={`rotation-strategy-${descriptor.provider}`}
            >
              Strategy
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
              className="secondary-button provider-pool-preview"
              onClick={onPreview}
              disabled={Boolean(busy) || progress.enabled === 0}
              type="button"
              variant="secondary"
            >
              Preview
            </Button>
          </div>
        </div>

        <AccountPoolDirectory
          accountImport={accountImport}
          authProvider={authProvider}
          busy={busy}
          descriptor={descriptor}
          onAccountImportChange={onAccountImportChange}
          onDelete={onDelete}
          onMove={onMove}
          onPatch={onPatch}
          onRefreshUsage={onRefreshUsage}
          onSignIn={onSignIn}
          onTest={onTest}
          selectedAccountId={selectedAccountId}
          snapshot={snapshot}
        />
      </div>
    </section>
  );
}
