import { useMemo, useState } from "react";
import {
  BROWSER_FEEDBACK_COMMENT_LIMIT,
  compileBrowserEvidenceContext,
} from "../browser-feedback";
import {
  type BrowserResult,
  buildBrowserResultViewModel,
} from "../browser-result-model";
import { Badge, errorMessage } from "../lib";

interface BrowserResultPanelProps {
  address: string;
  currentUrl: string;
  onError: (message: string) => void;
  onSendToChat?: (text: string) => void;
  previewSize: string;
  result: BrowserResult;
}

export function BrowserResultPanel({
  address,
  currentUrl,
  onError,
  onSendToChat,
  previewSize,
  result,
}: BrowserResultPanelProps) {
  const [comment, setComment] = useState("");
  const [selector, setSelector] = useState("");
  const [region, setRegion] = useState("");
  const [viewportNote, setViewportNote] = useState("");
  const [sentResult, setSentResult] = useState<BrowserResult | null>(null);
  const sent = sentResult === result;
  const resultView = useMemo(
    () => buildBrowserResultViewModel(result),
    [result],
  );
  const viewport = viewportNote.trim()
    ? `${previewSize} · ${viewportNote.trim()}`
    : previewSize;
  const evidenceContext = useMemo(
    () =>
      compileBrowserEvidenceContext({
        result,
        url: currentUrl || address,
        viewport,
        comment,
        selector,
        region,
      }),
    [address, comment, currentUrl, region, result, selector, viewport],
  );
  const capture =
    resultView.cards.find((card) => card.label === "Capture")?.value ??
    "Structured receipt";
  const updateEvidence = (update: (value: string) => void, value: string) => {
    update(value);
    setSentResult(null);
  };

  return (
    <div className="browser-result">
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
              <figure className="browser-result-preview" key={preview.src}>
                <img alt={preview.label} loading="lazy" src={preview.src} />
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
          The active thread receives only this bounded context. Capture mode and
          artifacts travel with your note.
        </p>
        <label>
          Operator note
          <textarea
            maxLength={BROWSER_FEEDBACK_COMMENT_LIMIT}
            onChange={(event) => updateEvidence(setComment, event.target.value)}
            placeholder="What should the agent verify or change?"
            value={comment}
          />
        </label>
        <details className="browser-evidence-targets">
          <summary>Target a selector, region, or viewport</summary>
          <div>
            <label>
              Selector (optional)
              <input
                onChange={(event) =>
                  updateEvidence(setSelector, event.target.value)
                }
                placeholder="#checkout-button"
                value={selector}
              />
            </label>
            <label>
              Region (optional)
              <input
                onChange={(event) =>
                  updateEvidence(setRegion, event.target.value)
                }
                placeholder="Hero CTA"
                value={region}
              />
            </label>
            <label>
              Viewport note (optional)
              <input
                onChange={(event) =>
                  updateEvidence(setViewportNote, event.target.value)
                }
                placeholder="390 × 844, logged in"
                value={viewportNote}
              />
            </label>
          </div>
        </details>
        <div className="browser-evidence-summary">
          <span>URL</span>
          <code>{currentUrl || address}</code>
          <span>Viewport</span>
          <code>{viewport}</code>
          <span>Capture</span>
          <code>{capture}</code>
        </div>
        <details className="browser-evidence-preview">
          <summary>Preview exact context for thread</summary>
          <pre>{evidenceContext}</pre>
        </details>
        <div className="browser-evidence-send">
          <span>
            {sent
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
                setSentResult(result);
              } catch (handoffError) {
                onError(errorMessage(handoffError));
                setSentResult(null);
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
          {resultView.rawTruncated ? "\n\nRaw payload truncated." : ""}
        </pre>
      </details>
    </div>
  );
}
