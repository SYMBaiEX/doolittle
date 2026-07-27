import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeStatus } from "../../shared/contracts";
import {
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
  const [feedback, setFeedback] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (settings.loading || settings.error || draft) return;
    setDraft(draftFromSettings(settings.data, runtime));
  }, [draft, isOpen, runtime, settings.data, settings.error, settings.loading]);

  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      setFeedback("");
      setSaving(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const backgroundElements = new Set<HTMLElement>();
    let pathElement: HTMLElement | null = dialog;
    while (pathElement && pathElement !== document.body) {
      const parent = pathElement.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (
          sibling instanceof HTMLElement &&
          sibling !== pathElement &&
          !sibling.contains(dialog)
        ) {
          backgroundElements.add(sibling);
        }
      }
      pathElement = parent;
    }
    const background = Array.from(backgroundElements).map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    for (const entry of background) {
      entry.element.inert = true;
      entry.element.setAttribute("aria-hidden", "true");
    }

    requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      for (const entry of background) {
        entry.element.inert = entry.inert;
        if (entry.ariaHidden === null) {
          entry.element.removeAttribute("aria-hidden");
        } else {
          entry.element.setAttribute("aria-hidden", entry.ariaHidden);
        }
      }
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) {
        requestAnimationFrame(() => previousFocus.focus());
      }
    };
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
    setFeedback("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const current = settings.data?.settings?.model;
    setSaving(true);
    setFeedback("");
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

      setFeedback("Route updated. New turns use this model path.");
      settings.reload();
      accounts.reload();
      refreshRuntime();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="route-control-title"
    >
      <div
        className="route-control-dialog content-card"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="route-control-header">
          <div>
            <span className="eyebrow">Conversation route</span>
            <h2 id="route-control-title">Switch the model path fast</h2>
            <p>
              This changes the desktop runtime route for new turns. It does not
              rewrite existing messages.
            </p>
          </div>
          <button
            aria-label="Close route controls"
            className="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
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
          <form className="route-control-form" onSubmit={save}>
            <div className="route-control-status">
              <Badge tone={readiness.tone}>
                {readiness.ready ? "Ready now" : "Needs setup"}
              </Badge>
              <strong>
                {asString(runtime?.provider, draft.provider)} ·{" "}
                {asString(runtime?.model, draft.model)}
              </strong>
              <small>{readiness.detail}</small>
            </div>

            <div className="route-provider-grid">
              {ROUTE_PROVIDER_OPTIONS.map((option) => {
                const summary = providerReadiness(option.id, linkedAccounts);
                const selected = draft.provider === option.id;
                return (
                  <button
                    aria-pressed={selected}
                    className={`route-provider-card ${selected ? "selected" : ""}`}
                    key={option.id}
                    onClick={() => chooseProvider(option.id)}
                    type="button"
                  >
                    <span>{option.eyebrow}</span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                    <i className={`route-provider-readiness ${summary.tone}`}>
                      {summary.ready ? "Ready" : "Manual"}
                    </i>
                  </button>
                );
              })}
            </div>

            <div className="field-grid">
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
              <label className="field-span">
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
              <Notice
                tone={feedback.startsWith("Route updated") ? "good" : "bad"}
              >
                {feedback}
              </Notice>
            ) : null}

            <div className="route-control-actions">
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
