import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
import type {
  AccountPoolResponse,
  ProviderAuthProvider,
} from "../shared/contracts";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import { AccountPoolPanel } from "./connections/AccountPoolPanel";
import { ProviderConnectionRow } from "./connections/ProviderConnectionRow";
import { ProviderRouteSummary } from "./connections/ProviderRouteSummary";
import {
  type AccountsResponse,
  useConnectionsActions,
} from "./connections/useConnectionsActions";
import {
  asRecord,
  asString,
  ErrorBlock,
  LoadingBlock,
  Notice,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import "./agent-pages.css";

export function connectionsResourcePolicy(active: boolean, poolOpen: boolean) {
  return {
    accounts: active,
    accountPool: active && poolOpen,
  };
}

const accountProviders = [
  {
    key: "elizacloud",
    snapshot: "elizaCloud",
    poolProvider: undefined,
    label: "Eliza Cloud",
    shortLabel: "EC",
    accountSignIn: false,
  },
  {
    key: "codex",
    snapshot: "codex",
    poolProvider: "openai-codex",
    label: "Codex",
    shortLabel: "CX",
    accountSignIn: true,
  },
  {
    key: "claude-code",
    snapshot: "claudeCode",
    poolProvider: "anthropic-subscription",
    label: "Claude Code",
    shortLabel: "CC",
    accountSignIn: true,
  },
  {
    key: "devin",
    snapshot: "devin",
    poolProvider: undefined,
    label: "Devin",
    shortLabel: "DV",
    accountSignIn: false,
  },
] as const;

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
  selectedProviderReady,
}: {
  configuredProvider?: string;
  selectedProviderLabel?: string;
  selectedProviderReady: boolean;
}): string | undefined {
  if (selectedProviderLabel) {
    return selectedProviderReady ? selectedProviderLabel : "Needs sign-in";
  }
  return providerRouteLabel(configuredProvider);
}

export function ConnectionsPage({
  active,
  embedded = false,
}: {
  active: boolean;
  embedded?: boolean;
}) {
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
  const displayedProviders = embedded
    ? [...accountProviders].sort(
        (left, right) =>
          Number(right.accountSignIn) - Number(left.accountSignIn),
      )
    : accountProviders;
  const {
    accountImports,
    authStates,
    busy,
    cancelAccountSignIn,
    deleteAccount,
    feedback,
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

  const refresh = () => {
    if (!active) return;
    void mutate("all", "refresh");
  };

  if (!active) {
    return (
      <PagePanel
        className={embedded ? "settings-provider-section" : "page"}
        variant={embedded ? "section" : "workspace"}
      >
        {embedded ? (
          <header className="settings-section-header">
            <div>
              <span className="eyebrow">Accounts</span>
              <h2>Provider sign in</h2>
              <p>
                Use your Codex or Claude subscription. Doolittle opens the
                official account flow and keeps credentials outside the UI.
              </p>
            </div>
            <Button
              className="secondary-button"
              disabled
              onClick={refresh}
              type="button"
              variant="secondary"
            >
              Refresh all
            </Button>
          </header>
        ) : (
          <PageHeader
            actions={
              <Button
                className="secondary-button"
                disabled
                onClick={refresh}
                type="button"
                variant="secondary"
              >
                Refresh all
              </Button>
            }
            description="Connect chat providers and route spawned agents across local account pools."
            eyebrow="Agent"
            title="Providers & accounts"
          />
        )}
        <OfflineRouteState>
          Provider connections and account pools are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </PagePanel>
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
    <PagePanel
      className={embedded ? "settings-provider-section" : "page"}
      variant={embedded ? "section" : "workspace"}
    >
      {embedded ? (
        <header className="settings-section-header">
          <div>
            <span className="eyebrow">Accounts</span>
            <h2>Provider sign in</h2>
            <p>
              Use your Codex or Claude subscription. Doolittle opens the
              official account flow and keeps credentials outside the UI.
            </p>
          </div>
          <Button
            className="secondary-button"
            disabled={!active || Boolean(busy)}
            onClick={refresh}
            type="button"
            variant="secondary"
          >
            Refresh all
          </Button>
        </header>
      ) : (
        <PageHeader
          eyebrow="Agent"
          title="Providers & accounts"
          description="Connect chat providers and route spawned agents across local account pools."
          actions={
            <Button
              className="secondary-button"
              disabled={!active || Boolean(busy)}
              onClick={refresh}
              type="button"
              variant="secondary"
            >
              Refresh all
            </Button>
          }
        />
      )}
      {feedback ? (
        <Notice tone={feedback.tone}>{feedback.message}</Notice>
      ) : null}
      <ResourceStatusBar
        resources={[
          { label: "Accounts", resource },
          { label: "Account pools", resource: accountPool, required: false },
        ]}
      >
        {resource.error && resource.data ? (
          <button
            className="text-button"
            onClick={resource.reload}
            type="button"
          >
            Retry accounts
          </button>
        ) : null}
        {accountPool.error ? (
          <button
            className="text-button"
            onClick={accountPool.reload}
            type="button"
          >
            Retry pools
          </button>
        ) : null}
      </ResourceStatusBar>
      {resource.loading && !resource.data ? (
        <LoadingBlock label="Checking the default chat provider…" />
      ) : resource.error && !resource.data ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : null}
      {resource.data ? (
        <div className={`provider-console ${embedded ? "is-embedded" : ""}`}>
          <section
            className="provider-surface"
            aria-labelledby="provider-connections-title"
          >
            <header className="provider-section-heading is-route-summary">
              <div>
                <span className="eyebrow">Chat routing</span>
                <h2 id="provider-connections-title">Provider connections</h2>
              </div>
              <ProviderRouteSummary
                activeProvider={providerSelectionLabel({
                  configuredProvider,
                  selectedProviderLabel: activeDefault?.provider.label,
                  selectedProviderReady: Boolean(activeDefault?.ready),
                })}
                ready={readyProviderCount}
                total={providerViews.length}
              />
            </header>
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
          </section>

          <details
            className="provider-surface provider-routing-disclosure"
            onToggle={(event) => setPoolOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <span className="eyebrow">Agent routing</span>
                <strong>Subscription account pools</strong>
                <small>Codex and Claude rotation for spawned agents</small>
              </span>
              <span>{poolOpen ? "Hide" : "Manage"}</span>
            </summary>
            <div className="provider-routing-content">
              {accountPool.error ? (
                <ErrorBlock
                  error={accountPool.error}
                  retry={accountPool.reload}
                />
              ) : accountPool.loading ? (
                <LoadingBlock label="Loading Eliza account pools…" />
              ) : (
                <div className="provider-pool-stack">
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
                </div>
              )}
            </div>
          </details>
        </div>
      ) : null}
    </PagePanel>
  );
}
