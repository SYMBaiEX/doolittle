import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AccountPoolAccount,
  AccountPoolDeleteResponse,
  AccountPoolProvider,
  AccountPoolResponse,
  AccountPoolStrategy,
  ProviderAuthProvider,
  ProviderAuthState,
  RuntimeModelsResponse,
  RuntimeReasoningEffort,
  RuntimeStatus,
} from "../shared/contracts";
import {
  type AccountImportDraft,
  accountPoolProgress,
  clearAccountImportDraft,
} from "./agent-pages-helpers";
import { AcpBridgePanel } from "./components/AcpBridgePanel";
import { McpControlPanel } from "./components/McpControlPanel";
import { SkillWorkshopPanel } from "./components/SkillWorkshopPanel";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import "./agent-pages.css";

interface SettingsResponse {
  settings?: {
    model?: {
      provider?: string;
      model?: string;
      baseUrl?: string;
      temperature?: number;
      maxTokens?: number;
      reasoningEffort?: RuntimeReasoningEffort;
    };
  };
}

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

export function ModelsPage({
  active,
  runtime,
  refreshRuntime,
  embedded = false,
}: {
  active: boolean;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void;
  embedded?: boolean;
}) {
  const settings = useApiResource<SettingsResponse>(
    active ? "/settings" : null,
    [active],
  );
  const accounts = useApiResource<AccountsResponse>(
    active ? "/runtime/accounts" : null,
    [active],
  );
  const models = useApiResource<RuntimeModelsResponse>(
    active ? "/runtime/models?refresh=true" : null,
    [active],
  );
  const model = settings.data?.settings?.model;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const fieldValue = (key: string, fallback: unknown) =>
    Object.hasOwn(draft, key) ? draft[key] : String(fallback ?? "");
  const selectedProviderId = fieldValue("provider", model?.provider);
  const selectedModelId = fieldValue("model", model?.model);
  const selectedProvider = useMemo(
    () =>
      models.data?.providers.find(
        (provider) => provider.id === selectedProviderId,
      ),
    [models.data?.providers, selectedProviderId],
  );
  const selectedModel = useMemo(
    () =>
      selectedProvider?.models.find((entry) => entry.id === selectedModelId),
    [selectedModelId, selectedProvider?.models],
  );
  const reasoningOptions = selectedModel?.reasoning?.options ?? [];

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    try {
      const effort = fieldValue(
        "reasoningEffort",
        model?.reasoningEffort ?? selectedModel?.reasoning?.default,
      );
      await desktopRequest("/settings", "POST", {
        changes: [
          { path: "model.provider", value: selectedProviderId },
          { path: "model.model", value: selectedModelId },
          {
            path: "model.baseUrl",
            value: fieldValue(
              "baseUrl",
              selectedProvider?.baseUrl ?? model?.baseUrl,
            ),
          },
          {
            path: "model.temperature",
            value: Number(fieldValue("temperature", model?.temperature)),
          },
          {
            path: "model.maxTokens",
            value: Number(fieldValue("maxTokens", model?.maxTokens)),
          },
          {
            path: "model.reasoningEffort",
            value: effort || undefined,
          },
        ],
      });
      setDraft({});
      setFeedback("Model settings saved. New turns will use this selection.");
      settings.reload();
      refreshRuntime();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? "settings-model-section" : "page"}>
      {embedded ? (
        <header className="settings-section-header">
          <div>
            <span className="eyebrow">Inference</span>
            <h2>Provider & model</h2>
            <p>
              Choose from live provider catalogs. Changes apply to the next
              turn, including inside an existing conversation.
            </p>
          </div>
          {runtime ? (
            <Badge tone="good">
              {runtime.provider} · {runtime.model}
            </Badge>
          ) : null}
        </header>
      ) : (
        <PageHeader
          eyebrow="Agent"
          title="Models"
          description="Choose the provider and model Doolittle uses for new work, with local-first defaults."
          actions={
            runtime ? (
              <Badge tone="good">
                {runtime.provider} · {runtime.model}
              </Badge>
            ) : null
          }
        />
      )}
      {settings.loading ? (
        <LoadingBlock label="Loading model settings…" />
      ) : settings.error ? (
        <ErrorBlock error={settings.error} retry={settings.reload} />
      ) : (
        <div className="two-column-grid">
          <form className="content-card form-card" onSubmit={save}>
            <div className="card-heading">
              <div>
                <span className="eyebrow">Primary inference</span>
                <h2>Active model</h2>
              </div>
            </div>
            <div className="field-grid">
              <label>
                <span>Provider</span>
                <select
                  value={selectedProviderId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      provider: event.target.value,
                      model:
                        models.data?.providers.find(
                          (provider) => provider.id === event.target.value,
                        )?.models[0]?.id ?? "",
                      reasoningEffort: "",
                    }))
                  }
                >
                  {!models.data?.providers.some(
                    (provider) => provider.id === selectedProviderId,
                  ) && selectedProviderId ? (
                    <option value={selectedProviderId}>
                      {titleCase(selectedProviderId)}
                    </option>
                  ) : null}
                  {(models.data?.providers ?? []).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                      {provider.discovery === "live" ? " · Live" : ""}
                    </option>
                  ))}
                </select>
                <small>
                  {selectedProvider?.detail ??
                    "Provider availability is detected from this machine."}
                </small>
              </label>
              <label>
                <span>Model</span>
                <select
                  value={selectedModelId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      model: event.target.value,
                      reasoningEffort: "",
                    }))
                  }
                >
                  {selectedProvider?.models.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                      {entry.source === "discovered" ? " · Discovered" : ""}
                    </option>
                  ))}
                  {!selectedProvider?.models.some(
                    (entry) => entry.id === selectedModelId,
                  ) && selectedModelId ? (
                    <option value={selectedModelId}>{selectedModelId}</option>
                  ) : null}
                </select>
                {models.loading ? (
                  <small>Refreshing model catalog…</small>
                ) : null}
                {models.error ? <small>{models.error}</small> : null}
              </label>
              {reasoningOptions.length ? (
                <label>
                  <span>Reasoning effort</span>
                  <select
                    value={fieldValue(
                      "reasoningEffort",
                      model?.reasoningEffort ??
                        selectedModel?.reasoning?.default ??
                        "",
                    )}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        reasoningEffort: event.target.value,
                      }))
                    }
                  >
                    {reasoningOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small>
                    {
                      reasoningOptions.find(
                        (option) =>
                          option.id ===
                          fieldValue(
                            "reasoningEffort",
                            model?.reasoningEffort ??
                              selectedModel?.reasoning?.default,
                          ),
                      )?.description
                    }
                  </small>
                </label>
              ) : null}
              <label className="field-span">
                <span>Base URL</span>
                <input
                  value={fieldValue(
                    "baseUrl",
                    selectedProvider?.baseUrl ?? model?.baseUrl,
                  )}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      baseUrl: event.target.value,
                    }))
                  }
                  placeholder="http://127.0.0.1:11434/v1"
                />
              </label>
              <label>
                <span>Temperature</span>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.05"
                  value={fieldValue("temperature", model?.temperature)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      temperature: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Maximum tokens</span>
                <input
                  type="number"
                  min="128"
                  step="128"
                  value={fieldValue("maxTokens", model?.maxTokens)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxTokens: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            {feedback ? (
              <Notice tone={feedback.startsWith("Model") ? "good" : "bad"}>
                {feedback}
              </Notice>
            ) : null}
            <div className="form-actions">
              <button
                className="primary-button"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving…" : "Save model"}
              </button>
            </div>
          </form>
          <section className="content-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Linked runtimes</span>
                <h2>Provider readiness</h2>
              </div>
            </div>
            {accounts.loading ? (
              <LoadingBlock />
            ) : accounts.error ? (
              <ErrorBlock error={accounts.error} retry={accounts.reload} />
            ) : (
              <div className="stack-list">
                {accountProviders.map((provider) => {
                  const status = asRecord(
                    accounts.data?.accounts?.[provider.snapshot],
                  );
                  const ready =
                    Boolean(status.nativeReady) ||
                    Boolean(status.fallbackReady) ||
                    Boolean(status.reusable);
                  return (
                    <div className="status-row" key={provider.key}>
                      <div>
                        <strong>{provider.label}</strong>
                        <small>
                          {asString(status.detail, "Not configured")}
                        </small>
                      </div>
                      <Badge
                        tone={
                          accounts.data?.activeProvider === provider.key
                            ? "good"
                            : ready
                              ? "neutral"
                              : "warn"
                        }
                      >
                        {accounts.data?.activeProvider === provider.key
                          ? "Active"
                          : ready
                            ? "Ready"
                            : "Setup needed"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

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

  const importAccount = useCallback(
    async (provider: ProviderAuthProvider) => {
      const poolProvider = accountPoolProviderFor(provider);
      const draft = accountImports[poolProvider];
      const accountId = draft?.accountId.trim() || `${provider}-${Date.now()}`;
      const label = draft?.label.trim() || `${titleCase(provider)} account`;
      const result = await desktopRequest<{ account?: AccountPoolAccount }>(
        `/runtime/account-pool/${poolProvider}/import`,
        "POST",
        { accountId, label },
      );
      if (result.account) {
        setFeedback(`${result.account.label} was added to the account pool.`);
        setAccountImports((current) =>
          clearAccountImportDraft(current, poolProvider),
        );
      }
      accountPool.reload();
    },
    [accountImports, accountPool.reload],
  );

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
        await importAccount(provider);
        setAuthState(await window.doolittle.acknowledgeProviderAuth(provider));
        resource.reload();
      } catch (error) {
        completedAuth.current.delete(provider);
        setFeedback(errorMessage(error));
      } finally {
        setBusy("");
      }
    },
    [importAccount, resource.reload, setAuthState],
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
      const state = await window.doolittle.startProviderAuth(provider);
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
                      Enter an optional ID and label, then use the official
                      sign-in flow. The credential stays outside Doolittle.
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
                    Use Sign in again to add the linked native sign-in under
                    this ID. The account pool never exposes credentials.
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

interface ToolsResponse {
  tools?: unknown[];
  nativePluginManager?: unknown;
  runtimeOwned?: boolean;
  policyOwned?: boolean;
  effectiveProfile?: string;
  policyError?: string;
}

interface ToolsSummaryResponse {
  summary?: Record<string, unknown>;
}

type ToolProfile = "minimal" | "coding" | "messaging" | "full";

const TOOL_PROFILES: readonly ToolProfile[] = [
  "minimal",
  "coding",
  "messaging",
  "full",
];

export function ToolsPage({ active }: { active: boolean }) {
  const [profile, setProfile] = useState<ToolProfile>("full");
  const toolsPath = active ? `/tools?profile=${profile}` : null;
  const summaryPath = active ? `/tools/summary?profile=${profile}` : null;
  const tools = useApiResource<ToolsResponse>(toolsPath, [active, profile]);
  const summary = useApiResource<ToolsSummaryResponse>(summaryPath, [
    active,
    profile,
  ]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const entries = asArray(tools.data?.tools).map(asRecord);
  const categories = [
    "all",
    ...new Set(
      entries.map((entry) => asString(entry.category)).filter(Boolean),
    ),
  ];
  const filtered = entries.filter((entry) => {
    const matchesCategory =
      category === "all" || asString(entry.category) === category;
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      !normalized ||
      [entry.id, entry.name, entry.description, entry.category, entry.transport]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    return matchesCategory && matchesQuery;
  });
  const totals = summary.data?.summary ?? {};

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Tools"
        description="Inspect every local, service, adapter, and MCP capability available to Doolittle."
        actions={
          <button
            className="secondary-button"
            onClick={tools.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard
          label="Registered"
          value={asNumber(totals.total, entries.length)}
        />
        <MetricCard label="Enabled" value={asNumber(totals.enabled)} />
        <MetricCard label="Disabled" value={asNumber(totals.disabled)} />
        <MetricCard
          label="Categories"
          value={asArray(totals.categories).length}
        />
        <MetricCard
          label="Policy"
          value={
            tools.data?.policyOwned
              ? titleCase(tools.data.effectiveProfile ?? profile)
              : "Unverified"
          }
          detail={
            tools.data?.policyError
              ? tools.data.policyError
              : tools.data?.policyOwned
                ? `Eliza ToolPolicyService · ${asNumber(totals.pluginTools)} plugin tools`
                : "Registered actions only"
          }
        />
      </div>
      <McpControlPanel active={active} />
      <AcpBridgePanel active={active} />
      <div className="filter-bar">
        <label className="search-field">
          <span className="sr-only">Search tools</span>
          <input
            placeholder="Search tools"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Tool category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Eliza tool profile"
          value={profile}
          onChange={(event) => setProfile(event.target.value as ToolProfile)}
        >
          {TOOL_PROFILES.map((value) => (
            <option key={value} value={value}>
              {titleCase(value)} profile
            </option>
          ))}
        </select>
      </div>
      {tools.loading ? (
        <LoadingBlock label="Reading tool registry…" />
      ) : tools.error ? (
        <ErrorBlock error={tools.error} retry={tools.reload} />
      ) : filtered.length ? (
        <div className="card-grid dense">
          {filtered.map((entry, index) => (
            <article
              className="content-card catalog-card"
              key={asString(entry.id, String(index))}
            >
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    {titleCase(asString(entry.category, "uncategorized"))}
                  </span>
                  <h2>
                    {asString(entry.name, asString(entry.id, "Unnamed tool"))}
                  </h2>
                </div>
                <Badge tone={entry.enabled === false ? "warn" : "good"}>
                  {entry.enabled === false ? "Disabled" : "Enabled"}
                </Badge>
              </div>
              <p>{asString(entry.description, "No description provided.")}</p>
              <div className="card-footer">
                <code>{asString(entry.id)}</code>
                <span>
                  {entry.enabled === false && entry.policyReason
                    ? asString(entry.policyReason)
                    : asArray(entry.allowedProfiles).length
                      ? asArray(entry.allowedProfiles)
                          .map((value) => titleCase(asString(value)))
                          .join(" · ")
                      : titleCase(asString(entry.transport, "native"))}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock title="No tools match">
          Change the search or category filter.
        </EmptyBlock>
      )}
    </div>
  );
}

interface SkillsResponse {
  skills?: unknown[];
  hub?: unknown;
  workspace?: unknown;
}

interface SkillsSummaryResponse {
  summary?: Record<string, unknown>;
  hub?: unknown;
  installed?: unknown;
}

export function SkillsPage({ active }: { active: boolean }) {
  const skills = useApiResource<SkillsResponse>(active ? "/skills" : null, [
    active,
  ]);
  const summary = useApiResource<SkillsSummaryResponse>(
    active ? "/skills/summary" : null,
    [active],
  );
  const installed = useApiResource<Record<string, unknown>>(
    active ? "/skills/installed" : null,
    [active],
  );
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"catalog" | "workshop">("catalog");
  const entries = asArray(skills.data?.skills).map(asRecord);
  const filtered = entries.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    return (
      !normalized ||
      [entry.slug, entry.name, entry.description, entry.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  });
  const summaryValue = summary.data?.summary ?? {};
  const installedValues = asArray(installed.data?.installed);
  const selectSectionWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    next: "catalog" | "workshop",
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const target =
      event.key === "ArrowLeft" || event.key === "Home"
        ? "catalog"
        : event.key === "ArrowRight" || event.key === "End"
          ? "workshop"
          : next;
    setSection(target);
    requestAnimationFrame(() => {
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(
          `button[aria-selected="${String(target === "workshop")}"]`,
        )
        ?.focus();
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Skills"
        description="Browse the skills Doolittle can load for specialized work and inspect the local skill hub."
        actions={
          <button
            className="secondary-button"
            onClick={skills.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard
          label="Available"
          value={asNumber(summaryValue.total, entries.length)}
        />
        <MetricCard label="Curated" value={asNumber(summaryValue.curated)} />
        <MetricCard
          label="Generated"
          value={asNumber(summaryValue.generated)}
        />
        <MetricCard label="Installed" value={installedValues.length} />
      </div>
      <div
        aria-label="Skills views"
        className="skills-page-switcher"
        role="tablist"
      >
        <button
          aria-selected={section === "catalog"}
          onClick={() => setSection("catalog")}
          onKeyDown={(event) => selectSectionWithKeyboard(event, "catalog")}
          role="tab"
          tabIndex={section === "catalog" ? 0 : -1}
          type="button"
        >
          <span>Catalog</span>
          <small>{entries.length} available</small>
        </button>
        <button
          aria-selected={section === "workshop"}
          onClick={() => setSection("workshop")}
          onKeyDown={(event) => selectSectionWithKeyboard(event, "workshop")}
          role="tab"
          tabIndex={section === "workshop" ? 0 : -1}
          type="button"
        >
          <span>Workshop</span>
          <small>Review before activation</small>
        </button>
      </div>
      {section === "catalog" ? (
        <>
          <div className="filter-bar">
            <label className="search-field grow">
              <span className="sr-only">Search skills</span>
              <input
                placeholder="Search skills"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {skills.loading ? (
            <LoadingBlock label="Reading workspace skills…" />
          ) : skills.error ? (
            <ErrorBlock error={skills.error} retry={skills.reload} />
          ) : filtered.length ? (
            <div className="card-grid dense">
              {filtered.map((entry, index) => {
                const slug = asString(
                  entry.slug,
                  asString(entry.id, `skill-${index}`),
                );
                return (
                  <article className="content-card catalog-card" key={slug}>
                    <div className="card-heading">
                      <div>
                        <span className="eyebrow">
                          {titleCase(
                            asString(entry.category, slug.split("/")[0]),
                          )}
                        </span>
                        <h2>{asString(entry.name, titleCase(slug))}</h2>
                      </div>
                      <Badge tone="good">Available</Badge>
                    </div>
                    <p>
                      {asString(
                        entry.description,
                        "A locally available Doolittle skill.",
                      )}
                    </p>
                    <div className="card-footer">
                      <code>{slug}</code>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyBlock title="No skills match">
              Change the search, or add skills to the local skill workspace.
            </EmptyBlock>
          )}
        </>
      ) : (
        <div className="skills-page-workshop">
          <SkillWorkshopPanel active={active} />
        </div>
      )}
    </div>
  );
}

interface PluginsResponse {
  catalog?: unknown[];
  grouped?: Record<string, unknown[]>;
  serviceRegistry?: unknown;
  pluginManager?: unknown;
}

export function PluginsPage({ active }: { active: boolean }) {
  const resource = useApiResource<PluginsResponse>(
    active ? "/runtime/plugins" : null,
    [active],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const entries = asArray(resource.data?.catalog).map(asRecord);
  const categories = [
    "all",
    ...new Set(
      entries.map((entry) => asString(entry.category)).filter(Boolean),
    ),
  ];
  const filtered = entries.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    return (
      (category === "all" || entry.category === category) &&
      (!normalized ||
        [entry.id, entry.packageName, entry.category, entry.notes, entry.source]
          .join(" ")
          .toLowerCase()
          .includes(normalized))
    );
  });
  const enabled = entries.filter((entry) => Boolean(entry.enabled)).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Plugins"
        description="Inspect the ElizaOS-native provider, messaging, knowledge, media, and automation packages assembled into this runtime."
        actions={
          <button
            className="secondary-button"
            onClick={resource.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard label="Catalog" value={entries.length} />
        <MetricCard label="Enabled" value={enabled} />
        <MetricCard label="Inactive" value={entries.length - enabled} />
        <MetricCard label="Categories" value={categories.length - 1} />
      </div>
      <Notice>
        This page reflects the packages actually assembled by the ElizaOS
        runtime. Provider enablement follows account and environment readiness.
      </Notice>
      <div className="filter-bar">
        <label className="search-field grow">
          <span className="sr-only">Search plugins</span>
          <input
            placeholder="Search plugins"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Plugin category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </select>
      </div>
      {resource.loading ? (
        <LoadingBlock label="Inspecting native plugin assembly…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : filtered.length ? (
        <div className="card-grid dense">
          {filtered.map((entry, index) => (
            <article
              className="content-card catalog-card"
              key={asString(entry.id, String(index))}
            >
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    {titleCase(asString(entry.category, "plugin"))}
                  </span>
                  <h2>{titleCase(asString(entry.id, "Unnamed plugin"))}</h2>
                </div>
                <Badge tone={entry.enabled ? "good" : "warn"}>
                  {entry.enabled ? "Enabled" : "Inactive"}
                </Badge>
              </div>
              <p>{asString(entry.notes, "No plugin notes available.")}</p>
              <dl className="fact-list compact">
                <div>
                  <dt>Source</dt>
                  <dd>{titleCase(asString(entry.source, "unknown"))}</dd>
                </div>
                <div>
                  <dt>Maturity</dt>
                  <dd>{titleCase(asString(entry.maturity, "unknown"))}</dd>
                </div>
              </dl>
              <div className="card-footer">
                <code>{asString(entry.packageName, asString(entry.id))}</code>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock title="No plugins match">
          Change the search or category filter.
        </EmptyBlock>
      )}
    </div>
  );
}

interface PersonalityResponse {
  active?: unknown;
  available?: unknown[];
  summary?: unknown;
}

export function ProfilesPage({ active }: { active: boolean }) {
  const resource = useApiResource<PersonalityResponse>(
    active ? "/personality" : null,
    [active],
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const activeProfile = asRecord(resource.data?.active);
  const profiles = asArray(resource.data?.available).map(asRecord);

  const activate = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      await desktopRequest("/personality", "POST", { id });
      resource.reload();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Identity"
        title="Profiles"
        description="Choose the local personality that shapes Doolittle’s voice, priorities, and working style."
        actions={
          <Badge tone="good">
            {asString(
              activeProfile.name,
              titleCase(asString(activeProfile.id, "Default")),
            )}
          </Badge>
        }
      />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {resource.loading ? (
        <LoadingBlock label="Loading personality profiles…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : profiles.length ? (
        <div className="card-grid">
          {profiles.map((profile, index) => {
            const id = asString(profile.id, `profile-${index}`);
            const isActive = id === asString(activeProfile.id);
            return (
              <article className="content-card profile-card" key={id}>
                <div className="profile-avatar" aria-hidden="true">
                  {asString(profile.name, id).slice(0, 1).toUpperCase()}
                </div>
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">
                      {isActive ? "Active identity" : "Available identity"}
                    </span>
                    <h2>{asString(profile.name, titleCase(id))}</h2>
                  </div>
                  {isActive ? <Badge tone="good">Active</Badge> : null}
                </div>
                <p>
                  {asString(
                    profile.description,
                    asString(
                      profile.summary,
                      "A local Doolittle personality profile.",
                    ),
                  )}
                </p>
                <button
                  className={isActive ? "secondary-button" : "primary-button"}
                  disabled={isActive || Boolean(busy)}
                  onClick={() => void activate(id)}
                  type="button"
                >
                  {isActive
                    ? "In use"
                    : busy === id
                      ? "Activating…"
                      : "Use profile"}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyBlock
          title={active ? "No profiles found" : "Profiles are offline"}
          actions={
            <button
              className="secondary-button"
              disabled={!active}
              onClick={resource.reload}
              type="button"
            >
              Refresh profiles
            </button>
          }
        >
          {active
            ? "The runtime did not return any personality profiles. Refresh after adding one to the local workspace."
            : "Restart the local runtime to load Doolittle’s available personalities."}
        </EmptyBlock>
      )}
    </div>
  );
}
