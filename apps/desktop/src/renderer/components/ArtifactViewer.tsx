import { Button } from "@elizaos/ui/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { desktopRequest, errorMessage, Notice } from "../lib";
import { UiIcon } from "./UiIcon";

type ArtifactKind =
  | "diff"
  | "markdown"
  | "json"
  | "text"
  | "png"
  | "html"
  | "audio";

interface ArtifactPayload {
  artifact: {
    runId: string;
    index: number;
    name: string;
    kind: ArtifactKind;
    mimeType: string;
    sizeBytes: number;
  };
  encoding: "utf8" | "base64";
  content: string;
}

export const ARTIFACT_IMAGE_CANVAS_CLASS =
  "mx-auto block max-h-[560px] w-[min(100%,960px)] border border-[var(--canvas-border)] bg-[var(--canvas-bg)] object-contain";

export const ARTIFACT_TEXT_CANVAS_CLASS =
  "m-0 max-h-[420px] overflow-auto rounded-[2px] border border-[var(--canvas-border)] bg-[var(--canvas-bg)] p-[11px] text-[10px] leading-[1.55] whitespace-pre-wrap text-[var(--canvas-text-soft)]";

function compactBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function artifactName(value: unknown, index: number): string {
  if (typeof value === "string") {
    return (
      value
        .split(/[/\\]+/u)
        .filter(Boolean)
        .at(-1) ?? `Artifact ${index + 1}`
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return `Artifact ${index + 1}`;
}

function artifactIndex(value: unknown, fallback: number): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const index = (value as { index?: unknown }).index;
    if (
      typeof index === "number" &&
      Number.isSafeInteger(index) &&
      index >= 0
    ) {
      return index;
    }
  }
  return fallback;
}

function artifactUrl(payload: ArtifactPayload): string {
  return `data:${payload.artifact.mimeType};base64,${payload.content}`;
}

function ArtifactBody({ payload }: { payload: ArtifactPayload }) {
  if (payload.artifact.kind === "png" && payload.encoding === "base64") {
    return (
      <img
        alt={`Generated artifact ${payload.artifact.name}`}
        className={ARTIFACT_IMAGE_CANVAS_CLASS}
        src={artifactUrl(payload)}
      />
    );
  }
  if (payload.artifact.kind === "audio" && payload.encoding === "base64") {
    return (
      // Generated audio can be speech, music, or effects; the current artifact
      // contract has no truthful caption track to attach.
      // biome-ignore lint/a11y/useMediaCaption: no caption payload exists
      <audio
        aria-label={`Generated artifact ${payload.artifact.name}`}
        className="w-full"
        controls
        src={artifactUrl(payload)}
      />
    );
  }
  if (payload.artifact.kind === "html" && payload.encoding === "utf8") {
    const lockedDocument = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><meta name="referrer" content="no-referrer">${payload.content}`;
    return (
      <iframe
        className="min-h-[420px] w-full border border-[var(--border)] bg-[var(--canvas-bg)]"
        sandbox=""
        srcDoc={lockedDocument}
        title={`Generated HTML artifact ${payload.artifact.name}`}
      />
    );
  }
  return (
    <pre
      className={`${ARTIFACT_TEXT_CANVAS_CLASS} ${
        payload.artifact.kind === "diff" ? "border-l-[var(--accent)]" : ""
      }`}
    >
      <code>{payload.content}</code>
    </pre>
  );
}

function ArtifactItem({
  index,
  label,
  runId,
}: {
  index: number;
  label: string;
  runId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<ArtifactPayload | null>(null);

  const toggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (payload || loading) return;
    setError("");
    setLoading(true);
    try {
      setPayload(
        await desktopRequest<ArtifactPayload>(
          `/codegen/runs/${encodeURIComponent(runId)}/artifacts/${index}`,
        ),
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <article
      className={`overflow-hidden rounded-[var(--radius-xs,3px)] border bg-[var(--surface-soft)] ${
        expanded
          ? "border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]"
          : "border-[var(--border)]"
      }`}
    >
      <Button
        aria-expanded={expanded}
        className="grid min-h-[46px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[9px] rounded-none border-0 bg-transparent px-[9px] py-[7px] text-left text-[var(--text-soft)] shadow-none hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        onClick={() => void toggle()}
        type="button"
        variant="ghost"
      >
        <span className="grid size-5 place-items-center rounded-[2px] border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
          <UiIcon icon={expanded ? ChevronDown : ChevronRight} size="xs" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
            {payload?.artifact.name ?? label}
          </strong>
          <small className="overflow-hidden font-[var(--font-mono)] text-[length:var(--text-meta,10px)] text-ellipsis whitespace-nowrap text-[var(--muted)]">
            {payload
              ? `${payload.artifact.kind} · ${compactBytes(
                  payload.artifact.sizeBytes,
                )}`
              : `Artifact ${index + 1}`}
          </small>
        </span>
        <span className="font-[var(--font-mono)] text-[length:var(--text-meta,10px)] not-italic tracking-[0.06em] text-[var(--accent)] uppercase">
          {expanded ? "Close" : "Open"}
        </span>
      </Button>
      {expanded ? (
        <div className="grid gap-2 border-t border-[var(--border)] p-[9px]">
          {loading ? (
            <div
              aria-live="polite"
              className="p-[18px] text-center text-[11px] text-[var(--muted)]"
              role="status"
            >
              Loading secure artifact…
            </div>
          ) : error ? (
            <Notice tone="bad">{error}</Notice>
          ) : payload ? (
            <>
              <div className="flex min-w-0 items-center justify-between gap-2.5 font-[var(--font-mono)] text-[length:var(--text-meta,10px)] text-[var(--muted)]">
                <span>{payload.artifact.mimeType}</span>
                <code className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--faint)]">
                  {payload.artifact.runId} · {payload.artifact.index}
                </code>
              </div>
              <ArtifactBody payload={payload} />
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ArtifactViewer({
  artifacts,
  runId,
}: {
  artifacts: unknown[];
  runId: string;
}) {
  if (!runId || artifacts.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      {artifacts.map((artifact, index) => (
        <ArtifactItem
          index={artifactIndex(artifact, index)}
          key={`${runId}:${artifactIndex(artifact, index)}`}
          label={artifactName(artifact, index)}
          runId={runId}
        />
      ))}
    </div>
  );
}
