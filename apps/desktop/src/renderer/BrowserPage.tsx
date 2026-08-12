import type { BrowserPreviewSize } from "./browser/browser-navigation";
import {
  BROWSER_ACTIONS,
  useBrowserWorkspace,
} from "./browser/useBrowserWorkspace";
import { BrowserResultPanel } from "./components/BrowserResultPanel";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { Badge, Notice } from "./lib";
import "./browser.css";

export { isLocalPreviewUrl } from "./browser/browser-navigation";

export function BrowserEmptyEvidence() {
  return (
    <p className="browser-result-empty">
      Evidence appears here after an inspect, capture, or analysis.
    </p>
  );
}

export function BrowserPage({
  active,
  onSendToChat,
}: {
  active: boolean;
  onSendToChat?: (text: string) => void;
}) {
  const browser = useBrowserWorkspace(active);
  const {
    address,
    busy,
    canGoBack,
    canGoForward,
    clearResult,
    compare,
    compareUrl,
    currentUrl,
    embedded,
    error,
    errorField,
    fail,
    navigate,
    previewSize,
    reloadPreview,
    result,
    resultStatusMessage,
    runAction,
    setPreviewSize,
    status,
    statusLabel,
    travelHistory,
    updateAddress,
    updateCompareUrl,
  } = browser;
  const refreshStatus = () => {
    if (active) status.reload();
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

      <form
        className="browser-address"
        onSubmit={(event) => {
          event.preventDefault();
          navigate();
        }}
      >
        <button
          aria-label="Go back"
          disabled={!canGoBack}
          onClick={() => travelHistory(-1)}
          type="button"
        >
          ←
        </button>
        <button
          aria-label="Go forward"
          disabled={!canGoForward}
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
          onChange={(event) => updateAddress(event.target.value)}
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
                  setPreviewSize(event.target.value as BrowserPreviewSize)
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
                onClick={clearResult}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="browser-actions">
            {BROWSER_ACTIONS.map((action) => (
              <button
                aria-label={`${action.label}: ${action.detail}`}
                className={
                  action.id === "analyze" ? "browser-action-analyze" : undefined
                }
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
                  onChange={(event) => updateCompareUrl(event.target.value)}
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
              onError={(message) => fail(message)}
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
