import { type FormEvent, useMemo, useState } from "react";
import type {
  AccountPoolProvider,
  AccountPoolStrategy,
  ProviderAuthProvider,
  RuntimeModelsResponse,
  RuntimeReasoningEffort,
  RuntimeStatus,
} from "../shared/contracts";
import {
  asRecord,
  asString,
  Badge,
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

const _accountPoolStrategies: AccountPoolStrategy[] = [
  "priority",
  "round-robin",
  "least-used",
  "quota-aware",
];

function _formatPoolTimestamp(value?: number): string {
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

function _poolUsageSummary(usage: unknown): string | null {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const pairs = Object.entries(record).flatMap(([key, value]) =>
    typeof value === "number" ? [`${titleCase(key)}: ${value}`] : [],
  );
  return pairs.length > 0 ? pairs.join(" · ") : null;
}

function _accountPoolProviderFor(
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
