import { Button } from "@elizaos/ui/components/ui/button";
import {
  BROWSER_ACTION_CLASS,
  BROWSER_ACTIONS_CLASS,
  BROWSER_ADDRESS_CLASS,
  BROWSER_ADDRESS_INPUT_CLASS,
  BROWSER_CANVAS_CLASS,
  BROWSER_CANVAS_TOOLBAR_CLASS,
  BROWSER_COMPARE_SUMMARY_CLASS,
  BROWSER_FRAME_STAGE_CLASS,
  BROWSER_HEADER_CLASS,
  BROWSER_NAV_BUTTON_CLASS,
  BROWSER_PAGE_CLASS,
  BROWSER_PLACEHOLDER_CLASS,
  BROWSER_PREVIEW_WIDTH_CLASS,
  BROWSER_STATUS_CLASS,
  BROWSER_TOOLS_CLASS,
  BROWSER_WORKSPACE_CLASS,
} from "./browser/browser-layout";
import type { BrowserPreviewSize } from "./browser/browser-navigation";
import {
  BROWSER_ACTIONS,
  useBrowserWorkspace,
} from "./browser/useBrowserWorkspace";
import { BrowserResultPanel } from "./components/BrowserResultPanel";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { Badge, Notice } from "./lib";

export { isLocalPreviewUrl } from "./browser/browser-navigation";

export function BrowserEmptyEvidence() {
  return (
    <p
      className="m-0 px-3.5 py-2.5 font-mono text-[length:var(--text-meta)] leading-[1.45] text-[var(--muted)]"
      data-browser-result-state="empty"
    >
      Evidence appears here after an inspect, capture, or analysis.
    </p>
  );
}

export function BrowserPage({
  active,
  onSendToChat,
}: {
  active: boolean;
  onSendToChat?: (text: string) => boolean | Promise<boolean>;
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
      <div className={BROWSER_PAGE_CLASS}>
        <header className={BROWSER_HEADER_CLASS}>
          <div>
            <span className="eyebrow">Build and verify</span>
            <h1>Browser &amp; preview</h1>
            <p>Preview localhost. Capture evidence from any URL.</p>
          </div>
          <div className={BROWSER_STATUS_CLASS}>
            <i className="size-1.75 rounded-full bg-[var(--bad)]" />
            <strong>Offline</strong>
            <Button
              disabled
              onClick={refreshStatus}
              size="sm"
              type="button"
              variant="ghost"
            >
              Refresh
            </Button>
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
    <div className={BROWSER_PAGE_CLASS}>
      <div aria-live="polite" className="sr-only" role="status">
        {resultStatusMessage}
      </div>
      <header className={BROWSER_HEADER_CLASS}>
        <div>
          <span className="eyebrow">Build and verify</span>
          <h1>Browser & preview</h1>
          <p>Preview localhost. Capture evidence from any URL.</p>
        </div>
        <div className={BROWSER_STATUS_CLASS}>
          <i
            className={`size-1.75 rounded-full ${
              status.error
                ? "bg-[var(--bad)]"
                : "bg-[var(--good)] shadow-[0_0_10px_color-mix(in_srgb,var(--good)_42%,transparent)]"
            }`}
          />
          <strong>{status.error ? "Unavailable" : statusLabel}</strong>
          <Button
            disabled={!active}
            onClick={refreshStatus}
            size="sm"
            type="button"
            variant="ghost"
          >
            Refresh
          </Button>
        </div>
      </header>

      <form
        className={BROWSER_ADDRESS_CLASS}
        onSubmit={(event) => {
          event.preventDefault();
          navigate();
        }}
      >
        <button
          aria-label="Go back"
          className={BROWSER_NAV_BUTTON_CLASS}
          disabled={!canGoBack}
          onClick={() => travelHistory(-1)}
          type="button"
        >
          ←
        </button>
        <button
          aria-label="Go forward"
          className={BROWSER_NAV_BUTTON_CLASS}
          disabled={!canGoForward}
          onClick={() => travelHistory(1)}
          type="button"
        >
          →
        </button>
        <button
          aria-label="Reload preview"
          className={BROWSER_NAV_BUTTON_CLASS}
          disabled={!currentUrl}
          onClick={reloadPreview}
          type="button"
        >
          ↻
        </button>
        <span
          aria-hidden="true"
          className="text-[length:var(--text-meta)] text-[var(--accent)]"
        >
          {embedded ? "●" : "◇"}
        </span>
        <input
          aria-describedby={
            error && errorField === "address" ? "browser-url-error" : undefined
          }
          aria-invalid={errorField === "address" ? true : undefined}
          aria-label="Preview URL"
          className={BROWSER_ADDRESS_INPUT_CLASS}
          id="browser-address-input"
          onChange={(event) => updateAddress(event.target.value)}
          placeholder="http://127.0.0.1:3000"
          spellCheck={false}
          value={address}
        />
        <Button disabled={!active} size="sm" type="submit">
          Open
        </Button>
      </form>

      {error ? (
        <Notice tone="bad">
          <span id="browser-url-error">{error}</span>
        </Notice>
      ) : null}

      <div className={BROWSER_WORKSPACE_CLASS}>
        <section className={BROWSER_CANVAS_CLASS}>
          <div className={BROWSER_CANVAS_TOOLBAR_CLASS}>
            <div>
              <span className="size-2 rounded-full bg-[#ff5d56]" />
              <span className="size-2 rounded-full bg-[#ffbd2e]" />
              <span className="size-2 rounded-full bg-[#27c840]" />
            </div>
            <span>{currentUrl || "No preview loaded"}</span>
            <label>
              <span className="sr-only">Preview size</span>
              <select
                aria-label="Preview size"
                className="h-6.5 border-[var(--border)] bg-[var(--surface-soft)] py-0.75 pr-6 pl-1.75 font-mono text-[10px] text-[var(--text-soft)]"
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
            <div
              className={`${BROWSER_FRAME_STAGE_CLASS} ${BROWSER_PREVIEW_WIDTH_CLASS[previewSize]}`}
              data-browser-preview-size={previewSize}
            >
              <iframe
                key={currentUrl}
                referrerPolicy="no-referrer"
                sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
                src={currentUrl}
                title="Local application preview"
              />
            </div>
          ) : (
            <div className={BROWSER_PLACEHOLDER_CLASS}>
              <span
                aria-hidden="true"
                className="grid size-8.5 place-items-center rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[var(--accent-soft)] text-base text-[var(--accent)]"
              >
                ⌁
              </span>
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
                <Button
                  disabled={!active || Boolean(busy)}
                  onClick={() => void runAction("capture")}
                  type="button"
                >
                  {busy === "capture" ? "Capturing…" : "Capture page"}
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <aside className={BROWSER_TOOLS_CLASS}>
          <div className="flex items-start justify-between gap-3 border-[var(--border)] border-b p-3.5 [&_h2]:mt-1 [&_h2]:mb-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm">
            <div>
              <span className="eyebrow">Evidence lab</span>
              <h2>Inspect this build</h2>
            </div>
            {result ? (
              <Button
                aria-label="Clear browser result"
                onClick={clearResult}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            ) : null}
          </div>

          <div className={BROWSER_ACTIONS_CLASS}>
            {BROWSER_ACTIONS.map((action) => (
              <button
                aria-label={`${action.label}: ${action.detail}`}
                className={`${BROWSER_ACTION_CLASS} ${
                  action.id === "analyze"
                    ? "col-span-full border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-soft))]"
                    : ""
                }`}
                data-browser-action={action.id}
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

          <details className="group border-[var(--border)] border-b">
            <summary className={BROWSER_COMPARE_SUMMARY_CLASS}>
              <span>Compare versions</span>
              <small>Optional</small>
            </summary>
            <div className="grid gap-2 px-3.5 pb-3.5">
              <label className="grid gap-1.25 font-mono text-[10px] text-[var(--muted)]">
                Compare with
                <input
                  aria-describedby={
                    error && errorField === "compare"
                      ? "browser-url-error"
                      : undefined
                  }
                  aria-invalid={errorField === "compare" ? true : undefined}
                  className="h-8.75 rounded-[var(--radius-xs)] px-2.25 font-mono text-[10px]"
                  onChange={(event) => updateCompareUrl(event.target.value)}
                  placeholder="https://staging.example.com"
                  spellCheck={false}
                  value={compareUrl}
                />
              </label>
              <div className="flex gap-1.5">
                <Button
                  disabled={!active || Boolean(busy) || !compareUrl.trim()}
                  onClick={() => void compare(false)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {busy === "compare" ? "Comparing…" : "Compare"}
                </Button>
                <Button
                  disabled={!active || Boolean(busy) || !compareUrl.trim()}
                  onClick={() => void compare(true)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {busy === "compare-analyze" ? "Analyzing…" : "AI review"}
                </Button>
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
