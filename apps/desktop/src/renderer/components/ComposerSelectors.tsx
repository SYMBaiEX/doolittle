import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountPoolResponse,
  RuntimeModelOption,
  RuntimeModelProvider,
  RuntimeModelsResponse,
  RuntimeReasoningEffort,
  RuntimeStatus,
} from "../../shared/contracts";
import {
  COMPOSER_ACTIONS_CLASS,
  COMPOSER_EFFORT_CLASS,
  COMPOSER_MODEL_BUTTON_CLASS,
  COMPOSER_MODEL_EFFORT_BADGE_CLASS,
  COMPOSER_MODEL_GROUPS_CLASS,
  COMPOSER_MODEL_LIST_CLASS,
  COMPOSER_MODEL_NAME_CLASS,
  COMPOSER_MODEL_OPTION_CLASS,
  COMPOSER_MODEL_TRIGGER_CLASS,
  COMPOSER_POPOVER_CLASS,
  COMPOSER_PROVIDER_HEADING_CLASS,
  COMPOSER_SEARCH_CLASS,
  COMPOSER_SELECTOR_ROOT_CLASS,
} from "../composer-selectors/layout";
import { useDismissPopover } from "../composer-selectors/useDismissPopover";
import { desktopRequest, errorMessage, useApiResource } from "../lib";
import {
  defaultBaseUrlForProvider,
  routeProviderOption,
} from "../model-routing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ElizaControls";

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
    : (model.reasoning.default ?? model.reasoning.options[0]?.id);
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
  const restoreTriggerFocusRef = useRef(false);
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
      if (restoreTriggerFocusRef.current) {
        restoreTriggerFocusRef.current = false;
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
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
    effort?: RuntimeReasoningEffort,
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
      const resolvedEffort = model.reasoning
        ? resolvedReasoningEffort(model, effort)
        : null;
      await desktopRequest("/settings", "POST", {
        changes: [
          { path: "model.provider", value: provider.id },
          { path: "model.model", value: modelId },
          { path: "model.baseUrl", value: baseUrl },
          { path: "model.reasoningEffort", value: resolvedEffort },
        ],
      });
      await Promise.resolve(refreshRuntime());
      restoreTriggerFocusRef.current = true;
      setOpen(false);
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSaving("");
    }
  };

  return (
    <div
      className={`${COMPOSER_SELECTOR_ROOT_CLASS} ml-auto min-w-0`}
      ref={rootRef}
    >
      <button
        aria-label={`Choose model. Current route ${runtime?.provider ?? "unknown provider"} ${runtime?.model ?? "unknown model"}${activeEffort ? `, ${activeEffort} reasoning effort` : ""}.`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={COMPOSER_MODEL_TRIGGER_CLASS}
        disabled={!active}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title="Choose provider and model"
        type="button"
      >
        <span className={COMPOSER_MODEL_NAME_CLASS}>
          {runtime?.model ?? "Choose model"}
        </span>
        {activeEffort ? (
          <span className={COMPOSER_MODEL_EFFORT_BADGE_CLASS}>
            {activeEffort}
          </span>
        ) : null}
        <small>{runtime?.provider ?? "provider"}</small>
        <i aria-hidden="true">⌃</i>
      </button>
      {open ? (
        <section
          aria-label="Choose provider and model"
          className={`${COMPOSER_POPOVER_CLASS} max-h-[min(620px,72vh)] w-[min(420px,calc(100vw-44px))]`}
          role="dialog"
        >
          <label className={`${COMPOSER_SEARCH_CLASS} m-2 mb-1.25`}>
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search models"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
              ref={searchRef}
              value={query}
            />
          </label>
          <div className={COMPOSER_MODEL_GROUPS_CLASS}>
            {models.loading ? (
              <p className="p-4.5 text-[10px] text-[var(--faint)]">
                Discovering models…
              </p>
            ) : models.error ? (
              <p className="p-4.5 text-[10px] text-[var(--bad)]">
                {models.error}
              </p>
            ) : (
              providers.map((provider) => {
                const isCollapsed = collapsed.has(provider.id) && !query;
                return (
                  <section key={provider.id}>
                    <button
                      aria-expanded={!isCollapsed}
                      className={COMPOSER_PROVIDER_HEADING_CLASS}
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
                        className={`rounded-full border px-1.25 py-0.5 font-mono text-[length:var(--text-meta)] tracking-[0.04em] uppercase ${
                          provider.discovery === "live"
                            ? "border-[color-mix(in_srgb,var(--good)_32%,var(--border))] text-[var(--good)]"
                            : "border-[var(--border)] text-[var(--faint)]"
                        }`}
                      >
                        {provider.discovery === "live"
                          ? "Live"
                          : provider.ready
                            ? "Ready"
                            : "Setup"}
                      </small>
                    </button>
                    {!isCollapsed ? (
                      <div className={COMPOSER_MODEL_LIST_CLASS}>
                        {provider.models.map((model) => {
                          const selected =
                            runtime?.provider === provider.id &&
                            runtime.model === model.id;
                          const key = `${provider.id}:${model.id}`;
                          const effort = resolvedReasoningEffort(
                            model,
                            selected
                              ? (runtime?.reasoningEffort ??
                                  models.data?.activeReasoningEffort)
                              : undefined,
                          );
                          return (
                            <div
                              className={COMPOSER_MODEL_OPTION_CLASS}
                              key={model.id}
                            >
                              <button
                                aria-current={selected ? "true" : undefined}
                                className={COMPOSER_MODEL_BUTTON_CLASS}
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
                                <div className={COMPOSER_EFFORT_CLASS}>
                                  <span>Effort</span>
                                  <Select
                                    onValueChange={(value) =>
                                      void applyModel(
                                        provider,
                                        model,
                                        value as RuntimeReasoningEffort,
                                      )
                                    }
                                    value={effort}
                                  >
                                    <SelectTrigger
                                      aria-label={`${model.label} reasoning effort`}
                                      className="!h-6 !min-h-6 min-w-20 border-[var(--border)] bg-[var(--surface)] px-1.5 py-0 font-mono text-[length:var(--text-meta)] text-[var(--text)] lowercase hover:border-[var(--border-strong)]"
                                      disabled={
                                        Boolean(saving) || !provider.ready
                                      }
                                    >
                                      <SelectValue placeholder="Default" />
                                    </SelectTrigger>
                                    <SelectContent
                                      className="border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)]"
                                      onPointerDown={(event) =>
                                        event.stopPropagation()
                                      }
                                    >
                                      {model.reasoning.options.map((option) => (
                                        <SelectItem
                                          className="font-mono text-[10px] text-[var(--text)] lowercase focus:bg-[var(--surface-hover)] focus:text-[var(--text)]"
                                          key={option.id}
                                          value={option.id}
                                        >
                                          {formatReasoningEffort(option.label)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
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
              <p className="p-4.5 text-[10px] text-[var(--faint)]">
                No matching models.
              </p>
            ) : null}
          </div>
          {feedback ? (
            <p
              className="border-[var(--border)] border-t px-3 py-1.75 text-[length:var(--text-meta)] text-[var(--bad)]"
              role="alert"
            >
              {feedback}
            </p>
          ) : null}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-[var(--border)] border-t bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-soft))] px-3 py-2.25 text-[length:var(--text-meta)] text-[var(--muted)] max-[560px]:grid-cols-[1fr_auto] [&>button]:whitespace-nowrap [&>button]:border-0 [&>button]:bg-transparent [&>button]:text-[length:var(--text-meta)] [&>button]:text-[var(--accent)] [&>span]:min-w-0 max-[560px]:[&>span]:col-span-full [&>strong]:text-[var(--text)]">
            <strong>Spawned-agent pool</strong>
            <span>
              {accountPool.loading
                ? "Checking Codex and Claude accounts…"
                : accountPool.error
                  ? "Account-pool status is unavailable."
                  : `${
                      accountPool.data?.providers[
                        "openai-codex"
                      ]?.accounts.filter((account) => account.enabled).length ??
                      0
                    } Codex · ${
                      accountPool.data?.providers[
                        "anthropic-subscription"
                      ]?.accounts.filter((account) => account.enabled).length ??
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
          <footer className={COMPOSER_ACTIONS_CLASS}>
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
