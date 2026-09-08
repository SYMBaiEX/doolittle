import { X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  RuntimeModelsResponse,
  RuntimeReasoningEffort,
  RuntimeStatus,
} from "../../shared/contracts";
import {
  ROUTE_DIALOG_ACTIONS_CLASS,
  ROUTE_DIALOG_BACKDROP_CLASS,
  ROUTE_DIALOG_CLASS,
  ROUTE_DIALOG_FORM_CLASS,
  ROUTE_DIALOG_HEADER_CLASS,
  ROUTE_DIALOG_STATUS_CLASS,
  ROUTE_FIELD_GRID_CLASS,
  ROUTE_PROVIDER_CARD_CLASS,
  ROUTE_PROVIDER_CARD_SELECTED_CLASS,
  ROUTE_PROVIDER_GRID_CLASS,
  ROUTE_PROVIDER_READINESS_CLASS,
  ROUTE_PROVIDER_READINESS_TONE,
} from "../app-shell/overlay-layout";
import { ICON_BUTTON_CLASS } from "../app-shell/shell-layout";
import {
  type ActionFeedback,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  errorMessage,
  Notice,
  useApiResource,
} from "../lib";
import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  type LinkedProviderAccountsLike,
  providerReadiness,
  ROUTE_PROVIDER_OPTIONS,
  type RouteProviderId,
} from "../model-routing";
import { UiIcon } from "./UiIcon";
import { useModalFocusBoundary } from "./useModalFocusBoundary";

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
  accounts?: LinkedProviderAccountsLike;
}

interface RouteDraft {
  provider: string;
  model: string;
  baseUrl: string;
  temperature: string;
  maxTokens: string;
  reasoningEffort: string;
}

function draftFromSettings(
  settings: SettingsResponse | null,
  runtime: RuntimeStatus | null,
): RouteDraft {
  const model = settings?.settings?.model;
  return {
    provider: model?.provider ?? runtime?.provider ?? "ollama",
    model: model?.model ?? runtime?.model ?? "granite4.1:3b",
    baseUrl: model?.baseUrl ?? "",
    temperature:
      typeof model?.temperature === "number" ? String(model.temperature) : "",
    maxTokens:
      typeof model?.maxTokens === "number" ? String(model.maxTokens) : "",
    reasoningEffort: model?.reasoningEffort ?? "",
  };
}

export function RouteControlDialog({
  isOpen,
  onClose,
  onOpenModelsPage,
  refreshRuntime,
  runtime,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenModelsPage: () => void;
  refreshRuntime: () => void;
  runtime: RuntimeStatus | null;
}) {
  const settings = useApiResource<SettingsResponse>(
    isOpen ? "/settings" : null,
    [isOpen],
  );
  const accounts = useApiResource<AccountsResponse>(
    isOpen ? "/runtime/accounts" : null,
    [isOpen],
  );
  const models = useApiResource<RuntimeModelsResponse>(
    isOpen ? "/runtime/models?refresh=false" : null,
    [isOpen],
  );
  const [draft, setDraft] = useState<RouteDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const dialogRef = useModalFocusBoundary({
    active: isOpen,
    initialFocusSelector: '[aria-label="Close route controls"]',
    isolateBackground: true,
    onClose,
    restoreFocus: true,
  });

  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      setFeedback(null);
      setSaving(false);
    }
  }, [isOpen]);

  const linkedAccounts = useMemo(
    () =>
      (asRecord(accounts.data?.accounts) as LinkedProviderAccountsLike) ?? null,
    [accounts.data?.accounts],
  );

  const effectiveDraft = draft ?? draftFromSettings(settings.data, runtime);
  const activeProvider = effectiveDraft.provider;
  const readiness = providerReadiness(activeProvider, linkedAccounts);
  const selectedModel = useMemo(
    () =>
      models.data?.providers
        .find((provider) => provider.id === effectiveDraft.provider)
        ?.models.find((model) => model.id === effectiveDraft.model.trim()),
    [effectiveDraft.model, effectiveDraft.provider, models.data?.providers],
  );
  const reasoningOptions = selectedModel?.reasoning?.options ?? [];
  const resolvedReasoningEffort = reasoningOptions.some(
    (option) => option.id === effectiveDraft.reasoningEffort,
  )
    ? (effectiveDraft.reasoningEffort as RuntimeReasoningEffort)
    : (selectedModel?.reasoning?.default ?? reasoningOptions[0]?.id);
  const selectedReasoningOption = reasoningOptions.find(
    (option) => option.id === resolvedReasoningEffort,
  );

  const chooseProvider = (provider: RouteProviderId) => {
    setDraft((current) => {
      const previous = current ?? draftFromSettings(settings.data, runtime);
      const currentSettings = settings.data?.settings?.model;
      return {
        ...previous,
        provider,
        model: defaultModelForProvider(
          provider,
          currentSettings?.provider ?? runtime?.provider,
          currentSettings?.model ?? runtime?.model,
        ),
        baseUrl: defaultBaseUrlForProvider(
          provider,
          currentSettings?.provider ?? runtime?.provider,
          currentSettings?.baseUrl,
        ),
      };
    });
    setFeedback(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const submittedDraft = effectiveDraft;
    setSaving(true);
    setFeedback(null);
    try {
      const changes: Array<{ path: string; value: string | number | null }> = [
        { path: "model.provider", value: submittedDraft.provider },
        { path: "model.model", value: submittedDraft.model.trim() },
        {
          path: "model.reasoningEffort",
          value: reasoningOptions.length ? resolvedReasoningEffort : null,
        },
      ];

      await desktopRequest("/settings", "POST", { changes });

      setFeedback({
        message: "Route updated. New turns use this model path.",
        tone: "good",
      });
      settings.reload();
      accounts.reload();
      refreshRuntime();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={ROUTE_DIALOG_BACKDROP_CLASS}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="route-control-title"
    >
      <div className={ROUTE_DIALOG_CLASS} ref={dialogRef} tabIndex={-1}>
        <div className={ROUTE_DIALOG_HEADER_CLASS}>
          <div>
            <span className="eyebrow">Conversation route</span>
            <h2 id="route-control-title">Choose model</h2>
            <p>Switch the route for new messages in this conversation.</p>
          </div>
          <button
            aria-label="Close route controls"
            className={ICON_BUTTON_CLASS}
            onClick={onClose}
            type="button"
          >
            <UiIcon icon={X} size="sm" />
          </button>
        </div>

        <form className={ROUTE_DIALOG_FORM_CLASS} onSubmit={save}>
          <div className={ROUTE_DIALOG_STATUS_CLASS}>
            <Badge tone={readiness.tone}>
              {readiness.ready ? "Ready now" : "Needs setup"}
            </Badge>
            <strong>
              {asString(runtime?.provider, effectiveDraft.provider)} ·{" "}
              {asString(runtime?.model, effectiveDraft.model)}
            </strong>
            <small>
              {accounts.loading
                ? "Checking linked accounts…"
                : readiness.detail}
            </small>
          </div>

          <div className={ROUTE_PROVIDER_GRID_CLASS}>
            {ROUTE_PROVIDER_OPTIONS.map((option) => {
              const summary = providerReadiness(option.id, linkedAccounts);
              const selected = effectiveDraft.provider === option.id;
              return (
                <button
                  aria-pressed={selected}
                  className={`${ROUTE_PROVIDER_CARD_CLASS} ${selected ? ROUTE_PROVIDER_CARD_SELECTED_CLASS : ""}`}
                  key={option.id}
                  onClick={() => chooseProvider(option.id)}
                  type="button"
                >
                  <span>{option.eyebrow}</span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                  <i
                    className={`${ROUTE_PROVIDER_READINESS_CLASS} ${ROUTE_PROVIDER_READINESS_TONE[summary.tone]}`}
                  >
                    {accounts.loading
                      ? "Checking"
                      : summary.ready
                        ? "Ready"
                        : "Manual"}
                  </i>
                </button>
              );
            })}
          </div>

          <div className={ROUTE_FIELD_GRID_CLASS}>
            <label>
              <span>Model</span>
              <input
                aria-label="Model"
                list="route-model-options"
                onChange={(event) =>
                  setDraft({ ...effectiveDraft, model: event.target.value })
                }
                placeholder="granite4.1:3b"
                value={effectiveDraft.model}
              />
              <datalist id="route-model-options">
                {models.data?.providers
                  .find((provider) => provider.id === effectiveDraft.provider)
                  ?.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
              </datalist>
              {models.loading ? <small>Updating model list…</small> : null}
            </label>
            {reasoningOptions.length ? (
              <label>
                <span>Reasoning effort</span>
                <select
                  aria-label="Reasoning effort"
                  onChange={(event) =>
                    setDraft({
                      ...effectiveDraft,
                      reasoningEffort: event.target.value,
                    })
                  }
                  value={resolvedReasoningEffort ?? ""}
                >
                  {reasoningOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {selectedReasoningOption?.description ? (
                  <small>{selectedReasoningOption.description}</small>
                ) : null}
              </label>
            ) : null}
          </div>

          {settings.error || accounts.error || models.error ? (
            <Notice tone="warn">
              Some route details are unavailable. You can still use the current
              route or open advanced settings.
            </Notice>
          ) : null}

          {feedback ? (
            <Notice tone={feedback.tone}>{feedback.message}</Notice>
          ) : null}

          <div className={ROUTE_DIALOG_ACTIONS_CLASS}>
            <button
              className="secondary-button"
              onClick={onOpenModelsPage}
              type="button"
            >
              Advanced settings
            </button>
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Applying…" : "Apply route"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
