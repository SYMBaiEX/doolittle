import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ProviderAuthProvider,
  ProviderAuthState,
  RuntimeStatus,
} from "../shared/contracts";
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

interface SettingsResponse {
  settings?: {
    model?: {
      provider?: string;
      model?: string;
      baseUrl?: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
}

interface AccountsResponse {
  activeProvider?: string;
  accounts?: Record<string, unknown>;
  connect?: Record<string, unknown>;
}

const accountProviders = [
  {
    key: "elizacloud",
    snapshot: "elizaCloud",
    label: "Eliza Cloud",
    accountSignIn: false,
  },
  {
    key: "codex",
    snapshot: "codex",
    label: "Codex",
    accountSignIn: true,
  },
  {
    key: "claude-code",
    snapshot: "claudeCode",
    label: "Claude Code",
    accountSignIn: true,
  },
  {
    key: "devin",
    snapshot: "devin",
    label: "Devin",
    accountSignIn: false,
  },
] as const;

export function ModelsPage({
  active,
  runtime,
  refreshRuntime,
}: {
  active: boolean;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void;
}) {
  const settings = useApiResource<SettingsResponse>(
    active ? "/settings" : null,
    [active],
  );
  const accounts = useApiResource<AccountsResponse>(
    active ? "/runtime/accounts" : null,
    [active],
  );
  const model = settings.data?.settings?.model;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const fieldValue = (key: string, fallback: unknown) =>
    Object.hasOwn(draft, key) ? draft[key] : String(fallback ?? "");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    try {
      const changes: Array<[string, string | number]> = [
        ["model.provider", fieldValue("provider", model?.provider)],
        ["model.model", fieldValue("model", model?.model)],
        ["model.baseUrl", fieldValue("baseUrl", model?.baseUrl)],
        [
          "model.temperature",
          Number(fieldValue("temperature", model?.temperature)),
        ],
        ["model.maxTokens", Number(fieldValue("maxTokens", model?.maxTokens))],
      ];
      for (const [path, value] of changes) {
        await desktopRequest("/settings", "POST", { path, value });
      }
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
    <div className="page">
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
                  value={fieldValue("provider", model?.provider)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      provider: event.target.value,
                    }))
                  }
                >
                  <option value="ollama">Ollama</option>
                  <option value="elizacloud">Eliza Cloud</option>
                  <option value="codex">Codex</option>
                  <option value="claude-code">Claude Code</option>
                  <option value="devin">Devin</option>
                  <option value="openai">OpenAI-compatible</option>
                  <option value="anthropic">Anthropic</option>
                </select>
                <small>
                  Ollama keeps inference on this machine when available.
                </small>
              </label>
              <label>
                <span>Model</span>
                <input
                  value={fieldValue("model", model?.model)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      model: event.target.value,
                    }))
                  }
                  placeholder="granite4.1:3b"
                />
              </label>
              <label className="field-span">
                <span>Base URL</span>
                <input
                  value={fieldValue("baseUrl", model?.baseUrl)}
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

export function ConnectionsPage({ active }: { active: boolean }) {
  const resource = useApiResource<AccountsResponse>(
    active ? "/runtime/accounts" : null,
    [active],
  );
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [authStates, setAuthStates] = useState<
    Partial<Record<ProviderAuthProvider, ProviderAuthState>>
  >({});
  const completedAuth = useRef(new Set<ProviderAuthProvider>());

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
        setAuthState(await window.doolittle.acknowledgeProviderAuth(provider));
        resource.reload();
      } catch (error) {
        completedAuth.current.delete(provider);
        setFeedback(errorMessage(error));
      } finally {
        setBusy("");
      }
    },
    [resource.reload, setAuthState],
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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Providers"
        description="Sign in with your Codex or Claude subscription, then choose the provider for new work. API credentials remain an optional fallback."
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
      <Notice>
        Doolittle reports readiness and starts provider-native login flows, but
        secret material never appears in this desktop page.
      </Notice>
      {feedback ? <Notice>{feedback}</Notice> : null}
      {resource.loading ? (
        <LoadingBlock label="Checking linked accounts…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : (
        <div className="card-grid">
          {accountProviders.map((provider) => {
            const status = asRecord(
              resource.data?.accounts?.[provider.snapshot],
            );
            const ready =
              Boolean(status.nativeReady) ||
              Boolean(status.fallbackReady) ||
              Boolean(status.reusable);
            const activeProvider =
              resource.data?.activeProvider === provider.key;
            const authProvider = provider.accountSignIn
              ? (provider.key as ProviderAuthProvider)
              : null;
            const authState = authProvider
              ? authStates[authProvider]
              : undefined;
            const signingIn =
              authState?.phase === "launching" ||
              authState?.phase === "waiting";
            return (
              <article
                className="content-card provider-card"
                key={provider.key}
              >
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
                    {activeProvider ? "Active" : ready ? "Ready" : "Not ready"}
                  </Badge>
                </div>
                <p>
                  {asString(status.detail, "No account details available.")}
                </p>
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
                <div className="button-row">
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
                      {activeProvider ? "In use" : "Use provider"}
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
                      Sign in again
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ToolsResponse {
  tools?: unknown[];
  nativePluginManager?: unknown;
}

interface ToolsSummaryResponse {
  summary?: Record<string, unknown>;
}

export function ToolsPage({ active }: { active: boolean }) {
  const tools = useApiResource<ToolsResponse>(active ? "/tools" : null, [
    active,
  ]);
  const summary = useApiResource<ToolsSummaryResponse>(
    active ? "/tools/summary" : null,
    [active],
  );
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
                <span>{titleCase(asString(entry.transport, "native"))}</span>
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
