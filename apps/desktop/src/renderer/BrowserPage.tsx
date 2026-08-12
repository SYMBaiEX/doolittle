import { type FormEvent, useMemo, useState } from "react";
import {
  type BrowserAction,
  type BrowserResult,
  buildBrowserResultViewModel,
} from "./browser-result-model";
import { BrowserResultPanel } from "./components/BrowserResultPanel";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asRecord,
  asString,
  Badge,
  desktopRequest,
  errorMessage,
  Notice,
  titleCase,
  useApiResource,
} from "./lib";
import "./browser.css";

type PreviewSize = "responsive" | "desktop" | "tablet" | "mobile";

interface BrowserStatusResponse {
  browser?: unknown;
}

type BrowserErrorField = "address" | "compare" | null;

function normalizeUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error("Enter a URL to preview.");
  const hasControlCharacter = Array.from(input).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  if (input.length > 4096 || hasControlCharacter) {
    throw new Error("Enter a valid URL shorter than 4,096 characters.");
  }
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(input)
    ? input
    : `http://${input}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS pages can be previewed.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials cannot be previewed.");
  }
  return parsed.toString();
}

export function isLocalPreviewUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function BrowserEmptyEvidence() {
  return (
    <p className="browser-result-empty">
      Evidence appears here after an inspect, capture, or analysis.
    </p>
  );
}

const ACTIONS: Array<{
  id: BrowserAction;
  label: string;
  detail: string;
}> = [
  { id: "inspect", label: "Inspect", detail: "DOM and page metadata" },
  { id: "capture", label: "Capture", detail: "Reusable evidence bundle" },
  { id: "screenshot", label: "Screenshot", detail: "Raster page artifact" },
  { id: "snapshot", label: "Snapshot", detail: "Readable page snapshot" },
  { id: "analyze", label: "Analyze", detail: "Model-backed review" },
];

export function BrowserPage({
  active,
  onSendToChat,
}: {
  active: boolean;
  onSendToChat?: (text: string) => void;
}) {
  const [address, setAddress] = useState("http://127.0.0.1:3000");
  const [currentUrl, setCurrentUrl] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [previewSize, setPreviewSize] = useState<PreviewSize>("responsive");
  const [compareUrl, setCompareUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<BrowserErrorField>(null);
  const [result, setResult] = useState<BrowserResult | null>(null);
  const status = useApiResource<BrowserStatusResponse>(
    active ? "/browser/status" : null,
    [active],
  );
  const statusRecord = asRecord(status.data?.browser);
  const embedded = currentUrl && isLocalPreviewUrl(currentUrl);
  const statusLabel =
    asString(statusRecord.mode) ||
    asString(statusRecord.captureMode) ||
    (status.loading ? "Checking" : "Available");
  const refreshStatus = () => {
    if (!active) return;
    status.reload();
  };
  const resultView = useMemo(
    () => (result ? buildBrowserResultViewModel(result) : null),
    [result],
  );
  const resultStatusMessage = useMemo(() => {
    if (busy) return `${titleCase(busy)} in progress.`;
    if (error) return `Browser error: ${error}`;
    if (result && resultView) {
      return `${result.title} ready. ${resultView.summary}.`;
    }
    return "Browser tool idle.";
  }, [busy, error, result, resultView]);

  const showUrl = (url: string, recordHistory = false) => {
    setAddress(url);
    setCurrentUrl(url);
    if (!recordHistory) return;
    setHistory((current) => {
      const prior = current.slice(0, historyIndex + 1);
      if (prior.at(-1) === url) return current;
      const next = [...prior, url].slice(-25);
      setHistoryIndex(next.length - 1);
      return next;
    });
  };

  const navigate = (event?: FormEvent) => {
    event?.preventDefault();
    if (!active) return;
    setError("");
    setErrorField(null);
    try {
      showUrl(normalizeUrl(address), true);
    } catch (navigationError) {
      setError(errorMessage(navigationError));
      setErrorField("address");
    }
  };

  const travelHistory = (direction: -1 | 1) => {
    if (!active) return;
    const nextIndex = historyIndex + direction;
    const nextUrl = history[nextIndex];
    if (!nextUrl) return;
    setHistoryIndex(nextIndex);
    showUrl(nextUrl);
  };

  const reloadPreview = () => {
    if (!active) return;
    setError("");
    setErrorField(null);
    try {
      const url = normalizeUrl(currentUrl || address);
      setCurrentUrl("");
      requestAnimationFrame(() => setCurrentUrl(url));
    } catch (navigationError) {
      setError(errorMessage(navigationError));
      setErrorField("address");
    }
  };

  const runAction = async (action: BrowserAction) => {
    if (!active) return;
    setError("");
    setErrorField(null);
    let url = "";
    try {
      url = normalizeUrl(currentUrl || address);
    } catch (validationError) {
      setError(errorMessage(validationError));
      setErrorField("address");
      return;
    }
    setBusy(action);
    try {
      const payload =
        action === "inspect"
          ? await desktopRequest<unknown>(
              `/browser/inspect?url=${encodeURIComponent(url)}`,
            )
          : await desktopRequest<unknown>(`/browser/${action}`, "POST", {
              url,
            });
      if (url !== currentUrl) showUrl(url, true);
      setResult({
        action,
        title: `${ACTIONS.find((entry) => entry.id === action)?.label ?? action} result`,
        payload,
      });
    } catch (actionError) {
      setError(errorMessage(actionError));
      setErrorField(null);
    } finally {
      setBusy("");
    }
  };

  const compare = async (analyze: boolean) => {
    if (!active) return;
    setError("");
    setErrorField(null);
    let leftUrl = "";
    let rightUrl = "";
    try {
      leftUrl = normalizeUrl(currentUrl || address);
    } catch (validationError) {
      setError(errorMessage(validationError));
      setErrorField("address");
      return;
    }
    try {
      rightUrl = normalizeUrl(compareUrl);
    } catch (validationError) {
      setError(errorMessage(validationError));
      setErrorField("compare");
      return;
    }
    const action = analyze ? "compare-analyze" : "compare";
    setBusy(action);
    try {
      const payload = await desktopRequest<unknown>(
        analyze ? "/browser/compare/analyze" : "/browser/compare",
        "POST",
        { leftUrl, rightUrl },
      );
      setResult({
        action,
        title: analyze ? "Comparison analysis" : "Comparison bundle",
        payload,
      });
    } catch (compareError) {
      setError(errorMessage(compareError));
      setErrorField(null);
    } finally {
      setBusy("");
    }
  };

  if (!active) {
    return (
      <div className="page browser-page">
        <header className="browser-header">
          <div>
            <span className="eyebrow">Build and verify</span>
            <h1>Browser &amp; preview</h1>
            <p>Preview localhost. Capture evidence from any URL.</p>
          </div>
          <div className="browser-status">
            <i className="offline" />
            <strong>Offline</strong>
            <button
              className="text-button"
              disabled
              onClick={refreshStatus}
              type="button"
            >
              Refresh
            </button>
          </div>
        </header>
        <OfflineRouteState>
          Browser preview and evidence capture are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </div>
    );
  }

  return (
    <div className="page browser-page">
      <div aria-live="polite" className="sr-only" role="status">
        {resultStatusMessage}
      </div>
      <header className="browser-header">
        <div>
          <span className="eyebrow">Build and verify</span>
          <h1>Browser & preview</h1>
          <p>Preview localhost. Capture evidence from any URL.</p>
        </div>
        <div className="browser-status">
          <i className={status.error ? "offline" : ""} />
          <strong>{status.error ? "Unavailable" : statusLabel}</strong>
          <button
            className="text-button"
            disabled={!active}
            onClick={refreshStatus}
            type="button"
          >
            Refresh
          </button>
        </div>
      </header>

      <form className="browser-address" onSubmit={navigate}>
        <button
          aria-label="Go back"
          disabled={historyIndex <= 0}
          onClick={() => travelHistory(-1)}
          type="button"
        >
          ←
        </button>
        <button
          aria-label="Go forward"
          disabled={historyIndex < 0 || historyIndex >= history.length - 1}
          onClick={() => travelHistory(1)}
          type="button"
        >
          →
        </button>
        <button
          aria-label="Reload preview"
          disabled={!currentUrl}
          onClick={reloadPreview}
          type="button"
        >
          ↻
        </button>
        <span aria-hidden="true">{embedded ? "●" : "◇"}</span>
        <input
          aria-describedby={
            error && errorField === "address" ? "browser-url-error" : undefined
          }
          aria-invalid={errorField === "address" ? true : undefined}
          aria-label="Preview URL"
          id="browser-address-input"
          onChange={(event) => {
            setAddress(event.target.value);
            if (errorField === "address") {
              setError("");
              setErrorField(null);
            }
          }}
          placeholder="http://127.0.0.1:3000"
          spellCheck={false}
          value={address}
        />
        <button className="browser-go" disabled={!active} type="submit">
          Open
        </button>
      </form>

      {error ? (
        <Notice tone="bad">
          <span id="browser-url-error">{error}</span>
        </Notice>
      ) : null}

      <div className="browser-workspace">
        <section className="browser-canvas">
          <div className="browser-canvas-toolbar">
            <div>
              <span className="browser-traffic red" />
              <span className="browser-traffic yellow" />
              <span className="browser-traffic green" />
            </div>
            <span>{currentUrl || "No preview loaded"}</span>
            <label className="browser-viewport">
              <span className="sr-only">Preview size</span>
              <select
                aria-label="Preview size"
                onChange={(event) =>
                  setPreviewSize(event.target.value as PreviewSize)
                }
                value={previewSize}
              >
                <option value="responsive">Fit</option>
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
                <option value="mobile">Mobile</option>
              </select>
            </label>
            <Badge tone={embedded ? "good" : "neutral"}>
              {embedded ? "Live localhost" : "Capture mode"}
            </Badge>
          </div>
          {embedded ? (
            <div className={`browser-frame-stage ${previewSize}`}>
              <iframe
                key={currentUrl}
                referrerPolicy="no-referrer"
                sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
                src={currentUrl}
                title="Local application preview"
              />
            </div>
          ) : (
            <div className="browser-placeholder">
              <span aria-hidden="true">⌁</span>
              <h2>
                {currentUrl
                  ? "External pages open as evidence"
                  : "Open a localhost app"}
              </h2>
              <p>
                {currentUrl
                  ? "For safety, remote sites are inspected through Doolittle’s browser service instead of being embedded."
                  : "Start your development server, enter its local URL, and preview it inside the coding workspace."}
              </p>
              {currentUrl ? (
                <button
                  className="primary-button"
                  disabled={!active || Boolean(busy)}
                  onClick={() => void runAction("capture")}
                  type="button"
                >
                  {busy === "capture" ? "Capturing…" : "Capture page"}
                </button>
              ) : null}
            </div>
          )}
        </section>

        <aside className="browser-tools">
          <div className="browser-tools-heading">
            <div>
              <span className="eyebrow">Evidence lab</span>
              <h2>Inspect this build</h2>
            </div>
            {result ? (
              <button
                aria-label="Clear browser result"
                className="text-button"
                onClick={() => {
                  setResult(null);
                }}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="browser-actions">
            {ACTIONS.map((action) => (
              <button
                aria-label={`${action.label}: ${action.detail}`}
                disabled={!active || Boolean(busy)}
                key={action.id}
                onClick={() => void runAction(action.id)}
                title={action.detail}
                type="button"
              >
                <span>{action.label}</span>
                <i>{busy === action.id ? "…" : "↗"}</i>
              </button>
            ))}
          </div>

          <details className="browser-compare">
            <summary>
              <span>Compare versions</span>
              <small>Optional</small>
            </summary>
            <div className="browser-compare-body">
              <label>
                Compare with
                <input
                  aria-describedby={
                    error && errorField === "compare"
                      ? "browser-url-error"
                      : undefined
                  }
                  aria-invalid={errorField === "compare" ? true : undefined}
                  onChange={(event) => {
                    setCompareUrl(event.target.value);
                    if (errorField === "compare") {
                      setError("");
                      setErrorField(null);
                    }
                  }}
                  placeholder="https://staging.example.com"
                  spellCheck={false}
                  value={compareUrl}
                />
              </label>
              <div className="browser-compare-actions">
                <button
                  className="secondary-button"
                  disabled={!active || Boolean(busy) || !compareUrl.trim()}
                  onClick={() => void compare(false)}
                  type="button"
                >
                  {busy === "compare" ? "Comparing…" : "Compare"}
                </button>
                <button
                  className="secondary-button"
                  disabled={!active || Boolean(busy) || !compareUrl.trim()}
                  onClick={() => void compare(true)}
                  type="button"
                >
                  {busy === "compare-analyze" ? "Analyzing…" : "AI review"}
                </button>
              </div>
            </div>
          </details>

          {result ? (
            <BrowserResultPanel
              address={address}
              currentUrl={currentUrl}
              onError={(message) => {
                setError(message);
                setErrorField(null);
              }}
              onSendToChat={onSendToChat}
              previewSize={previewSize}
              result={result}
            />
          ) : (
            <BrowserEmptyEvidence />
          )}
        </aside>
      </div>
    </div>
  );
}
