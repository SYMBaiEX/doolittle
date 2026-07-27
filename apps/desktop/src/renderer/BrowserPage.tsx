import { type FormEvent, useMemo, useState } from "react";
import {
  BROWSER_FEEDBACK_COMMENT_LIMIT,
  compileBrowserEvidenceContext,
} from "./browser-feedback";
import {
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  errorMessage,
  Notice,
  titleCase,
  useApiResource,
} from "./lib";
import "./browser.css";

type BrowserAction =
  | "inspect"
  | "capture"
  | "screenshot"
  | "snapshot"
  | "analyze";
type PreviewSize = "responsive" | "desktop" | "tablet" | "mobile";

interface BrowserStatusResponse {
  browser?: unknown;
}

interface BrowserResult {
  action: BrowserAction | "compare" | "compare-analyze";
  title: string;
  payload: unknown;
}

type BrowserErrorField = "address" | "compare" | null;

interface ResultCard {
  label: string;
  value: string;
  detail?: string;
}

interface ResultArtifact {
  label: string;
  value: string;
}

interface ResultPreview {
  label: string;
  src: string;
}

interface ResultViewModel {
  cards: ResultCard[];
  artifacts: ResultArtifact[];
  previews: ResultPreview[];
  responseText: string;
  responseTruncated: boolean;
  rawText: string;
  rawTruncated: boolean;
  summary: string;
}

const RAW_RESULT_LIMIT = 12_000;
const RESPONSE_PREVIEW_LIMIT = 1_600;
const IMAGE_PATH_PATTERN =
  /\.(?:apng|avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/iu;

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

function canEmbed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function readableResult(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readableResultSlice(
  value: unknown,
  maxCharacters: number,
): { text: string; truncated: boolean } {
  const text = readableResult(value);
  if (text.length <= maxCharacters) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxCharacters).trimEnd()}\n…`,
    truncated: true,
  };
}

function compactValue(value: string, maxLength = 84): string {
  if (value.length <= maxLength) return value;
  const prefix = Math.max(18, Math.floor((maxLength - 1) / 2));
  const suffix = Math.max(12, maxLength - prefix - 1);
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}

function formatCount(label: string, value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString()} ${label}`
    : null;
}

function formatDelta(label: string, value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value === 0) return `0 ${label}`;
  return `${value > 0 ? "+" : ""}${value.toLocaleString()} ${label}`;
}

function safeImageSource(value: string): string | null {
  if (value.startsWith("data:image/")) return value;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return IMAGE_PATH_PATTERN.test(parsed.pathname) ? value : null;
  } catch {
    return null;
  }
}

function isArtifactLike(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.startsWith("data:image/") ||
    /^https?:\/\//iu.test(value)
  );
}

function collectPreviewSources(
  value: unknown,
  trail: string[] = [],
  previews: ResultPreview[] = [],
  seen = new Set<string>(),
  depth = 0,
): ResultPreview[] {
  if (depth > 5) return previews;
  if (typeof value === "string") {
    const preview = safeImageSource(value);
    const key = trail.at(-1) ?? "preview";
    if (preview && !seen.has(preview)) {
      seen.add(preview);
      previews.push({ label: titleCase(key), src: preview });
    }
    return previews;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) {
      collectPreviewSources(entry, trail, previews, seen, depth + 1);
    }
    return previews;
  }
  const record = asRecord(value);
  for (const [key, entry] of Object.entries(record).slice(0, 24)) {
    collectPreviewSources(entry, [...trail, key], previews, seen, depth + 1);
  }
  return previews;
}

function buildResultViewModel(result: BrowserResult): ResultViewModel {
  const payload = asRecord(result.payload);
  const inspection = asRecord(payload.inspection);
  const capture = asRecord(payload.capture);
  const analysis = asRecord(payload.analysis);
  const comparison =
    asRecord(payload.comparison).left || asRecord(payload.comparison).right
      ? asRecord(payload.comparison)
      : asRecord(analysis.comparison);
  const primaryBundle =
    Object.keys(capture).length > 0
      ? capture
      : Object.keys(asRecord(analysis.capture)).length > 0
        ? asRecord(analysis.capture)
        : inspection;
  const primaryPage = asRecord(primaryBundle.page);
  const responseText = asString(payload.response);
  const cards: ResultCard[] = [];
  const artifacts: ResultArtifact[] = [];
  const previews = collectPreviewSources(result.payload);
  const artifactKeys = new Set<string>();

  const pushCard = (label: string, value: string | null, detail?: string) => {
    if (!value) return;
    cards.push({ label, value, detail });
  };

  const pushArtifact = (label: string, value: unknown) => {
    if (typeof value !== "string" || !value.trim() || !isArtifactLike(value)) {
      return;
    }
    const key = `${label}:${value}`;
    if (artifactKeys.has(key)) return;
    artifactKeys.add(key);
    artifacts.push({ label, value });
  };

  if (primaryPage.title || primaryPage.url) {
    pushCard(
      "Page",
      asString(primaryPage.title) ||
        compactValue(asString(primaryPage.url), 60),
      asString(primaryPage.url)
        ? compactValue(asString(primaryPage.url), 88)
        : undefined,
    );
  }

  if (primaryPage.provider || primaryPage.mode) {
    pushCard(
      "Renderer",
      [asString(primaryPage.provider), asString(primaryPage.mode)]
        .filter(Boolean)
        .join(" · "),
      displayTimestamp(asString(primaryPage.renderedAt)),
    );
  }

  const contentSummary = [
    typeof primaryPage.contentLength === "number"
      ? `${primaryPage.contentLength.toLocaleString()} chars`
      : null,
    formatCount("lines", primaryPage.lineCount),
  ]
    .filter(Boolean)
    .join(" · ");
  pushCard(
    "Document",
    asString(primaryPage.contentType) || null,
    contentSummary || undefined,
  );

  const structureSummary = [
    formatCount("links", primaryPage.linkCount),
    formatCount("images", primaryPage.imageCount),
    formatCount("headings", primaryPage.headingCount),
  ]
    .filter(Boolean)
    .join(" · ");
  pushCard(
    "Structure",
    formatCount("words", primaryPage.wordCount),
    structureSummary || undefined,
  );

  if (primaryBundle.captureMode || asRecord(primaryBundle.status).captureMode) {
    const status = asRecord(primaryBundle.status);
    pushCard(
      "Capture",
      titleCase(
        asString(primaryBundle.captureMode) || asString(status.captureMode),
      ),
      typeof status.captureReady === "boolean"
        ? status.captureReady
          ? "Capture-ready backend"
          : "Placeholder capture backend"
        : undefined,
    );
  }

  if (Object.keys(analysis).length > 0) {
    const highlights = Array.isArray(analysis.highlights)
      ? analysis.highlights.length
      : 0;
    pushCard(
      "Analysis",
      titleCase(asString(analysis.focus) || "browser"),
      highlights > 0
        ? `${highlights.toLocaleString()} highlight${highlights === 1 ? "" : "s"}`
        : undefined,
    );
  }

  if (responseText) {
    pushCard(
      "Model response",
      `${responseText.length.toLocaleString()} chars`,
      compactValue(responseText.replace(/\s+/gu, " "), 88),
    );
  }

  if (Object.keys(comparison).length > 0) {
    const summary = asRecord(comparison.summary);
    const left = asRecord(comparison.left);
    const right = asRecord(comparison.right);
    const leftPage = asRecord(left.page);
    const rightPage = asRecord(right.page);
    pushCard(
      "Compare left",
      compactValue(asString(leftPage.title) || asString(leftPage.url), 60) ||
        null,
      asString(leftPage.url)
        ? compactValue(asString(leftPage.url), 88)
        : undefined,
    );
    pushCard(
      "Compare right",
      compactValue(asString(rightPage.title) || asString(rightPage.url), 60) ||
        null,
      asString(rightPage.url)
        ? compactValue(asString(rightPage.url), 88)
        : undefined,
    );
    pushCard(
      "Diff",
      summary.hashChanged ? "Content changed" : "Content matched",
      [
        typeof summary.titleChanged === "boolean"
          ? summary.titleChanged
            ? "title changed"
            : "title stable"
          : null,
        formatDelta("words", summary.wordDelta),
        formatDelta("links", summary.linkDelta),
        formatDelta("images", summary.imageDelta),
        formatDelta("headings", summary.headingDelta),
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    );
  }

  pushArtifact(
    result.action === "snapshot" ? "Snapshot path" : "Artifact path",
    payload.path,
  );

  const collectBundleArtifacts = (
    label: string,
    bundle: Record<string, unknown>,
  ) => {
    if (Object.keys(bundle).length === 0) return;
    pushArtifact(`${label} snapshot`, bundle.snapshotPath);
    pushArtifact(`${label} screenshot`, bundle.screenshotPath);
    pushArtifact(`${label} screenshot SVG`, bundle.screenshotSvgPath);
    pushArtifact(`${label} manifest`, bundle.manifestPath);
    pushArtifact(`${label} report`, bundle.reportPath);
  };

  collectBundleArtifacts("Inspection", inspection);
  collectBundleArtifacts("Capture", capture);
  collectBundleArtifacts("Analysis", asRecord(analysis.capture));
  pushArtifact("Comparison manifest", comparison.manifestPath);
  pushArtifact("Comparison report", comparison.reportPath);
  collectBundleArtifacts("Left capture", asRecord(comparison.left));
  collectBundleArtifacts("Right capture", asRecord(comparison.right));

  const raw = readableResultSlice(result.payload, RAW_RESULT_LIMIT);
  const responsePreview = readableResultSlice(
    responseText,
    RESPONSE_PREVIEW_LIMIT,
  );
  const summaryParts = [
    cards.length
      ? `${cards.length} detail${cards.length === 1 ? "" : "s"}`
      : null,
    artifacts.length
      ? `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}`
      : null,
    previews.length
      ? `${previews.length} preview${previews.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return {
    cards,
    artifacts,
    previews,
    responseText: responseText ? responsePreview.text : "",
    responseTruncated: responseText ? responsePreview.truncated : false,
    rawText: raw.text,
    rawTruncated: raw.truncated,
    summary: summaryParts.join(" · ") || "Structured payload captured",
  };
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
  const [evidenceComment, setEvidenceComment] = useState("");
  const [evidenceSelector, setEvidenceSelector] = useState("");
  const [evidenceRegion, setEvidenceRegion] = useState("");
  const [evidenceViewportNote, setEvidenceViewportNote] = useState("");
  const [evidenceSent, setEvidenceSent] = useState(false);
  const status = useApiResource<BrowserStatusResponse>(
    active ? "/browser/status" : null,
    [active],
  );
  const statusRecord = asRecord(status.data?.browser);
  const embedded = currentUrl && canEmbed(currentUrl);
  const statusLabel =
    asString(statusRecord.mode) ||
    asString(statusRecord.captureMode) ||
    (status.loading ? "Checking" : "Available");
  const resultView = useMemo(
    () => (result ? buildResultViewModel(result) : null),
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
  const evidenceContext = useMemo(
    () =>
      result
        ? compileBrowserEvidenceContext({
            result,
            url: currentUrl || address,
            viewport: evidenceViewportNote.trim()
              ? `${previewSize} · ${evidenceViewportNote.trim()}`
              : previewSize,
            comment: evidenceComment,
            selector: evidenceSelector,
            region: evidenceRegion,
          })
        : "",
    [
      address,
      currentUrl,
      evidenceComment,
      evidenceRegion,
      evidenceSelector,
      evidenceViewportNote,
      previewSize,
      result,
    ],
  );

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
    const nextIndex = historyIndex + direction;
    const nextUrl = history[nextIndex];
    if (!nextUrl) return;
    setHistoryIndex(nextIndex);
    showUrl(nextUrl);
  };

  const reloadPreview = () => {
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
      setEvidenceSent(false);
    } catch (actionError) {
      setError(errorMessage(actionError));
      setErrorField(null);
    } finally {
      setBusy("");
    }
  };

  const compare = async (analyze: boolean) => {
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
      setEvidenceSent(false);
    } catch (compareError) {
      setError(errorMessage(compareError));
      setErrorField(null);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page browser-page">
      <div aria-live="polite" className="sr-only" role="status">
        {resultStatusMessage}
      </div>
      <header className="browser-header">
        <div>
          <span className="eyebrow">Build and verify</span>
          <h1>Browser & preview</h1>
          <p>
            Run localhost previews and turn any page into inspectable,
            reviewable evidence.
          </p>
        </div>
        <div className="browser-status">
          <i className={status.error ? "offline" : ""} />
          <span>Browser service</span>
          <strong>{status.error ? "Unavailable" : statusLabel}</strong>
          <button
            className="text-button"
            disabled={!active}
            onClick={status.reload}
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
                sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"
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
                  setEvidenceSent(false);
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
                disabled={!active || Boolean(busy)}
                key={action.id}
                onClick={() => void runAction(action.id)}
                type="button"
              >
                <span>{action.label}</span>
                <small>{action.detail}</small>
                <i>{busy === action.id ? "…" : "↗"}</i>
              </button>
            ))}
          </div>

          <div className="browser-compare">
            <span className="eyebrow">Visual regression</span>
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
            <div>
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

          <div className="browser-result">
            {result && resultView ? (
              <>
                <div className="browser-result-heading">
                  <div>
                    <span className="eyebrow">{result.action}</span>
                    <h3>{result.title}</h3>
                  </div>
                  <Badge tone="good">{resultView.summary}</Badge>
                </div>

                {resultView.cards.length > 0 ? (
                  <div className="browser-result-cards">
                    {resultView.cards.map((card) => (
                      <article className="browser-result-card" key={card.label}>
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                        {card.detail ? <small>{card.detail}</small> : null}
                      </article>
                    ))}
                  </div>
                ) : null}

                {resultView.previews.length > 0 ? (
                  <section className="browser-result-section">
                    <div className="browser-result-section-heading">
                      <span className="eyebrow">Preview assets</span>
                      <strong>Safe image thumbnails</strong>
                    </div>
                    <div className="browser-result-previews">
                      {resultView.previews.map((preview) => (
                        <figure
                          className="browser-result-preview"
                          key={preview.src}
                        >
                          <img
                            alt={preview.label}
                            loading="lazy"
                            src={preview.src}
                          />
                          <figcaption>{preview.label}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </section>
                ) : null}

                {resultView.artifacts.length > 0 ? (
                  <section className="browser-result-section">
                    <div className="browser-result-section-heading">
                      <span className="eyebrow">Artifacts</span>
                      <strong>Captured paths and URLs</strong>
                    </div>
                    <div className="browser-result-artifacts">
                      {resultView.artifacts.map((artifact) => (
                        <article
                          className="browser-result-artifact"
                          key={`${artifact.label}:${artifact.value}`}
                        >
                          <span>{artifact.label}</span>
                          <code>{artifact.value}</code>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {resultView.responseText ? (
                  <section className="browser-result-section">
                    <div className="browser-result-section-heading">
                      <span className="eyebrow">Analysis response</span>
                      <strong>Model output preview</strong>
                    </div>
                    <pre className="browser-result-response">
                      {resultView.responseText}
                      {resultView.responseTruncated
                        ? "\n\nResponse preview truncated."
                        : ""}
                    </pre>
                  </section>
                ) : null}

                <section className="browser-evidence-composer">
                  <div className="browser-result-section-heading">
                    <span className="eyebrow">Thread handoff</span>
                    <strong>Send a reviewable browser receipt</strong>
                  </div>
                  <p>
                    The active thread receives only this bounded context.
                    Capture mode and artifacts travel with your note.
                  </p>
                  <label>
                    Operator note
                    <textarea
                      maxLength={BROWSER_FEEDBACK_COMMENT_LIMIT}
                      onChange={(event) => {
                        setEvidenceComment(event.target.value);
                        setEvidenceSent(false);
                      }}
                      placeholder="What should the agent verify or change?"
                      value={evidenceComment}
                    />
                  </label>
                  <div className="browser-evidence-targets">
                    <label>
                      Selector (optional)
                      <input
                        onChange={(event) => {
                          setEvidenceSelector(event.target.value);
                          setEvidenceSent(false);
                        }}
                        placeholder="#checkout-button"
                        value={evidenceSelector}
                      />
                    </label>
                    <label>
                      Region (optional)
                      <input
                        onChange={(event) => {
                          setEvidenceRegion(event.target.value);
                          setEvidenceSent(false);
                        }}
                        placeholder="Hero CTA"
                        value={evidenceRegion}
                      />
                    </label>
                    <label>
                      Viewport note (optional)
                      <input
                        onChange={(event) => {
                          setEvidenceViewportNote(event.target.value);
                          setEvidenceSent(false);
                        }}
                        placeholder="390 × 844, logged in"
                        value={evidenceViewportNote}
                      />
                    </label>
                  </div>
                  <div className="browser-evidence-summary">
                    <span>URL</span>
                    <code>{currentUrl || address}</code>
                    <span>Viewport</span>
                    <code>
                      {evidenceViewportNote.trim()
                        ? `${previewSize} · ${evidenceViewportNote.trim()}`
                        : previewSize}
                    </code>
                    <span>Capture</span>
                    <code>
                      {resultView.cards.find((card) => card.label === "Capture")
                        ?.value ?? "Structured receipt"}
                    </code>
                  </div>
                  <details className="browser-evidence-preview">
                    <summary>Preview exact context for thread</summary>
                    <pre>{evidenceContext}</pre>
                  </details>
                  <div className="browser-evidence-send">
                    <span>
                      {evidenceSent
                        ? "Sent to the active thread."
                        : onSendToChat
                          ? "Ready to hand off"
                          : "Thread handoff is unavailable."}
                    </span>
                    <button
                      className="primary-button"
                      disabled={!onSendToChat || !evidenceContext}
                      onClick={() => {
                        if (!onSendToChat || !evidenceContext) return;
                        try {
                          onSendToChat(evidenceContext);
                          setEvidenceSent(true);
                        } catch (handoffError) {
                          setError(errorMessage(handoffError));
                          setErrorField(null);
                          setEvidenceSent(false);
                        }
                      }}
                      type="button"
                    >
                      Send to thread
                    </button>
                  </div>
                </section>

                <details className="browser-result-raw">
                  <summary>Raw JSON fallback</summary>
                  <pre>
                    {resultView.rawText}
                    {resultView.rawTruncated
                      ? "\n\nRaw payload truncated."
                      : ""}
                  </pre>
                </details>
              </>
            ) : (
              <EmptyBlock title="No evidence yet">
                Inspect, capture, or analyze the current page to keep a bounded
                receipt.
              </EmptyBlock>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
