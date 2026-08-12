import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountPoolResponse,
  RuntimeModelOption,
  RuntimeModelProvider,
  RuntimeModelsResponse,
  RuntimeReasoningEffort,
  RuntimeStatus,
} from "../../shared/contracts";
import { useDismissPopover } from "../composer-selectors/useDismissPopover";
import { desktopRequest, errorMessage, useApiResource } from "../lib";
import {
  defaultBaseUrlForProvider,
  routeProviderOption,
} from "../model-routing";
import "./composer-selectors.css";

export { ComposerProjectSelector } from "../composer-selectors/ComposerProjectSelector";

function filteredProviders(
  providers: RuntimeModelProvider[],
  query: string,
): RuntimeModelProvider[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return providers;
  return providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) =>
        `${provider.label} ${provider.id} ${model.label} ${model.id}`
          .toLowerCase()
          .includes(needle),
      ),
    }))
    .filter(
      (provider) =>
        provider.models.length > 0 ||
        `${provider.label} ${provider.id}`.toLowerCase().includes(needle),
    );
}

function resolvedReasoningEffort(
  model: RuntimeModelOption,
  activeEffort: string | undefined,
): string | undefined {
  if (!model.reasoning) return undefined;
  return model.reasoning.options.some((option) => option.id === activeEffort)
    ? activeEffort
    : model.reasoning.default;
}

function formatReasoningEffort(value: string | undefined): string {
  if (!value) return "Default";
  return value === "none" ? "No reasoning" : value;
}

function compactReasoningEffort(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value === "medium"
    ? "Med"
    : value === "minimal"
      ? "Min"
      : value === "none"
        ? "None"
        : value;
}

export function ComposerModelSelector({
  active,
  onOpenModelsPage,
  onOpenProvidersPage,
  refreshRuntime,
  runtime,
}: {
  active: boolean;
  onOpenModelsPage: () => void;
  onOpenProvidersPage: () => void;
  refreshRuntime: () => unknown;
  runtime: RuntimeStatus | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState("");
  const [feedback, setFeedback] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const models = useApiResource<RuntimeModelsResponse>(
    active && open ? "/runtime/models?refresh=false" : null,
    [active, open],
  );
  const accountPool = useApiResource<AccountPoolResponse>(
    active && open ? "/runtime/account-pool" : null,
    [active, open],
  );
  useDismissPopover(open, setOpen, rootRef, triggerRef);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setFeedback("");
      return;
    }
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const providers = useMemo(
    () => filteredProviders(models.data?.providers ?? [], query),
    [models.data?.providers, query],
  );
  const activeEffort =
    runtime?.provider === "codex" ||
    runtime?.provider === "openai" ||
    (runtime?.provider === "claude-code" &&
      runtime.model !== "claude-haiku-4-5")
      ? compactReasoningEffort(runtime.reasoningEffort)
      : undefined;

  const applyModel = async (
    provider: RuntimeModelProvider,
    model: RuntimeModelOption,
    effort = model.reasoning?.default,
  ) => {
    const modelId = model.id;
    const key = `${provider.id}:${modelId}`;
    setSaving(key);
    setFeedback("");
    try {
      const baseUrl =
        provider.baseUrl ??
        routeProviderOption(provider.id)?.defaultBaseUrl ??
        defaultBaseUrlForProvider(
          provider.id,
          runtime?.provider,
          provider.id === runtime?.provider ? provider.baseUrl : undefined,
        );
      await desktopRequest("/settings", "POST", {
        changes: [
          { path: "model.provider", value: provider.id },
          { path: "model.model", value: modelId },
          { path: "model.baseUrl", value: baseUrl },
          { path: "model.reasoningEffort", value: effort },
        ],
      });
      await Promise.resolve(refreshRuntime());
      setOpen(false);
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="composer-model-selector" ref={rootRef}>
      <button
        aria-label={`Choose model. Current route ${runtime?.provider ?? "unknown provider"} ${runtime?.model ?? "unknown model"}${activeEffort ? `, ${activeEffort} reasoning effort` : ""}.`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="composer-model-trigger"
        disabled={!active}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title="Choose provider and model"
        type="button"
      >
        <span>
          {runtime?.model ?? "Choose model"}
          {activeEffort ? ` · ${activeEffort}` : ""}
        </span>
        <small>{runtime?.provider ?? "provider"}</small>
        <i aria-hidden="true">⌃</i>
      </button>
      {open ? (
        <section
          aria-label="Choose provider and model"
          className="composer-popover composer-model-popover"
          role="dialog"
        >
          <label className="composer-popover-search composer-model-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search models"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
              ref={searchRef}
              value={query}
            />
          </label>
          <div className="composer-model-groups">
            {models.loading ? (
              <p className="composer-popover-state">Discovering models…</p>
            ) : models.error ? (
              <p className="composer-popover-state bad">{models.error}</p>
            ) : (
              providers.map((provider) => {
                const isCollapsed = collapsed.has(provider.id) && !query;
                return (
                  <section key={provider.id}>
                    <button
                      aria-expanded={!isCollapsed}
                      className="composer-provider-heading"
                      onClick={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(provider.id)) next.delete(provider.id);
                          else next.add(provider.id);
                          return next;
                        })
                      }
                      type="button"
                    >
                      <span aria-hidden="true">{isCollapsed ? "›" : "⌄"}</span>
                      <strong>{provider.label}</strong>
                      <small
                        className={`composer-discovery-state ${provider.discovery}`}
                      >
                        {provider.discovery === "live"
                          ? "Live"
                          : provider.ready
                            ? "Ready"
                            : "Setup"}
                      </small>
                    </button>
                    {!isCollapsed ? (
                      <div className="composer-model-list">
                        {provider.models.map((model) => {
                          const selected =
                            runtime?.provider === provider.id &&
                            runtime.model === model.id;
                          const key = `${provider.id}:${model.id}`;
                          const effort = resolvedReasoningEffort(
                            model,
                            selected
                              ? models.data?.activeReasoningEffort
                              : undefined,
                          );
                          return (
                            <div
                              aria-current={selected ? "true" : undefined}
                              className="composer-model-option"
                              key={model.id}
                            >
                              <button
                                disabled={Boolean(saving) || !provider.ready}
                                onClick={() => void applyModel(provider, model)}
                                title={model.id}
                                type="button"
                              >
                                <span>
                                  <strong>{model.label}</strong>
                                  {model.label !== model.id ? (
                                    <small>{model.id}</small>
                                  ) : null}
                                </span>
                                <i aria-hidden="true">
                                  {saving === key
                                    ? "…"
                                    : selected
                                      ? "✓"
                                      : model.source === "discovered"
                                        ? "Live"
                                        : ""}
                                </i>
                              </button>
                              {model.reasoning ? (
                                <label className="composer-model-effort">
                                  <span>Effort</span>
                                  <select
                                    aria-label={`${model.label} reasoning effort`}
                                    disabled={
                                      Boolean(saving) || !provider.ready
                                    }
                                    onChange={(event) =>
                                      void applyModel(
                                        provider,
                                        model,
                                        event.target
                                          .value as RuntimeReasoningEffort,
                                      )
                                    }
                                    value={effort ?? ""}
                                  >
                                    {model.reasoning.options.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {formatReasoningEffort(option.label)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                            </div>
                          );
                        })}
                        {!provider.models.length ? (
                          <p>{provider.detail}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}
            {!models.loading && !models.error && !providers.length ? (
              <p className="composer-popover-state">No matching models.</p>
            ) : null}
          </div>
          {feedback ? (
            <p className="composer-model-feedback" role="alert">
              {feedback}
            </p>
          ) : null}
          <div className="composer-agent-pool-note">
            <strong>Spawned-agent pool</strong>
            <span>
              {accountPool.loading
                ? "Checking Codex and Claude accounts…"
                : accountPool.error
                  ? "Account-pool status is unavailable."
                  : `${
                      accountPool.data?.providers[
                        "openai-codex"
                      ].accounts.filter((account) => account.enabled).length ??
                      0
                    } Codex · ${
                      accountPool.data?.providers[
                        "anthropic-subscription"
                      ].accounts.filter((account) => account.enabled).length ??
                      0
                    } Claude accounts are enabled for spawned build and research sessions.`}
            </span>
            <button
              onClick={() => {
                setOpen(false);
                onOpenProvidersPage();
              }}
              type="button"
            >
              Providers &amp; accounts
            </button>
          </div>
          <footer className="composer-popover-actions">
            <button onClick={models.reload} type="button">
              <span aria-hidden="true">↻</span>
              Refresh models
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onOpenModelsPage();
              }}
              type="button"
            >
              Model settings
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

export { filteredProviders };
