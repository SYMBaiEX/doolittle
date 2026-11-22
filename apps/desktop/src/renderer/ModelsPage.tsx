import { Input, NativeSelect } from "@doolittle/ui";
import {
  Cable,
  Cpu,
  ListChecks,
  Radar,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { type FormEvent, useId, useMemo, useState } from "react";
import type {
  RuntimeModelsResponse,
  RuntimeReasoningEffort,
  RuntimeStatus,
} from "../shared/contracts";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import { ProviderDisclosure } from "./connections/ProviderDisclosure";
import { ProviderIdentity } from "./connections/ProviderIdentity";
import {
  type AccountsResponse,
  accountProviders,
} from "./connections/provider-accounts";
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
  titleCase,
  useApiResource,
} from "./lib";
import { linkedProviderAccess } from "./model-routing";
import { modelRequests } from "./resource-request-policy";
import type { SettingsResponse } from "./settings/settings-types";

export function ModelsPage({
  active,
  runtime,
  refreshRuntime,
  onOpenProviders,
}: {
  active: boolean;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void;
  onOpenProviders?: () => void;
}) {
  const fieldId = useId();
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
  const selectedReasoningEffort = (() => {
    const requestedEffort = fieldValue(
      "reasoningEffort",
      model?.reasoningEffort ?? selectedModel?.reasoning?.default,
    );
    return reasoningOptions.some((option) => option.id === requestedEffort)
      ? (requestedEffort as RuntimeReasoningEffort)
      : (selectedModel?.reasoning?.default ?? reasoningOptions[0]?.id);
  })();
  const linkedAccounts = accountProviders.map((provider) => {
    const status = asRecord(accounts.data?.accounts?.[provider.snapshot]);
    return { provider, status, access: linkedProviderAccess(status) };
  });
  const usableProviderCount = linkedAccounts.filter(
    ({ access }) => access.usable,
  ).length;
  const hasUncheckedAccounts = linkedAccounts.some(
    ({ access }) => access.mode === "unchecked",
  );
  const registeredCapabilityCount = (models.data?.capabilities ?? []).filter(
    (capability) => capability.handlerRegistered,
  ).length;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || saving) return;
    const submittedDraft = draft;
    const temperatureInput = fieldValue("temperature", model?.temperature);
    const temperature = Number(temperatureInput);
    const maxTokens = Number(fieldValue("maxTokens", model?.maxTokens));
    if (
      temperatureInput === "" ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2
    ) {
      setTuningOpen(true);
      setFeedback({
        message: "Enter a temperature between 0 and 2.",
        tone: "bad",
      });
      return;
    }
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) {
      setTuningOpen(true);
      setFeedback({
        message: "Enter a positive whole number for maximum tokens.",
        tone: "bad",
      });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
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
            value: temperature,
          },
          {
            path: "model.maxTokens",
            value: maxTokens,
          },
          {
            path: "model.reasoningEffort",
            value: reasoningOptions.length ? selectedReasoningEffort : null,
          },
        ],
      });
      setDraft((current) => (current === submittedDraft ? {} : current));
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

  const activeProvider = runtime?.provider || asString(model?.provider);
  const activeModel = runtime?.model || asString(model?.model);

  return (
    <div className="settings-model-section provider-settings provider-settings--models">
      <WorkbenchSection
        actions={
          <WorkbenchAction
            disabled={!active}
            icon={Radar}
            onClick={discoverModels}
          >
            {liveDiscovery ? "Refresh catalog" : "Discover live models"}
          </WorkbenchAction>
        }
        description="Set the provider and model used by the next turn."
        icon={Cpu}
        title="Provider & model"
      >
        {active && (activeProvider || activeModel) ? (
          <dl className="model-route-card" aria-label="Current model route">
            <div>
              <dt>
                {runtime?.provider ? "Current provider" : "Saved provider"}
              </dt>
              <dd>
                {models.data?.providers.find(
                  (entry) => entry.id === activeProvider,
                )?.label ??
                  (titleCase(activeProvider) || "None selected")}
              </dd>
            </div>
            <div>
              <dt>{runtime?.model ? "Current model" : "Saved model"}</dt>
              <dd>{activeModel || "None selected"}</dd>
            </div>
          </dl>
        ) : null}
      </WorkbenchSection>
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
              <WorkbenchAction emphasis="quiet" onClick={settings.reload}>
                Retry settings
              </WorkbenchAction>
            ) : null}
            {models.error ? (
              <WorkbenchAction emphasis="quiet" onClick={models.reload}>
                Retry catalog
              </WorkbenchAction>
            ) : null}
            {accounts.error ? (
              <WorkbenchAction emphasis="quiet" onClick={accounts.reload}>
                Retry readiness
              </WorkbenchAction>
            ) : null}
          </ResourceStatusBar>
          {settings.loading && !settings.data ? (
            <LoadingBlock label="Loading model settings…" />
          ) : settings.error && !settings.data ? (
            <ErrorBlock error={settings.error} retry={settings.reload} />
          ) : settings.data ? (
            <div className="model-workspace">
              <WorkbenchSection
                description="Changes take effect after you save the route."
                headingLevel={3}
                title="Active model"
              >
                <form
                  aria-busy={saving}
                  className="model-route-form"
                  noValidate
                  onSubmit={save}
                >
                  <div className="model-fields">
                    <label htmlFor={`${fieldId}-provider`}>
                      <span>Provider</span>
                      <NativeSelect
                        id={`${fieldId}-provider`}
                        value={selectedProviderId}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            provider: event.target.value,
                            model:
                              models.data?.providers.find(
                                (provider) =>
                                  provider.id === event.target.value,
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
                      </NativeSelect>
                      <small>
                        {selectedProvider?.detail ??
                          "Provider availability is detected from this machine."}
                      </small>
                    </label>
                    <label htmlFor={`${fieldId}-model`}>
                      <span>Model</span>
                      <NativeSelect
                        id={`${fieldId}-model`}
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
                            {entry.source === "discovered"
                              ? " · Discovered"
                              : ""}
                          </option>
                        ))}
                        {!selectedProvider?.models.some(
                          (entry) => entry.id === selectedModelId,
                        ) && selectedModelId ? (
                          <option value={selectedModelId}>
                            {selectedModelId}
                          </option>
                        ) : null}
                      </NativeSelect>
                      {models.loading ? (
                        <small>Refreshing model catalog…</small>
                      ) : null}
                      {models.error ? <small>{models.error}</small> : null}
                    </label>
                  </div>
                  <ProviderDisclosure
                    data-model-tuning="true"
                    description="Reasoning, endpoint, temperature, and output"
                    icon={SlidersHorizontal}
                    onToggle={(event) =>
                      setTuningOpen(event.currentTarget.open)
                    }
                    open={tuningOpen}
                    title="Generation controls"
                  >
                    <div className="model-fields">
                      {reasoningOptions.length ? (
                        <label htmlFor={`${fieldId}-reasoning`}>
                          <span>Reasoning effort</span>
                          <NativeSelect
                            id={`${fieldId}-reasoning`}
                            value={selectedReasoningEffort ?? ""}
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
                          </NativeSelect>
                          <small>
                            {
                              reasoningOptions.find(
                                (option) =>
                                  option.id === selectedReasoningEffort,
                              )?.description
                            }
                          </small>
                        </label>
                      ) : null}
                      <label
                        className="field-span"
                        htmlFor={`${fieldId}-base-url`}
                      >
                        <span>Base URL</span>
                        <Input
                          id={`${fieldId}-base-url`}
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
                      <label htmlFor={`${fieldId}-temperature`}>
                        <span>Temperature</span>
                        <Input
                          id={`${fieldId}-temperature`}
                          type="number"
                          min="0"
                          max="2"
                          step="any"
                          value={fieldValue("temperature", model?.temperature)}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              temperature: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label htmlFor={`${fieldId}-token-limit`}>
                        <span>Maximum tokens</span>
                        <Input
                          id={`${fieldId}-token-limit`}
                          type="number"
                          min="1"
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
                  </ProviderDisclosure>
                  {feedback ? (
                    <Notice tone={feedback.tone}>{feedback.message}</Notice>
                  ) : null}
                  <div className="provider-form-actions">
                    <WorkbenchAction
                      disabled={saving}
                      emphasis="primary"
                      icon={Save}
                      type="submit"
                    >
                      {saving ? "Saving…" : "Save model"}
                    </WorkbenchAction>
                  </div>
                </form>
              </WorkbenchSection>
              <aside
                className="model-diagnostics"
                aria-label="Model diagnostics"
              >
                <ProviderDisclosure
                  data-model-diagnostic="true"
                  description="Signed-in accounts and local fallbacks"
                  icon={Cable}
                  onToggle={(event) =>
                    setReadinessOpen(event.currentTarget.open)
                  }
                  open={readinessOpen}
                  status={
                    readinessOpen ? (
                      <Badge
                        tone={
                          usableProviderCount
                            ? "good"
                            : hasUncheckedAccounts
                              ? "neutral"
                              : "warn"
                        }
                      >
                        {hasUncheckedAccounts && !usableProviderCount
                          ? "Accounts unchecked"
                          : `${usableProviderCount}/${linkedAccounts.length} usable`}
                      </Badge>
                    ) : null
                  }
                  title="Provider readiness"
                >
                  {readinessOpen ? (
                    <div className="model-diagnostic-list">
                      {accounts.loading ? (
                        <LoadingBlock />
                      ) : accounts.error ? (
                        <ErrorBlock
                          error={accounts.error}
                          retry={accounts.reload}
                        />
                      ) : (
                        <div className="stack-list">
                          {hasUncheckedAccounts && onOpenProviders ? (
                            <WorkbenchAction
                              emphasis="quiet"
                              icon={Cable}
                              onClick={onOpenProviders}
                            >
                              Manage provider accounts
                            </WorkbenchAction>
                          ) : null}
                          {linkedAccounts.map(
                            ({ access, provider, status }) => {
                              const unchecked = access.mode === "unchecked";
                              const selected =
                                accounts.data?.activeProvider === provider.key;
                              return (
                                <div
                                  className="model-diagnostic-row"
                                  key={provider.key}
                                >
                                  <ProviderIdentity
                                    initials={provider.shortLabel}
                                  />
                                  <div>
                                    <strong>{provider.label}</strong>
                                    <small>
                                      {unchecked
                                        ? "Check saved accounts in Providers & accounts."
                                        : asString(
                                            status.detail,
                                            "Not configured",
                                          )}
                                    </small>
                                  </div>
                                  <Badge
                                    tone={
                                      unchecked
                                        ? "neutral"
                                        : selected && access.usable
                                          ? "good"
                                          : access.tone
                                    }
                                  >
                                    {unchecked
                                      ? "Not checked"
                                      : selected
                                        ? access.mode === "fallback"
                                          ? "Active · fallback"
                                          : access.usable
                                            ? "Active"
                                            : "Selected · blocked"
                                        : access.label}
                                  </Badge>
                                </div>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </ProviderDisclosure>
                <ProviderDisclosure
                  data-model-diagnostic="true"
                  description="Model tasks the local runtime can route"
                  icon={ListChecks}
                  status={
                    models.data ? (
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
                    ) : null
                  }
                  title="Registered capabilities"
                >
                  <div className="model-diagnostic-list">
                    {models.loading ? (
                      <LoadingBlock />
                    ) : models.error ? (
                      <ErrorBlock error={models.error} retry={models.reload} />
                    ) : models.data?.capabilities?.length ? (
                      <div className="stack-list">
                        {(models.data?.capabilities ?? []).map((capability) => (
                          <div
                            className="model-diagnostic-row"
                            key={capability.id}
                          >
                            <ProviderIdentity icon={Cpu} />
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
                    ) : (
                      <WorkbenchEmpty title="No capabilities reported" />
                    )}
                  </div>
                </ProviderDisclosure>
              </aside>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
