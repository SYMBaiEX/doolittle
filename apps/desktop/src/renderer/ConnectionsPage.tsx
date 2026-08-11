import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccountPoolAccount,
  AccountPoolDeleteResponse,
  AccountPoolProvider,
  AccountPoolResponse,
  AccountPoolStrategy,
  ProviderAuthProvider,
  ProviderAuthState,
} from "../shared/contracts";
import {
  type AccountImportDraft,
  clearAccountImportDraft,
} from "./agent-pages-helpers";
import { AccountPoolPanel } from "./connections/AccountPoolPanel";
import { ProviderConnectionRow } from "./connections/ProviderConnectionRow";
import {
  type ActionFeedback,
  asRecord,
  asString,
  desktopRequest,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import "./agent-pages.css";

interface AccountsResponse {
  activeProvider?: string;
  accounts?: Record<string, unknown>;
  connect?: Record<string, unknown>;
}

export function connectionsResourcePolicy(active: boolean, poolOpen: boolean) {
  return {
    accounts: active,
    accountPool: active && poolOpen,
  };
}

function accountPoolProviderFor(
  provider: ProviderAuthProvider,
): AccountPoolProvider {
  return provider === "codex" ? "openai-codex" : "anthropic-subscription";
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
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<
    Partial<Record<AccountPoolProvider, string>>
  >({});
  const [accountImports, setAccountImports] = useState<
    Partial<Record<AccountPoolProvider, AccountImportDraft>>
  >({});
  const [authStates, setAuthStates] = useState<
    Partial<Record<ProviderAuthProvider, ProviderAuthState>>
  >({});
  const completedAuth = useRef(new Set<ProviderAuthProvider>());
  const displayedProviders = embedded
    ? [...accountProviders].sort(
        (left, right) =>
          Number(right.accountSignIn) - Number(left.accountSignIn),
      )
    : accountProviders;

  const setAuthState = useCallback((state: ProviderAuthState) => {
    setAuthStates((current) => ({ ...current, [state.provider]: state }));
  }, []);

  const finishAccountSignIn = useCallback(
    async (provider: ProviderAuthProvider) => {
      if (completedAuth.current.has(provider)) return;
      completedAuth.current.add(provider);
      setBusy(`${provider}:finish-sign-in`);
      try {
        await desktopRequest("/accounts/refresh", "POST", { provider });
        const result = await desktopRequest<Record<string, unknown>>(
          "/accounts/connect",
          "POST",
          { provider },
        );
        setFeedback({
          message:
            asString(result.detail) ||
            `${titleCase(provider)} is signed in and ready to use.`,
          tone: "good",
        });
        const poolProvider = accountPoolProviderFor(provider);
        setAccountImports((current) =>
          clearAccountImportDraft(current, poolProvider),
        );
        accountPool.reload();
        setAuthState(await window.doolittle.acknowledgeProviderAuth(provider));
        resource.reload();
      } catch (error) {
        completedAuth.current.delete(provider);
        setFeedback({ message: errorMessage(error), tone: "bad" });
      } finally {
        setBusy("");
      }
    },
    [accountPool.reload, resource.reload, setAuthState],
  );

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void Promise.all(
      (["codex", "claude-code"] as const).map((provider) =>
        window.doolittle.getProviderAuthState(provider),
      ),
    )
      .then((states) => {
        if (!mounted) return;
        setAuthStates(
          Object.fromEntries(states.map((state) => [state.provider, state])),
        );
        for (const state of states) {
          if (state.phase === "succeeded") {
            void finishAccountSignIn(state.provider);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [active, finishAccountSignIn]);

  const pendingAuthProviders = (["codex", "claude-code"] as const).filter(
    (provider) => {
      const phase = authStates[provider]?.phase;
      return phase === "launching" || phase === "waiting";
    },
  );
  useIntervalWhenDocumentVisible(
    () => {
      for (const provider of pendingAuthProviders) {
        void window.doolittle
          .getProviderAuthState(provider)
          .then((state) => {
            setAuthState(state);
            if (state.phase === "succeeded") {
              void finishAccountSignIn(provider);
            }
          })
          .catch((error) =>
            setFeedback({ message: errorMessage(error), tone: "bad" }),
          );
      }
    },
    1_000,
    active && pendingAuthProviders.length > 0,
  );

  const startAccountSignIn = async (provider: ProviderAuthProvider) => {
    completedAuth.current.delete(provider);
    setBusy(`${provider}:sign-in`);
    setFeedback(null);
    try {
      const draft = accountImports[accountPoolProviderFor(provider)];
      const state = await window.doolittle.startProviderAuth(provider, {
        accountId: draft?.accountId.trim() || undefined,
        label: draft?.label.trim() || undefined,
      });
      setAuthState(state);
      if (state.phase === "succeeded") {
        await finishAccountSignIn(provider);
      } else if (state.phase === "failed") {
        setFeedback({ message: state.message, tone: "bad" });
      }
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const submitAccountSignInCode = async (provider: ProviderAuthProvider) => {
    setBusy(`${provider}:submit-code`);
    setFeedback(null);
    try {
      setAuthState(await window.doolittle.submitProviderAuthCode(provider));
      setFeedback({
        message: `${titleCase(provider)} sign-in code submitted.`,
        tone: "good",
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const cancelAccountSignIn = async (provider: ProviderAuthProvider) => {
    setBusy(`${provider}:cancel-sign-in`);
    setFeedback(null);
    try {
      setAuthState(await window.doolittle.cancelProviderAuth(provider));
      setFeedback({
        message: `${titleCase(provider)} sign-in cancelled.`,
        tone: "neutral",
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const mutate = async (
    provider: string,
    action: "refresh" | "use" | "connect" | "login",
  ) => {
    setBusy(`${provider}:${action}`);
    setFeedback(null);
    try {
      const result = await desktopRequest<Record<string, unknown>>(
        `/accounts/${action}`,
        "POST",
        { provider },
      );
      const detail =
        asString(result.detail) ||
        asString(result.advice) ||
        `${titleCase(provider)} ${action} request completed.`;
      setFeedback({ message: detail, tone: "good" });
      resource.reload();
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const updateAccount = async (
    provider: AccountPoolProvider,
    account: Pick<AccountPoolAccount, "accountId" | "label">,
    changes: Partial<
      Pick<AccountPoolAccount, "label" | "enabled" | "priority">
    >,
  ) => {
    setBusy(`${provider}:${account.accountId}:update`);
    setFeedback(null);
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.accountId)}`,
        "PATCH",
        changes,
      );
      setFeedback({ message: `${account.label} was updated.`, tone: "good" });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const selectAccount = async (provider: AccountPoolProvider) => {
    setBusy(`${provider}:select`);
    setFeedback(null);
    try {
      const result = await desktopRequest<{
        account?: AccountPoolAccount | null;
      }>(`/runtime/account-pool/${provider}/select`, "POST");
      if (result.account) {
        setSelectedAccounts((current) => ({
          ...current,
          [provider]: result.account?.accountId,
        }));
        setFeedback({
          message: `Strategy selected ${result.account.label} for this preview; spawned agents select per session.`,
          tone: "good",
        });
      } else {
        setFeedback({
          message: "No enabled account is available for this provider.",
          tone: "warn",
        });
      }
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const setPoolStrategy = async (
    provider: AccountPoolProvider,
    strategy: AccountPoolStrategy,
  ) => {
    setBusy(`${provider}:strategy`);
    setFeedback(null);
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/strategy`,
        "POST",
        {
          strategy,
        },
      );
      setFeedback({
        message: `${titleCase(provider)} rotation strategy updated.`,
        tone: "good",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const testPoolAccount = async (
    provider: AccountPoolProvider,
    account: AccountWithCredentialFlag,
  ) => {
    const key = `${provider}:${account.id}:test`;
    setBusy(key);
    setFeedback(null);
    try {
      const result = await desktopRequest<{
        ok: boolean;
        latencyMs?: number;
        error?: string;
      }>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}/test`,
        "POST",
      );
      setFeedback({
        message: result.ok
          ? `${account.label} passed its credential check${typeof result.latencyMs === "number" ? ` in ${result.latencyMs}ms` : ""}.`
          : `${account.label} failed its credential check: ${result.error ?? "unknown provider error"}`,
        tone: result.ok ? "good" : "bad",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const refreshPoolAccountUsage = async (
    provider: AccountPoolProvider,
    account: AccountWithCredentialFlag,
  ) => {
    const key = `${provider}:${account.id}:usage`;
    setBusy(key);
    setFeedback(null);
    try {
      const result = await desktopRequest<{ error?: string }>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}/refresh-usage`,
        "POST",
      );
      setFeedback({
        message: result.error
          ? `${account.label} usage could not be refreshed: ${result.error}`
          : `${account.label} usage and health were refreshed.`,
        tone: result.error ? "bad" : "good",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const movePoolAccount = async (
    provider: AccountPoolProvider,
    accounts: AccountWithCredentialFlag[],
    accountId: string,
    direction: "up" | "down",
  ) => {
    const index = accounts.findIndex((account) => account.id === accountId);
    const neighbourIndex = direction === "up" ? index - 1 : index + 1;
    const account = accounts[index];
    const neighbour = accounts[neighbourIndex];
    if (!account || !neighbour || account.priority === neighbour.priority) {
      return;
    }
    setBusy(`${provider}:${account.id}:reorder`);
    setFeedback(null);
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}`,
        "PATCH",
        { priority: neighbour.priority },
      );
      try {
        await desktopRequest(
          `/runtime/account-pool/${provider}/${encodeURIComponent(neighbour.id)}`,
          "PATCH",
          { priority: account.priority },
        );
      } catch (error) {
        await desktopRequest(
          `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}`,
          "PATCH",
          { priority: account.priority },
        ).catch(() => undefined);
        throw error;
      }
      setFeedback({
        message: `${account.label} priority was updated.`,
        tone: "good",
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      accountPool.reload();
      setBusy("");
    }
  };

  const deleteAccount = async (
    provider: AccountPoolProvider,
    account: AccountPoolAccount,
  ) => {
    setBusy(`${provider}:${account.accountId}:delete`);
    setFeedback(null);
    try {
      const result = await desktopRequest<AccountPoolDeleteResponse>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.accountId)}`,
        "DELETE",
      );
      if (!result.deleted || result.credentialsRetained !== false) {
        throw new Error(
          "The account was not disconnected from credential storage.",
        );
      }
      setSelectedAccounts((current) => {
        const next = { ...current };
        if (next[provider] === account.accountId) delete next[provider];
        return next;
      });
      setFeedback({
        message: `${account.label} was disconnected and removed.`,
        tone: "good",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

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
            onClick={() => void mutate("all", "refresh")}
            disabled={Boolean(busy)}
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
          description="Route chats, connect provider subscriptions, and shape how spawned agents move across pooled accounts."
          actions={
            <Button
              className="secondary-button"
              onClick={() => void mutate("all", "refresh")}
              disabled={Boolean(busy)}
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
      {resource.loading ? (
        <LoadingBlock label="Checking the default chat provider…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : null}
      {!resource.loading && !resource.error ? (
        <div className={`provider-console ${embedded ? "is-embedded" : ""}`}>
          <section className="provider-overview" aria-label="Provider overview">
            <div className="provider-overview__lead">
              <span className="eyebrow">Current route</span>
              <h2>
                {activeDefault
                  ? `${activeDefault.provider.label} handles new chats`
                  : "Choose a provider for new chats"}
              </h2>
              <p>
                Chat routing and spawned-agent routing are independent. Account
                credentials remain inside Eliza&apos;s private local services.
              </p>
            </div>
            <dl className="provider-overview__metrics is-compact">
              <div>
                <dt>Chat providers</dt>
                <dd>
                  <strong>{readyProviderCount}</strong>
                  <span>of {providerViews.length} ready</span>
                </dd>
              </div>
              <div>
                <dt>Current provider</dt>
                <dd>
                  <strong>{activeDefault?.provider.shortLabel ?? "—"}</strong>
                  <span>{activeDefault?.provider.label ?? "not selected"}</span>
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="provider-surface"
            aria-labelledby="provider-connections-title"
          >
            <header className="provider-section-heading">
              <div>
                <span className="eyebrow">Chat routing</span>
                <h2 id="provider-connections-title">Provider connections</h2>
              </div>
              <p>
                Connect once, then choose which runtime starts every new
                conversation.
              </p>
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
