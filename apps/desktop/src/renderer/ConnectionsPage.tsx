import { Bot, Cable, RefreshCw, Route } from "lucide-react";
import { useState } from "react";
import type {
  AccountPoolProvider,
  AccountPoolResponse,
  ProviderAuthProvider,
} from "../shared/contracts";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import {
  WorkbenchAction,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import { AccountPoolPanel } from "./connections/AccountPoolPanel";
import { PROVIDER_POOL_STACK_CLASS } from "./connections/layout";
import { ProviderConnectionRow } from "./connections/ProviderConnectionRow";
import { ProviderDisclosure } from "./connections/ProviderDisclosure";
import { ProviderRouteSummary } from "./connections/ProviderRouteSummary";
import {
  type AccountsResponse,
  accountProviders,
} from "./connections/provider-accounts";
import { useConnectionsActions } from "./connections/useConnectionsActions";
import {
  asRecord,
  asString,
  ErrorBlock,
  LoadingBlock,
  Notice,
  titleCase,
  useApiResource,
} from "./lib";

export function connectionsResourcePolicy(active: boolean, poolOpen: boolean) {
  return {
    accounts: active,
    accountPool: active && poolOpen,
  };
}

const directAccountProviders = [
  { provider: "openai-api", label: "OpenAI API", shortLabel: "OA" },
  { provider: "anthropic-api", label: "Anthropic API", shortLabel: "AA" },
] as const satisfies ReadonlyArray<{
  provider: Extract<AccountPoolProvider, "openai-api" | "anthropic-api">;
  label: string;
  shortLabel: string;
}>;

export function providerRouteLabel(
  provider: string | undefined,
): string | undefined {
  const normalized = provider?.trim();
  if (!normalized) return undefined;
  const words: Record<string, string> = {
    ai: "AI",
    api: "API",
    cli: "CLI",
    openai: "OpenAI",
  };
  return (
    accountProviders.find((candidate) => candidate.key === normalized)?.label ??
    normalized
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((word) => words[word.toLowerCase()] ?? titleCase(word))
      .join(" ")
  );
}

export function providerSelectionLabel({
  configuredProvider,
  selectedProviderLabel,
  selectedProviderChecked,
  selectedProviderReady,
}: {
  configuredProvider?: string;
  selectedProviderLabel?: string;
  selectedProviderChecked?: boolean;
  selectedProviderReady: boolean;
}): string | undefined {
  if (selectedProviderLabel) {
    if (selectedProviderReady) return selectedProviderLabel;
    return selectedProviderChecked === false
      ? `${selectedProviderLabel} · unchecked`
      : "Needs sign-in";
  }
  return providerRouteLabel(configuredProvider);
}

export function ConnectionsPage({ active }: { active: boolean }) {
  const [poolOpen, setPoolOpen] = useState(false);
  const resourcePolicy = connectionsResourcePolicy(active, poolOpen);
  const accountPool = useApiResource<AccountPoolResponse>(
    resourcePolicy.accountPool ? "/runtime/account-pool" : null,
    [resourcePolicy.accountPool],
  );
  const resource = useApiResource<AccountsResponse>(
    resourcePolicy.accounts ? "/runtime/accounts" : null,
    [resourcePolicy.accounts],
  );
  const inventory = accountPool.data?.inventory;
  const displayedProviders = [...accountProviders].sort(
    (left, right) => Number(right.accountSignIn) - Number(left.accountSignIn),
  );
  const {
    accountImports,
    authStates,
    busy,
    cancelAccountSignIn,
    deleteAccount,
    feedback,
    importDirectAccount,
    movePoolAccount,
    mutate,
    refreshPoolAccountUsage,
    selectAccount,
    selectedAccounts,
    setAccountImports,
    setPoolStrategy,
    startAccountSignIn,
    submitAccountSignInCode,
    testPoolAccount,
    updateAccount,
  } = useConnectionsActions({ accountPool, active, accounts: resource });

  const checkingSaved = busy === "all:refresh";
  const pendingSignIn = Object.values(authStates).some(
    (state) => state.phase === "launching" || state.phase === "waiting",
  );
  const checkAction = active ? (
    <WorkbenchAction
      disabled={Boolean(busy) || pendingSignIn}
      emphasis="secondary"
      icon={RefreshCw}
      onClick={() => void mutate("all", "refresh")}
      type="button"
    >
      {checkingSaved ? "Checking saved accounts…" : "Check saved accounts"}
    </WorkbenchAction>
  ) : null;

  if (!active) {
    return (
      <WorkbenchSection
        className="settings-workbench-section settings-provider-section"
        icon={Cable}
        title="Provider accounts"
      >
        <OfflineRouteState>
          Provider accounts are available when the local runtime is ready.
        </OfflineRouteState>
      </WorkbenchSection>
    );
  }

  const providerViews = displayedProviders.map((provider) => {
    const status = asRecord(resource.data?.accounts?.[provider.snapshot]);
    const ready =
      Boolean(status.nativeReady) ||
      Boolean(status.fallbackReady) ||
      Boolean(status.reusable);
    const authProvider = provider.accountSignIn
      ? (provider.key as ProviderAuthProvider)
      : null;
    return {
      provider,
      status,
      ready,
      isDefault: resource.data?.activeProvider === provider.key,
      authProvider,
      authState: authProvider ? authStates[authProvider] : undefined,
    };
  });
  const activeDefault = providerViews.find((provider) => provider.isDefault);
  const configuredProvider = asString(resource.data?.activeProvider);
  const readyProviderCount = providerViews.filter(
    (provider) => provider.ready,
  ).length;
  return (
    <div className="settings-workbench-section settings-provider-section">
      <WorkbenchSection
        actions={checkAction}
        className="provider-console provider-settings"
        description="Connect accounts and choose the provider used for new chats."
        icon={Cable}
        title="Provider accounts"
      >
        {(!resource.data ||
          inventory === "unchecked" ||
          inventory === "unavailable" ||
          providerViews.some((entry) => entry.status.checked === false)) &&
        window.doolittle.platform === "darwin" ? (
          <p className="m-0 text-sm text-[var(--muted)]">
            Checking saved accounts may open a macOS Keychain prompt.
          </p>
        ) : null}
        {feedback ? (
          <Notice tone={feedback.tone}>{feedback.message}</Notice>
        ) : null}
        {resource.data &&
        (resource.isValidating ||
          accountPool.isValidating ||
          resource.error ||
          accountPool.error) ? (
          <ResourceStatusBar
            resources={[
              { label: "Accounts", resource },
              {
                label: "Account pools",
                resource: accountPool,
                required: false,
              },
            ]}
          >
            {resource.error && resource.data ? (
              <WorkbenchAction
                emphasis="quiet"
                onClick={resource.reload}
                type="button"
              >
                Retry accounts
              </WorkbenchAction>
            ) : null}
            {accountPool.error ? (
              <WorkbenchAction
                emphasis="quiet"
                onClick={accountPool.reload}
                type="button"
              >
                Retry pools
              </WorkbenchAction>
            ) : null}
          </ResourceStatusBar>
        ) : null}
        {resource.loading && !resource.data ? (
          <LoadingBlock label="Loading provider status…" />
        ) : resource.error && !resource.data ? (
          <ErrorBlock error={resource.error} retry={resource.reload} />
        ) : null}
        {resource.data ? (
          <>
            <WorkbenchSection
              headingLevel={3}
              icon={Route}
              title="Chat routing"
            >
              <ProviderRouteSummary
                activeProvider={providerSelectionLabel({
                  configuredProvider,
                  selectedProviderLabel: activeDefault?.provider.label,
                  selectedProviderChecked:
                    activeDefault?.status.checked === false ? false : undefined,
                  selectedProviderReady: Boolean(activeDefault?.ready),
                })}
                ready={readyProviderCount}
                total={providerViews.length}
              />
              <div className="provider-roster">
                {providerViews.map((entry) => (
                  <ProviderConnectionRow
                    authState={entry.authState}
                    busy={Boolean(busy)}
                    descriptor={entry.provider}
                    isDefault={entry.isDefault}
                    key={entry.provider.key}
                    onCancelSignIn={(provider) =>
                      void cancelAccountSignIn(provider)
                    }
                    onConnect={() => void mutate(entry.provider.key, "connect")}
                    onSetDefault={() => void mutate(entry.provider.key, "use")}
                    onSignIn={(provider) => void startAccountSignIn(provider)}
                    onSubmitCode={(provider) =>
                      void submitAccountSignInCode(provider)
                    }
                    ready={entry.ready}
                    status={entry.status}
                  />
                ))}
              </div>
            </WorkbenchSection>

            <ProviderDisclosure
              description="Choose and rotate the accounts used by spawned agents."
              icon={Bot}
              onToggle={(event) => setPoolOpen(event.currentTarget.open)}
              title="Account pools"
            >
              {accountPool.data?.bridgeInstalled &&
              (inventory === "unchecked" || inventory === "unavailable") ? (
                <Notice tone={inventory === "unavailable" ? "warn" : "neutral"}>
                  {inventory === "unavailable"
                    ? "The saved account list could not be checked. Any previously shown accounts are still available here."
                    : "Use Check saved accounts above to load the full account list."}
                </Notice>
              ) : null}
              {accountPool.error ? (
                <ErrorBlock
                  error={accountPool.error}
                  retry={accountPool.reload}
                />
              ) : accountPool.loading ? (
                <LoadingBlock label="Loading Eliza account pools…" />
              ) : (
                <div className={PROVIDER_POOL_STACK_CLASS}>
                  {providerViews.map((entry) => {
                    const poolProvider = entry.provider.poolProvider;
                    if (!poolProvider || !entry.authProvider) return null;
                    return (
                      <AccountPoolPanel
                        accountImport={accountImports[poolProvider]}
                        authProvider={entry.authProvider}
                        bridgeInstalled={Boolean(
                          accountPool.data?.bridgeInstalled,
                        )}
                        busy={busy}
                        descriptor={{
                          label: entry.provider.label,
                          shortLabel: entry.provider.shortLabel,
                          provider: poolProvider,
                        }}
                        key={poolProvider}
                        onAccountImportChange={(draft) =>
                          setAccountImports((current) => ({
                            ...current,
                            [poolProvider]: draft,
                          }))
                        }
                        onDelete={(account) =>
                          deleteAccount(poolProvider, account)
                        }
                        onMove={(accounts, accountId, direction) =>
                          movePoolAccount(
                            poolProvider,
                            accounts,
                            accountId,
                            direction,
                          )
                        }
                        onPatch={(account, changes) =>
                          updateAccount(poolProvider, account, changes)
                        }
                        onPreview={() => void selectAccount(poolProvider)}
                        onRefreshUsage={(account) =>
                          refreshPoolAccountUsage(poolProvider, account)
                        }
                        onSetStrategy={(strategy) =>
                          void setPoolStrategy(poolProvider, strategy)
                        }
                        onSignIn={(provider) =>
                          void startAccountSignIn(provider)
                        }
                        onTest={(account) =>
                          testPoolAccount(poolProvider, account)
                        }
                        selectedAccountId={selectedAccounts[poolProvider]}
                        snapshot={accountPool.data?.providers[poolProvider]}
                      />
                    );
                  })}
                  {directAccountProviders.map((entry) => (
                    <AccountPoolPanel
                      accountImport={accountImports[entry.provider]}
                      bridgeInstalled={Boolean(
                        accountPool.data?.bridgeInstalled,
                      )}
                      busy={busy}
                      descriptor={entry}
                      direct
                      key={entry.provider}
                      onAccountImportChange={(draft) =>
                        setAccountImports((current) => ({
                          ...current,
                          [entry.provider]: draft,
                        }))
                      }
                      onDelete={(account) =>
                        deleteAccount(entry.provider, account)
                      }
                      onImportDirect={(draft) =>
                        importDirectAccount(entry.provider, draft)
                      }
                      onMove={(accounts, accountId, direction) =>
                        movePoolAccount(
                          entry.provider,
                          accounts,
                          accountId,
                          direction,
                        )
                      }
                      onPatch={(account, changes) =>
                        updateAccount(entry.provider, account, changes)
                      }
                      onPreview={() => void selectAccount(entry.provider)}
                      onRefreshUsage={(account) =>
                        refreshPoolAccountUsage(entry.provider, account)
                      }
                      onSetStrategy={(strategy) =>
                        void setPoolStrategy(entry.provider, strategy)
                      }
                      onSignIn={() => undefined}
                      onTest={(account) =>
                        testPoolAccount(entry.provider, account)
                      }
                      selectedAccountId={selectedAccounts[entry.provider]}
                      snapshot={accountPool.data?.providers[entry.provider]}
                    />
                  ))}
                </div>
              )}
            </ProviderDisclosure>
          </>
        ) : null}
      </WorkbenchSection>
    </div>
  );
}
