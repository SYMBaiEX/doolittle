import { Button } from "@elizaos/ui/components/ui/button";
import { useMemo, useState } from "react";
import {
  BROWSER_CODE_PREVIEW_CLASS,
  BROWSER_FIELD_CLASS,
  BROWSER_FIELD_CONTROL_CLASS,
  BROWSER_RESULT_CARD_CLASS,
  BROWSER_RESULT_HEADING_CLASS,
  BROWSER_RESULT_SECTION_CLASS,
} from "../browser/browser-layout";
import {
  BROWSER_FEEDBACK_COMMENT_LIMIT,
  compileBrowserEvidenceContext,
} from "../browser-feedback";
import {
  type BrowserResult,
  buildBrowserResultViewModel,
} from "../browser-result-model";
import { Badge, errorMessage } from "../lib";

export const BROWSER_RESULT_IMAGE_CANVAS_CLASS =
  "aspect-4/3 w-full rounded-[var(--radius-xs)] border border-[var(--canvas-border)] bg-[var(--canvas-bg)] object-cover";

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
    <div className="grid gap-2.5 p-3.5">
      <div className={BROWSER_RESULT_HEADING_CLASS}>
        <div>
          <span className="eyebrow">{result.action}</span>
          <h3 className="mt-1 mb-0 text-[13px]">{result.title}</h3>
        </div>
        <Badge tone="good">{resultView.summary}</Badge>
      </div>

      {resultView.cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 max-[1040px]:grid-cols-1">
          {resultView.cards.map((card) => (
            <article className={BROWSER_RESULT_CARD_CLASS} key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <small>{card.detail}</small> : null}
            </article>
          ))}
        </div>
      ) : null}

      {resultView.previews.length > 0 ? (
        <section className={BROWSER_RESULT_SECTION_CLASS}>
          <div className="grid gap-0.5 [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>span]:uppercase [&>strong]:text-xs [&>strong]:text-[var(--text)]">
            <span className="eyebrow">Preview assets</span>
            <strong>Safe image thumbnails</strong>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
            {resultView.previews.map((preview) => (
              <figure
                className="m-0 grid gap-1.5 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] p-2"
                key={preview.src}
              >
                <img
                  alt={preview.label}
                  className={BROWSER_RESULT_IMAGE_CANVAS_CLASS}
                  loading="lazy"
                  src={preview.src}
                />
                <figcaption className="truncate text-[10px] text-[var(--muted)]">
                  {preview.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {resultView.artifacts.length > 0 ? (
        <section className={BROWSER_RESULT_SECTION_CLASS}>
          <div className="grid gap-0.5 [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>span]:uppercase [&>strong]:text-xs [&>strong]:text-[var(--text)]">
            <span className="eyebrow">Artifacts</span>
            <strong>Captured paths and URLs</strong>
          </div>
          <div className="grid gap-2">
            {resultView.artifacts.map((artifact) => (
              <article
                className="grid gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-2.25 [&>code]:wrap-anywhere [&>code]:text-[10px] [&>code]:leading-normal [&>code]:text-[var(--text-soft)] [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>span]:uppercase"
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
        <section className={BROWSER_RESULT_SECTION_CLASS}>
          <div className="grid gap-0.5 [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>span]:uppercase [&>strong]:text-xs [&>strong]:text-[var(--text)]">
            <span className="eyebrow">Analysis response</span>
            <strong>Model output preview</strong>
          </div>
          <pre className={BROWSER_CODE_PREVIEW_CLASS}>
            {resultView.responseText}
            {resultView.responseTruncated
              ? "\n\nResponse preview truncated."
              : ""}
          </pre>
        </section>
      ) : null}

      <section className="grid gap-2.5 rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] p-3">
        <div className="grid gap-0.5 [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>span]:uppercase [&>strong]:text-xs [&>strong]:text-[var(--text)]">
          <span className="eyebrow">Thread handoff</span>
          <strong>Send a reviewable browser receipt</strong>
        </div>
        <p className="m-0 text-[10px] leading-normal text-[var(--muted)]">
          The active thread receives only this bounded context. Capture mode and
          artifacts travel with your note.
        </p>
        <label className={BROWSER_FIELD_CLASS}>
          Operator note
          <textarea
            maxLength={BROWSER_FEEDBACK_COMMENT_LIMIT}
            className={`${BROWSER_FIELD_CONTROL_CLASS} min-h-19 resize-y p-2`}
            onChange={(event) => updateEvidence(setComment, event.target.value)}
            placeholder="What should the agent verify or change?"
            value={comment}
          />
        </label>
        <details className="group grid gap-2">
          <summary className="cursor-pointer font-mono text-[10px] text-[var(--muted)] group-open:text-[var(--text-soft)]">
            Target a selector, region, or viewport
          </summary>
          <div className="grid grid-cols-2 gap-2 max-[780px]:grid-cols-1">
            <label className={BROWSER_FIELD_CLASS}>
              Selector (optional)
              <input
                onChange={(event) =>
                  updateEvidence(setSelector, event.target.value)
                }
                className={`${BROWSER_FIELD_CONTROL_CLASS} h-7.5 px-2`}
                placeholder="#checkout-button"
                value={selector}
              />
            </label>
            <label className={BROWSER_FIELD_CLASS}>
              Region (optional)
              <input
                onChange={(event) =>
                  updateEvidence(setRegion, event.target.value)
                }
                className={`${BROWSER_FIELD_CONTROL_CLASS} h-7.5 px-2`}
                placeholder="Hero CTA"
                value={region}
              />
            </label>
            <label
              className={`${BROWSER_FIELD_CLASS} col-span-2 max-[780px]:col-auto`}
            >
              Viewport note (optional)
              <input
                onChange={(event) =>
                  updateEvidence(setViewportNote, event.target.value)
                }
                className={`${BROWSER_FIELD_CONTROL_CLASS} h-7.5 px-2`}
                placeholder="390 × 844, logged in"
                value={viewportNote}
              />
            </label>
          </div>
        </details>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_58%,transparent)] p-2 [&>code]:truncate [&>code]:text-[10px] [&>code]:text-[var(--text-soft)] [&>span]:font-mono [&>span]:text-[9px] [&>span]:text-[var(--muted)] [&>span]:uppercase">
          <span>URL</span>
          <code>{currentUrl || address}</code>
          <span>Viewport</span>
          <code>{viewport}</code>
          <span>Capture</span>
          <code>{capture}</code>
        </div>
        <details className="group grid gap-1.75">
          <summary className="cursor-pointer font-mono text-[10px] text-[var(--muted)] group-open:text-[var(--text-soft)]">
            Preview exact context for thread
          </summary>
          <pre
            className={`${BROWSER_CODE_PREVIEW_CLASS} max-h-42.5 p-2.25 text-[9px]`}
          >
            {evidenceContext}
          </pre>
        </details>
        <div className="flex items-center justify-between gap-2.5">
          <span className="flex-1 text-[10px] leading-normal text-[var(--muted)]">
            {sent
              ? "Sent to the active thread."
              : onSendToChat
                ? "Ready to hand off"
                : "Thread handoff is unavailable."}
          </span>
          <Button
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
          </Button>
        </div>
      </section>

      <details className="group grid gap-2">
        <summary className="cursor-pointer font-mono text-[10px] text-[var(--muted)] uppercase group-open:text-[var(--text)]">
          Raw JSON fallback
        </summary>
        <pre className={BROWSER_CODE_PREVIEW_CLASS}>
          {resultView.rawText}
          {resultView.rawTruncated ? "\n\nRaw payload truncated." : ""}
        </pre>
      </details>
    </div>
  );
}
