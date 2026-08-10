import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { AccountCard } from "@elizaos/ui/components/accounts/AccountCard";
import { RotationStrategyPicker } from "@elizaos/ui/components/accounts/RotationStrategyPicker";
import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
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
import { toElizaAccount } from "./account-pool-ui";
import {
  type AccountImportDraft,
  accountPoolProgress,
  clearAccountImportDraft,
} from "./agent-pages-helpers";
import {
  asRecord,
  asString,
  Badge,
  desktopRequest,
  EmptyBlock,
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
    accountSignIn: false,
  },
  {
    key: "codex",
    snapshot: "codex",
    poolProvider: "openai-codex",
    label: "Codex",
    accountSignIn: true,
  },
  {
    key: "claude-code",
    snapshot: "claudeCode",
    poolProvider: "anthropic-subscription",
    label: "Claude Code",
    accountSignIn: true,
  },
  {
    key: "devin",
    snapshot: "devin",
    poolProvider: undefined,
    label: "Devin",
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
  const accountPool = useApiResource<AccountPoolResponse>(
    active ? "/runtime/account-pool" : null,
    [active],
  );
  const resource = useApiResource<AccountsResponse>(
    active && !accountPool.loading ? "/runtime/accounts" : null,
    [active, accountPool.loading],
  );
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
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
        setFeedback(
          asString(result.detail) ||
            `${titleCase(provider)} is signed in and ready to use.`,
        );
        const poolProvider = accountPoolProviderFor(provider);
        setAccountImports((current) =>
          clearAccountImportDraft(current, poolProvider),
        );
        accountPool.reload();
        setAuthState(await window.doolittle.acknowledgeProviderAuth(provider));
        resource.reload();
      } catch (error) {
        completedAuth.current.delete(provider);
        setFeedback(errorMessage(error));
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
          .catch((error) => setFeedback(errorMessage(error)));
      }
    },
    1_000,
    active && pendingAuthProviders.length > 0,
  );

  const startAccountSignIn = async (provider: ProviderAuthProvider) => {
    completedAuth.current.delete(provider);
    setBusy(`${provider}:sign-in`);
    setFeedback("");
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
        setFeedback(state.message);
      }
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const submitAccountSignInCode = async (provider: ProviderAuthProvider) => {
    setBusy(`${provider}:submit-code`);
    setFeedback("");
    try {
      setAuthState(await window.doolittle.submitProviderAuthCode(provider));
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const cancelAccountSignIn = async (provider: ProviderAuthProvider) => {
    setBusy(`${provider}:cancel-sign-in`);
    try {
      setAuthState(await window.doolittle.cancelProviderAuth(provider));
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const mutate = async (
    provider: string,
    action: "refresh" | "use" | "connect" | "login",
  ) => {
    setBusy(`${provider}:${action}`);
    setFeedback("");
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
      setFeedback(detail);
      resource.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
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
    setFeedback("");
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.accountId)}`,
        "PATCH",
        changes,
      );
      accountPool.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const selectAccount = async (provider: AccountPoolProvider) => {
    setBusy(`${provider}:select`);
    setFeedback("");
    try {
      const result = await desktopRequest<{
        account?: AccountPoolAccount | null;
      }>(`/runtime/account-pool/${provider}/select`, "POST");
      if (result.account) {
        setSelectedAccounts((current) => ({
          ...current,
          [provider]: result.account?.accountId,
        }));
        setFeedback(
          `Strategy selected ${result.account.label} for this preview; spawned agents select per session.`,
        );
      } else {
        setFeedback("No enabled account is available for this provider.");
      }
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const setPoolStrategy = async (
    provider: AccountPoolProvider,
    strategy: AccountPoolStrategy,
  ) => {
    setBusy(`${provider}:strategy`);
    setFeedback("");
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/strategy`,
        "POST",
        {
          strategy,
        },
      );
      accountPool.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
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
    setFeedback("");
    try {
      const result = await desktopRequest<{
        ok: boolean;
        latencyMs?: number;
        error?: string;
      }>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}/test`,
        "POST",
      );
      setFeedback(
        result.ok
          ? `${account.label} passed its credential check${typeof result.latencyMs === "number" ? ` in ${result.latencyMs}ms` : ""}.`
          : `${account.label} failed its credential check: ${result.error ?? "unknown provider error"}`,
      );
      accountPool.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
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
    setFeedback("");
    try {
      const result = await desktopRequest<{ error?: string }>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}/refresh-usage`,
        "POST",
      );
      setFeedback(
        result.error
          ? `${account.label} usage could not be refreshed: ${result.error}`
          : `${account.label} usage and health were refreshed.`,
      );
      accountPool.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
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
    setFeedback("");
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
      setFeedback(`${account.label} priority was updated.`);
    } catch (error) {
      setFeedback(errorMessage(error));
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
    setFeedback("");
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
      setFeedback(`${account.label} was disconnected and removed.`);
      accountPool.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const showProviderGrid =
    Boolean(resource.data) || (!resource.loading && !resource.error);

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
          description="Set a default chat provider, then manage the separate account pools that spawned agents select from per session."
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
      {!embedded ? (
        <Notice>
          Default provider affects new Doolittle chats. Spawned agents use the
          enabled accounts and strategy in their provider pool. Credentials
          never appear in this desktop page.
        </Notice>
      ) : null}
      {feedback ? <Notice>{feedback}</Notice> : null}
      {resource.loading ? (
        <LoadingBlock label="Checking the default chat provider…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : null}
      <div
        className={`card-grid ${embedded ? "provider-settings-grid" : ""}`}
        hidden={!showProviderGrid}
      >
        {displayedProviders.map((provider) => {
          const status = asRecord(resource.data?.accounts?.[provider.snapshot]);
          const ready =
            Boolean(status.nativeReady) ||
            Boolean(status.fallbackReady) ||
            Boolean(status.reusable);
          const activeProvider = resource.data?.activeProvider === provider.key;
          const poolSnapshot = provider.poolProvider
            ? accountPool.data?.providers[provider.poolProvider]
            : undefined;
          const poolProgress = poolSnapshot
            ? accountPoolProgress(poolSnapshot.accounts)
            : null;
          const authProvider = provider.accountSignIn
            ? (provider.key as ProviderAuthProvider)
            : null;
          const authState = authProvider ? authStates[authProvider] : undefined;
          const signingIn =
            authState?.phase === "launching" || authState?.phase === "waiting";
          return (
            <article className="content-card provider-card" key={provider.key}>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    {asString(status.authMode, "Provider account")}
                  </span>
                  <h2>{provider.label}</h2>
                </div>
                <Badge
                  tone={activeProvider ? "good" : ready ? "neutral" : "warn"}
                >
                  {activeProvider
                    ? "Default for chats"
                    : ready
                      ? "Ready"
                      : "Not ready"}
                </Badge>
              </div>
              <p>{asString(status.detail, "No account details available.")}</p>
              {authProvider ? (
                <div
                  className={`provider-auth-state ${
                    signingIn ? "is-pending" : ""
                  }`}
                  aria-live="polite"
                >
                  <span className="provider-auth-mark" aria-hidden="true" />
                  <div className="provider-auth-copy">
                    <strong>
                      {signingIn
                        ? "Browser sign in"
                        : ready
                          ? "Account connected"
                          : "Account sign in"}
                    </strong>
                    <small>
                      {signingIn
                        ? authState?.message
                        : ready
                          ? `Authenticated through the official ${provider.label} client.`
                          : `Use your ${provider.label} subscription. API keys are optional.`}
                    </small>
                  </div>
                </div>
              ) : null}
              <dl className="fact-list">
                <div>
                  <dt>Source</dt>
                  <dd>{asString(status.source, "Not detected")}</dd>
                </div>
                <div>
                  <dt>Account</dt>
                  <dd>{asString(status.accountLabel, "Local credential")}</dd>
                </div>
                <div>
                  <dt>Native</dt>
                  <dd>{status.nativeReady ? "Ready" : "Unavailable"}</dd>
                </div>
              </dl>
              {provider.poolProvider ? (
                <section
                  aria-label={`${provider.label} spawned-agent account pool`}
                  className="provider-pool"
                >
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">Spawned-agent pool</span>
                      <h3>Routing & accounts</h3>
                    </div>
                    <Badge
                      tone={accountPool.data?.bridgeInstalled ? "good" : "warn"}
                    >
                      {accountPool.data?.bridgeInstalled
                        ? "Bridge ready"
                        : "Bridge unavailable"}
                    </Badge>
                  </div>
                  {accountPool.error ? (
                    <ErrorBlock
                      error={accountPool.error}
                      retry={accountPool.reload}
                    />
                  ) : accountPool.loading || !poolSnapshot ? (
                    <LoadingBlock label="Loading account pool…" />
                  ) : (
                    <>
                      <p className="provider-pool-copy">
                        Agents select an enabled account when their session
                        starts. A preview checks the current strategy; it never
                        pins an account to future work.
                      </p>
                      <fieldset className="provider-pool-summary">
                        <legend className="sr-only">Pool readiness</legend>
                        <div>
                          <strong>{poolSnapshot.accounts.length}</strong>
                          <span>accounts</span>
                        </div>
                        <div>
                          <strong>{poolProgress?.enabled ?? 0}</strong>
                          <span>enabled</span>
                        </div>
                        <div>
                          <strong>{poolProgress?.healthy ?? 0}</strong>
                          <span>healthy</span>
                        </div>
                      </fieldset>
                      <small className="provider-pool-semantics">
                        Health comes from the provider credential check. Usage
                        shows only provider-reported numeric counters when
                        available.
                      </small>
                      <ol
                        className="provider-pool-journey"
                        aria-label="Pool setup progress"
                      >
                        <li
                          className={
                            poolProgress?.nextStep === "first-account"
                              ? "current"
                              : "complete"
                          }
                        >
                          <strong>1. Add first account</strong>
                          <span>
                            Sign in through the official provider flow.
                          </span>
                        </li>
                        <li
                          className={
                            poolProgress?.nextStep === "second-account"
                              ? "current"
                              : poolSnapshot.accounts.length > 1
                                ? "complete"
                                : ""
                          }
                        >
                          <strong>2. Add another account</strong>
                          <span>
                            Optional resilience for spawned-agent work.
                          </span>
                        </li>
                        <li
                          className={
                            poolProgress?.nextStep === "strategy"
                              ? "current"
                              : poolSnapshot.accounts.length > 0
                                ? "complete"
                                : ""
                          }
                        >
                          <strong>3. Set routing</strong>
                          <span>
                            Choose how eligible accounts are selected.
                          </span>
                        </li>
                        <li
                          className={
                            poolProgress?.nextStep === "verify" ? "current" : ""
                          }
                        >
                          <strong>4. Verify a preview</strong>
                          <span>
                            Confirm the strategy can select an account.
                          </span>
                        </li>
                      </ol>
                      <div>
                        <label
                          className="sr-only"
                          htmlFor={`rotation-strategy-${provider.poolProvider}`}
                        >
                          Routing strategy
                        </label>
                        <RotationStrategyPicker
                          disabled={Boolean(busy)}
                          onChange={(strategy) =>
                            void setPoolStrategy(
                              provider.poolProvider,
                              strategy as AccountPoolStrategy,
                            )
                          }
                          providerId={provider.poolProvider}
                          value={poolSnapshot.strategy}
                        />
                      </div>
                      <div className="button-row">
                        <Button
                          className="secondary-button"
                          onClick={() =>
                            void selectAccount(provider.poolProvider)
                          }
                          disabled={Boolean(busy)}
                          type="button"
                          variant="secondary"
                        >
                          Preview selection
                        </Button>
                      </div>
                      {poolSnapshot.accounts.length === 0 ? (
                        <EmptyBlock title="No pooled accounts">
                          Sign in to add a provider account. Credentials are
                          never displayed here.
                        </EmptyBlock>
                      ) : (
                        <div className="stack-list provider-pool-accounts">
                          {(() => {
                            const accounts = poolSnapshot.accounts
                              .map(toElizaAccount)
                              .sort((left, right) =>
                                left.priority === right.priority
                                  ? left.createdAt - right.createdAt
                                  : left.priority - right.priority,
                              );
                            return accounts.map((account, index) => {
                              const sourceAccount = poolSnapshot.accounts.find(
                                (candidate) =>
                                  candidate.accountId === account.id,
                              );
                              return (
                                <div
                                  className={
                                    selectedAccounts[provider.poolProvider] ===
                                    account.id
                                      ? "provider-account-previewed"
                                      : undefined
                                  }
                                  key={account.id}
                                >
                                  {selectedAccounts[provider.poolProvider] ===
                                  account.id ? (
                                    <Badge tone="good">Previewed next</Badge>
                                  ) : null}
                                  <AccountCard
                                    account={account}
                                    isFirst={index === 0}
                                    isLast={index === accounts.length - 1}
                                    onDelete={() =>
                                      sourceAccount
                                        ? deleteAccount(
                                            provider.poolProvider,
                                            sourceAccount,
                                          )
                                        : Promise.resolve()
                                    }
                                    onMoveDown={() =>
                                      movePoolAccount(
                                        provider.poolProvider,
                                        accounts,
                                        account.id,
                                        "down",
                                      )
                                    }
                                    onMoveUp={() =>
                                      movePoolAccount(
                                        provider.poolProvider,
                                        accounts,
                                        account.id,
                                        "up",
                                      )
                                    }
                                    onPatch={(changes) =>
                                      updateAccount(
                                        provider.poolProvider,
                                        {
                                          accountId: account.id,
                                          label: account.label,
                                        },
                                        changes,
                                      )
                                    }
                                    onRefreshUsage={() =>
                                      refreshPoolAccountUsage(
                                        provider.poolProvider,
                                        account,
                                      )
                                    }
                                    onTest={() =>
                                      testPoolAccount(
                                        provider.poolProvider,
                                        account,
                                      )
                                    }
                                    refreshBusy={
                                      busy ===
                                      `${provider.poolProvider}:${account.id}:usage`
                                    }
                                    saving={Boolean(busy)}
                                    testBusy={
                                      busy ===
                                      `${provider.poolProvider}:${account.id}:test`
                                    }
                                  />
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </section>
              ) : null}
              <div className="button-row provider-default-actions">
                <small>Default provider for new chats</small>
                {signingIn && authProvider ? (
                  <Button
                    className="secondary-button"
                    onClick={() => void cancelAccountSignIn(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                    variant="secondary"
                  >
                    Cancel sign in
                  </Button>
                ) : ready ? (
                  <Button
                    className="primary-button"
                    onClick={() => void mutate(provider.key, "use")}
                    disabled={Boolean(busy) || activeProvider}
                    type="button"
                  >
                    {activeProvider ? "Default for chats" : "Set as default"}
                  </Button>
                ) : authProvider ? (
                  <Button
                    className="primary-button"
                    onClick={() => void startAccountSignIn(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Sign in
                  </Button>
                ) : (
                  <Button
                    className="primary-button"
                    onClick={() => void mutate(provider.key, "connect")}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Connect
                  </Button>
                )}
                <Button
                  className="secondary-button"
                  onClick={() => void mutate(provider.key, "refresh")}
                  disabled={Boolean(busy)}
                  type="button"
                  variant="secondary"
                >
                  Refresh
                </Button>
                {authProvider && ready && !signingIn ? (
                  <Button
                    className="text-button"
                    onClick={() => void startAccountSignIn(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                    variant="ghost"
                  >
                    Sign in again / add account
                  </Button>
                ) : null}
              </div>
              {authProvider &&
              signingIn &&
              authState?.needsCodeSubmission &&
              !authState.codeSubmitted ? (
                <div className="stack-list provider-import-form">
                  <Button
                    className="primary-button"
                    onClick={() => void submitAccountSignInCode(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Use copied code
                  </Button>
                  <small>
                    Copy the complete code#state value from Claude first. It is
                    read once from the clipboard and never returned to this UI.
                  </small>
                </div>
              ) : null}
              {authProvider && provider.poolProvider ? (
                <details className="provider-import-disclosure">
                  <summary>
                    <span>
                      <strong>Add pooled account</strong>
                      <small>Optional ID and label</small>
                    </span>
                    <span aria-hidden="true">+</span>
                  </summary>
                  <div className="stack-list provider-import-form">
                    <div>
                      <h3>
                        {poolSnapshot?.accounts.length
                          ? "Prepare the next account"
                          : "Prepare the first account"}
                      </h3>
                      <p>
                        Enter an optional ID and label, then use Eliza&apos;s
                        official provider sign-in flow. Credentials are saved in
                        the private local account store and never returned here.
                      </p>
                    </div>
                    <label
                      className="form-field"
                      htmlFor={`account-pool-${provider.poolProvider}-id`}
                    >
                      <span>New account ID</span>
                      <Input
                        id={`account-pool-${provider.poolProvider}-id`}
                        onChange={(event) =>
                          setAccountImports((current) => ({
                            ...current,
                            [provider.poolProvider]: {
                              accountId: event.target.value,
                              label:
                                current[provider.poolProvider]?.label ?? "",
                            },
                          }))
                        }
                        placeholder={`${provider.key}-timestamp`}
                        value={
                          accountImports[provider.poolProvider]?.accountId ?? ""
                        }
                      />
                    </label>
                    <label
                      className="form-field"
                      htmlFor={`account-pool-${provider.poolProvider}-label`}
                    >
                      <span>New account label</span>
                      <Input
                        id={`account-pool-${provider.poolProvider}-label`}
                        onChange={(event) =>
                          setAccountImports((current) => ({
                            ...current,
                            [provider.poolProvider]: {
                              accountId:
                                current[provider.poolProvider]?.accountId ?? "",
                              label: event.target.value,
                            },
                          }))
                        }
                        placeholder={`${provider.label} account`}
                        value={
                          accountImports[provider.poolProvider]?.label ?? ""
                        }
                      />
                    </label>
                    <small>
                      Use Sign in again to create another Eliza-managed account
                      under this ID. The account pool never exposes credentials.
                    </small>
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </PagePanel>
  );
}
