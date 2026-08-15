import { type FormEvent, useMemo, useState } from "react";
import type {
  RuntimeModelsResponse,
  RuntimeReasoningEffort,
  RuntimeStatus,
} from "../shared/contracts";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import {
  type ActionFeedback,
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
import { linkedProviderAccess } from "./model-routing";
import {
  MODEL_DIAGNOSTIC_BODY_CLASS,
  MODEL_DIAGNOSTIC_CLASS,
  MODEL_DIAGNOSTIC_COPY_CLASS,
  MODEL_FORM_ACTIONS_CLASS,
  MODEL_TUNING_BODY_CLASS,
  MODEL_TUNING_CLASS,
  MODELS_DIAGNOSTICS_CLASS,
  MODELS_FORM_CLASS,
  MODELS_PAGE_CLASS,
  MODELS_ROW_ACTIONS_CLASS,
  MODELS_WORKSPACE_CLASS,
} from "./models/models-layout";
import { modelRequests } from "./resource-request-policy";

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
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [liveDiscovery, setLiveDiscovery] = useState(false);
  const resourcePolicy = modelRequests({ active, readinessOpen });
  const settings = useApiResource<SettingsResponse>(
    resourcePolicy.primary ? "/settings" : null,
    [resourcePolicy.primary],
  );
  const accounts = useApiResource<AccountsResponse>(
    resourcePolicy.accounts ? "/runtime/accounts" : null,
    [resourcePolicy.accounts],
  );
  const models = useApiResource<RuntimeModelsResponse>(
    resourcePolicy.primary
      ? liveDiscovery
        ? "/runtime/models?refresh=true"
        : "/runtime/models?refresh=false"
      : null,
    [resourcePolicy.primary, liveDiscovery],
  );
  const model = settings.data?.settings?.model;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const discoverModels = () => {
    if (!active) return;
    if (liveDiscovery) models.reload();
    else setLiveDiscovery(true);
  };

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
  const usableProviderCount = accountProviders.filter(
    (provider) =>
      linkedProviderAccess(
        asRecord(accounts.data?.accounts?.[provider.snapshot]),
      ).usable,
  ).length;
  const registeredCapabilityCount = (models.data?.capabilities ?? []).filter(
    (capability) => capability.handlerRegistered,
  ).length;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!active) return;
    setSaving(true);
    setFeedback(null);
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
      setFeedback({
        message: "Model settings saved. New turns will use this selection.",
        tone: "good",
      });
      settings.reload();
      refreshRuntime();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`${embedded ? "settings-model-section" : "page"} ${MODELS_PAGE_CLASS}`}
    >
      {embedded ? (
        <header className="settings-section-header">
          <div>
            <span className="eyebrow">Inference</span>
            <h2>Provider & model</h2>
            <p>Choose the provider and model used by the next turn.</p>
          </div>
          <div className={MODELS_ROW_ACTIONS_CLASS}>
            {active && runtime ? (
              <Badge tone="good">
                {runtime.provider} · {runtime.model}
              </Badge>
            ) : null}
            <button
              className="text-button"
              disabled={!active}
              onClick={discoverModels}
              type="button"
            >
              {liveDiscovery ? "Refresh catalog" : "Discover live models"}
            </button>
          </div>
        </header>
      ) : (
        <PageHeader
          eyebrow="Agent"
          title="Models"
          description="Choose the provider and model used by the next turn."
          actions={
            <div className={MODELS_ROW_ACTIONS_CLASS}>
              {active && runtime ? (
                <Badge tone="good">
                  {runtime.provider} · {runtime.model}
                </Badge>
              ) : null}
              <button
                className="text-button"
                disabled={!active}
                onClick={discoverModels}
                type="button"
              >
                {liveDiscovery ? "Refresh catalog" : "Discover live models"}
              </button>
            </div>
          }
        />
      )}
      {!active ? (
        <OfflineRouteState>
          Model settings and provider catalogs are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      ) : (
        <>
          <ResourceStatusBar
            resources={[
              { label: "Model settings", resource: settings },
              { label: "Model catalog", resource: models, required: false },
              {
                label: "Provider readiness",
                resource: accounts,
                required: false,
              },
            ]}
          >
            {settings.error && settings.data ? (
              <button
                className="text-button"
                onClick={settings.reload}
                type="button"
              >
                Retry settings
              </button>
            ) : null}
            {models.error ? (
              <button
                className="text-button"
                onClick={models.reload}
                type="button"
              >
                Retry catalog
              </button>
            ) : null}
            {accounts.error ? (
              <button
                className="text-button"
                onClick={accounts.reload}
                type="button"
              >
                Retry readiness
              </button>
            ) : null}
          </ResourceStatusBar>
          {settings.loading && !settings.data ? (
            <LoadingBlock label="Loading model settings…" />
          ) : settings.error && !settings.data ? (
            <ErrorBlock error={settings.error} retry={settings.reload} />
          ) : settings.data ? (
            <div className={MODELS_WORKSPACE_CLASS}>
              <form className={MODELS_FORM_CLASS} onSubmit={save}>
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
                        <option value={selectedModelId}>
                          {selectedModelId}
                        </option>
                      ) : null}
                    </select>
                    {models.loading ? (
                      <small>Refreshing model catalog…</small>
                    ) : null}
                    {models.error ? <small>{models.error}</small> : null}
                  </label>
                </div>
                <details
                  className={MODEL_TUNING_CLASS}
                  data-model-tuning="true"
                  onToggle={(event) => setTuningOpen(event.currentTarget.open)}
                  open={tuningOpen}
                >
                  <summary>
                    <span>
                      <strong>Generation controls</strong>
                      <small>
                        Reasoning, endpoint, temperature, and output
                      </small>
                    </span>
                    <Badge>{tuningOpen ? "Open" : "Advanced"}</Badge>
                  </summary>
                  <div className={MODEL_TUNING_BODY_CLASS}>
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
                </details>
                {feedback ? (
                  <Notice tone={feedback.tone}>{feedback.message}</Notice>
                ) : null}
                <div className={MODEL_FORM_ACTIONS_CLASS}>
                  <button
                    className="primary-button"
                    disabled={saving}
                    type="submit"
                  >
                    {saving ? "Saving…" : "Save model"}
                  </button>
                </div>
              </form>
              <aside
                className={MODELS_DIAGNOSTICS_CLASS}
                aria-label="Model diagnostics"
              >
                <details
                  className={MODEL_DIAGNOSTIC_CLASS}
                  data-model-diagnostic="true"
                  onToggle={(event) =>
                    setReadinessOpen(event.currentTarget.open)
                  }
                  open={readinessOpen}
                >
                  <summary>
                    <span className={MODEL_DIAGNOSTIC_COPY_CLASS}>
                      <strong>Provider readiness</strong>
                      <small>Native accounts and local fallbacks</small>
                    </span>
                    <Badge
                      tone={
                        readinessOpen
                          ? usableProviderCount
                            ? "good"
                            : "warn"
                          : "neutral"
                      }
                    >
                      {readinessOpen
                        ? `${usableProviderCount}/${accountProviders.length} usable`
                        : "Open to load"}
                    </Badge>
                  </summary>
                  {readinessOpen ? (
                    <div className={MODEL_DIAGNOSTIC_BODY_CLASS}>
                      {accounts.loading ? (
                        <LoadingBlock />
                      ) : accounts.error ? (
                        <ErrorBlock
                          error={accounts.error}
                          retry={accounts.reload}
                        />
                      ) : (
                        <div className="stack-list">
                          {accountProviders.map((provider) => {
                            const status = asRecord(
                              accounts.data?.accounts?.[provider.snapshot],
                            );
                            const access = linkedProviderAccess(status);
                            const selected =
                              accounts.data?.activeProvider === provider.key;
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
                                    selected && access.usable
                                      ? "good"
                                      : access.tone
                                  }
                                >
                                  {selected
                                    ? access.mode === "fallback"
                                      ? "Active · fallback"
                                      : access.usable
                                        ? "Active"
                                        : "Selected · blocked"
                                    : access.label}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </details>
                <details
                  className={MODEL_DIAGNOSTIC_CLASS}
                  data-model-diagnostic="true"
                >
                  <summary>
                    <span className={MODEL_DIAGNOSTIC_COPY_CLASS}>
                      <strong>Registered capabilities</strong>
                      <small>Runtime handler truth</small>
                    </span>
                    <Badge
                      tone={
                        registeredCapabilityCount ===
                        (models.data?.capabilities ?? []).length
                          ? "good"
                          : "warn"
                      }
                    >
                      {registeredCapabilityCount}/
                      {(models.data?.capabilities ?? []).length}
                    </Badge>
                  </summary>
                  <div className={MODEL_DIAGNOSTIC_BODY_CLASS}>
                    {models.loading ? (
                      <LoadingBlock />
                    ) : models.error ? (
                      <ErrorBlock error={models.error} retry={models.reload} />
                    ) : (
                      <div className="stack-list">
                        {(models.data?.capabilities ?? []).map((capability) => (
                          <div className="status-row" key={capability.id}>
                            <div>
                              <strong>{capability.label}</strong>
                              <small>{capability.detail}</small>
                            </div>
                            <Badge
                              tone={
                                capability.handlerRegistered ? "good" : "warn"
                              }
                            >
                              {capability.handlerRegistered
                                ? "Registered"
                                : "Unavailable"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </aside>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
