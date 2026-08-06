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

const accountPoolStrategies: AccountPoolStrategy[] = [
  "priority",
  "round-robin",
  "least-used",
  "quota-aware",
];

function formatPoolTimestamp(value?: number): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function poolUsageSummary(usage: unknown): string | null {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const pairs = Object.entries(record).flatMap(([key, value]) =>
    typeof value === "number" ? [`${titleCase(key)}: ${value}`] : [],
  );
  return pairs.length > 0 ? pairs.join(" · ") : null;
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

  useEffect(() => {
    if (!active) return;
    const pending = (["codex", "claude-code"] as const).filter((provider) => {
      const phase = authStates[provider]?.phase;
      return phase === "launching" || phase === "waiting";
    });
    if (pending.length === 0) return;

    const interval = window.setInterval(() => {
      for (const provider of pending) {
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
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [active, authStates, finishAccountSignIn, setAuthState]);

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
    account: AccountPoolAccount,
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

  const deleteAccount = async (
    provider: AccountPoolProvider,
    account: AccountPoolAccount,
  ) => {
    if (
      !window.confirm(
        `Disconnect ${account.label} from this pooled account? You will need to sign in again to restore it.`,
      )
    )
      return;
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

  return (
    <div className={embedded ? "settings-provider-section" : "page"}>
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
          <button
            className="secondary-button"
            onClick={() => void mutate("all", "refresh")}
            disabled={Boolean(busy)}
            type="button"
          >
            Refresh all
          </button>
        </header>
      ) : (
        <PageHeader
          eyebrow="Agent"
          title="Providers & accounts"
          description="Set a default chat provider, then manage the separate account pools that spawned agents select from per session."
          actions={
            <button
              className="secondary-button"
              onClick={() => void mutate("all", "refresh")}
              disabled={Boolean(busy)}
              type="button"
            >
              Refresh all
            </button>
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
      <div className={`card-grid ${embedded ? "provider-settings-grid" : ""}`}>
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
                      <label className="form-field">
                        <span>Routing strategy</span>
                        <select
                          value={poolSnapshot.strategy}
                          onChange={(event) =>
                            void setPoolStrategy(
                              provider.poolProvider,
                              event.target.value as AccountPoolStrategy,
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          {accountPoolStrategies.map((strategy) => (
                            <option key={strategy} value={strategy}>
                              {titleCase(strategy)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="button-row">
                        <button
                          className="secondary-button"
                          onClick={() =>
                            void selectAccount(provider.poolProvider)
                          }
                          disabled={Boolean(busy)}
                          type="button"
                        >
                          Preview selection
                        </button>
                      </div>
                      {poolSnapshot.accounts.length === 0 ? (
                        <EmptyBlock title="No pooled accounts">
                          Sign in to add a provider account. Credentials are
                          never displayed here.
                        </EmptyBlock>
                      ) : (
                        <div className="stack-list provider-pool-accounts">
                          {poolSnapshot.accounts.map((account) => {
                            const selected =
                              selectedAccounts[provider.poolProvider] ===
                              account.accountId;
                            const usage = poolUsageSummary(account.usage);
                            return (
                              <article
                                className="content-card"
                                key={account.accountId}
                              >
                                <div className="card-heading">
                                  <div>
                                    <span className="eyebrow">
                                      {account.source}
                                    </span>
                                    <h3>{account.label}</h3>
                                  </div>
                                  <Badge
                                    tone={
                                      selected
                                        ? "good"
                                        : account.enabled
                                          ? "neutral"
                                          : "warn"
                                    }
                                  >
                                    {selected
                                      ? "Previewed"
                                      : account.enabled
                                        ? "Enabled"
                                        : "Disabled"}
                                  </Badge>
                                </div>
                                <dl className="fact-list">
                                  <div>
                                    <dt>Health</dt>
                                    <dd>{account.health}</dd>
                                  </div>
                                  <div>
                                    <dt>Priority</dt>
                                    <dd>{account.priority}</dd>
                                  </div>
                                  <div>
                                    <dt>Last used</dt>
                                    <dd>
                                      {formatPoolTimestamp(account.lastUsedAt)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Usage</dt>
                                    <dd>{usage ?? "Not reported"}</dd>
                                  </div>
                                </dl>
                                <div className="button-row provider-account-actions">
                                  <label className="form-field">
                                    <span className="sr-only">Priority</span>
                                    <input
                                      aria-label={`${account.label} priority`}
                                      defaultValue={account.priority}
                                      min="0"
                                      max="10000"
                                      onBlur={(event) => {
                                        const priority = Number(
                                          event.target.value,
                                        );
                                        if (
                                          Number.isInteger(priority) &&
                                          priority !== account.priority
                                        ) {
                                          void updateAccount(
                                            provider.poolProvider,
                                            account,
                                            { priority },
                                          );
                                        }
                                      }}
                                      type="number"
                                    />
                                  </label>
                                  <button
                                    className="secondary-button"
                                    onClick={() =>
                                      void updateAccount(
                                        provider.poolProvider,
                                        account,
                                        { enabled: !account.enabled },
                                      )
                                    }
                                    disabled={Boolean(busy)}
                                    type="button"
                                  >
                                    {account.enabled ? "Disable" : "Enable"}
                                  </button>
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      void deleteAccount(
                                        provider.poolProvider,
                                        account,
                                      )
                                    }
                                    disabled={Boolean(busy)}
                                    type="button"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </section>
              ) : null}
              <div className="button-row provider-default-actions">
                <small>Default provider for new chats</small>
                {signingIn && authProvider ? (
                  <button
                    className="secondary-button"
                    onClick={() => void cancelAccountSignIn(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Cancel sign in
                  </button>
                ) : ready ? (
                  <button
                    className="primary-button"
                    onClick={() => void mutate(provider.key, "use")}
                    disabled={Boolean(busy) || activeProvider}
                    type="button"
                  >
                    {activeProvider ? "Default for chats" : "Set as default"}
                  </button>
                ) : authProvider ? (
                  <button
                    className="primary-button"
                    onClick={() => void startAccountSignIn(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Sign in
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    onClick={() => void mutate(provider.key, "connect")}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Connect
                  </button>
                )}
                <button
                  className="secondary-button"
                  onClick={() => void mutate(provider.key, "refresh")}
                  disabled={Boolean(busy)}
                  type="button"
                >
                  Refresh
                </button>
                {authProvider && ready && !signingIn ? (
                  <button
                    className="text-button"
                    onClick={() => void startAccountSignIn(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Sign in again / add account
                  </button>
                ) : null}
              </div>
              {authProvider &&
              signingIn &&
              authState?.needsCodeSubmission &&
              !authState.codeSubmitted ? (
                <div className="stack-list provider-import-form">
                  <button
                    className="primary-button"
                    onClick={() => void submitAccountSignInCode(authProvider)}
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    Use copied code
                  </button>
                  <small>
                    Copy the complete code#state value from Claude first. It is
                    read once from the clipboard and never returned to this UI.
                  </small>
                </div>
              ) : null}
              {authProvider && provider.poolProvider ? (
                <div className="stack-list provider-import-form">
                  <div>
                    <span className="eyebrow">Add pooled account</span>
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
                  <label className="form-field">
                    <span>New account ID</span>
                    <input
                      onChange={(event) =>
                        setAccountImports((current) => ({
                          ...current,
                          [provider.poolProvider]: {
                            accountId: event.target.value,
                            label: current[provider.poolProvider]?.label ?? "",
                          },
                        }))
                      }
                      placeholder={`${provider.key}-timestamp`}
                      value={
                        accountImports[provider.poolProvider]?.accountId ?? ""
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>New account label</span>
                    <input
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
                      value={accountImports[provider.poolProvider]?.label ?? ""}
                    />
                  </label>
                  <small>
                    Use Sign in again to create another Eliza-managed account
                    under this ID. The account pool never exposes credentials.
                  </small>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
