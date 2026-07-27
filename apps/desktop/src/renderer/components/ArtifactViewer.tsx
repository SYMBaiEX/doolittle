import { useState } from "react";
import { desktopRequest, errorMessage, Notice } from "../lib";
import "../artifact-viewer.css";

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
        className="artifact-viewer-image"
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
        className="artifact-viewer-audio"
        controls
        src={artifactUrl(payload)}
      />
    );
  }
  if (payload.artifact.kind === "html" && payload.encoding === "utf8") {
    const lockedDocument = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><meta name="referrer" content="no-referrer">${payload.content}`;
    return (
      <iframe
        className="artifact-viewer-frame"
        sandbox=""
        srcDoc={lockedDocument}
        title={`Generated HTML artifact ${payload.artifact.name}`}
      />
    );
  }
  return (
    <pre className={`artifact-viewer-text ${payload.artifact.kind}`}>
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
    <article className={`artifact-viewer-item ${expanded ? "open" : ""}`}>
      <button
        aria-expanded={expanded}
        className="artifact-viewer-trigger"
        onClick={() => void toggle()}
        type="button"
      >
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        <span>
          <strong>{payload?.artifact.name ?? label}</strong>
          <small>
            {payload
              ? `${payload.artifact.kind} · ${compactBytes(
                  payload.artifact.sizeBytes,
                )}`
              : `Artifact ${index + 1}`}
          </small>
        </span>
        <i>{expanded ? "Close" : "Open"}</i>
      </button>
      {expanded ? (
        <div className="artifact-viewer-content">
          {loading ? (
            <div
              aria-live="polite"
              className="artifact-viewer-loading"
              role="status"
            >
              Loading secure artifact…
            </div>
          ) : error ? (
            <Notice tone="bad">{error}</Notice>
          ) : payload ? (
            <>
              <div className="artifact-viewer-meta">
                <span>{payload.artifact.mimeType}</span>
                <code>
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
    <div className="artifact-viewer">
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
