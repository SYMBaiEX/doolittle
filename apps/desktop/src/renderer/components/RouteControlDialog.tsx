import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { RuntimeStatus } from "../../shared/contracts";
import {
  ROUTE_DIALOG_ACTIONS_CLASS,
  ROUTE_DIALOG_BACKDROP_CLASS,
  ROUTE_DIALOG_CLASS,
  ROUTE_DIALOG_FORM_CLASS,
  ROUTE_DIALOG_HEADER_CLASS,
  ROUTE_DIALOG_STATUS_CLASS,
  ROUTE_FIELD_GRID_CLASS,
  ROUTE_FIELD_SPAN_CLASS,
  ROUTE_PROVIDER_CARD_CLASS,
  ROUTE_PROVIDER_CARD_SELECTED_CLASS,
  ROUTE_PROVIDER_GRID_CLASS,
  ROUTE_PROVIDER_READINESS_CLASS,
  ROUTE_PROVIDER_READINESS_TONE,
} from "../app-shell/overlay-layout";
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
import { useModalFocusBoundary } from "./useModalFocusBoundary";

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
  accounts?: LinkedProviderAccountsLike;
}

interface RouteDraft {
  provider: string;
  model: string;
  baseUrl: string;
  temperature: string;
  maxTokens: string;
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
  };
}

function parseOptionalNumber(
  value: string,
  fallback: number | undefined,
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalInteger(
  value: string,
  fallback: number | undefined,
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
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
    if (!isOpen) return;
    if (settings.loading || settings.error || draft) return;
    setDraft(draftFromSettings(settings.data, runtime));
  }, [draft, isOpen, runtime, settings.data, settings.error, settings.loading]);

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

  const activeProvider = draft?.provider ?? runtime?.provider ?? "ollama";
  const readiness = providerReadiness(activeProvider, linkedAccounts);

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
    if (!draft) return;
    const current = settings.data?.settings?.model;
    setSaving(true);
    setFeedback(null);
    try {
      const resolvedTemperature = parseOptionalNumber(
        draft.temperature,
        current?.temperature,
      );
      const resolvedMaxTokens = parseOptionalInteger(
        draft.maxTokens,
        current?.maxTokens,
      );

      const changes: Array<{ path: string; value: string | number }> = [
        { path: "model.provider", value: draft.provider },
        { path: "model.model", value: draft.model.trim() },
        { path: "model.baseUrl", value: draft.baseUrl.trim() },
      ];
      if (resolvedTemperature !== undefined) {
        changes.push({
          path: "model.temperature",
          value: resolvedTemperature,
        });
      }
      if (resolvedMaxTokens !== undefined) {
        changes.push({ path: "model.maxTokens", value: resolvedMaxTokens });
      }

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
            <h2 id="route-control-title">Model route</h2>
            <p>Applies to new turns; existing messages stay unchanged.</p>
          </div>
          <button
            aria-label="Close route controls"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        {settings.loading || accounts.loading || !draft ? (
          <LoadingBlock label="Loading route controls…" />
        ) : settings.error ? (
          <ErrorBlock error={settings.error} retry={settings.reload} />
        ) : accounts.error ? (
          <ErrorBlock error={accounts.error} retry={accounts.reload} />
        ) : (
          <form className={ROUTE_DIALOG_FORM_CLASS} onSubmit={save}>
            <div className={ROUTE_DIALOG_STATUS_CLASS}>
              <Badge tone={readiness.tone}>
                {readiness.ready ? "Ready now" : "Needs setup"}
              </Badge>
              <strong>
                {asString(runtime?.provider, draft.provider)} ·{" "}
                {asString(runtime?.model, draft.model)}
              </strong>
              <small>{readiness.detail}</small>
            </div>

            <div className={ROUTE_PROVIDER_GRID_CLASS}>
              {ROUTE_PROVIDER_OPTIONS.map((option) => {
                const summary = providerReadiness(option.id, linkedAccounts);
                const selected = draft.provider === option.id;
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
                      {summary.ready ? "Ready" : "Manual"}
                    </i>
                  </button>
                );
              })}
            </div>

            <div className={ROUTE_FIELD_GRID_CLASS}>
              <label>
                <span>Provider</span>
                <input readOnly value={draft.provider} />
              </label>
              <label>
                <span>Model</span>
                <input
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, model: event.target.value }
                        : current,
                    )
                  }
                  placeholder="granite4.1:3b"
                  value={draft.model}
                />
              </label>
              <label className={ROUTE_FIELD_SPAN_CLASS}>
                <span>Base URL</span>
                <input
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, baseUrl: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Optional override"
                  value={draft.baseUrl}
                />
              </label>
              <label>
                <span>Temperature</span>
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, temperature: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Leave unchanged"
                  value={draft.temperature}
                />
              </label>
              <label>
                <span>Maximum tokens</span>
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, maxTokens: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Leave unchanged"
                  value={draft.maxTokens}
                />
              </label>
            </div>

            {feedback ? (
              <Notice tone={feedback.tone}>{feedback.message}</Notice>
            ) : null}

            <div className={ROUTE_DIALOG_ACTIONS_CLASS}>
              <button
                className="secondary-button"
                onClick={onOpenModelsPage}
                type="button"
              >
                Full model settings
              </button>
              <button
                className="primary-button"
                disabled={saving}
                type="submit"
              >
                {saving ? "Applying…" : "Apply route"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
