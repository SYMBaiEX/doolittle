import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { StatusBadge } from "@elizaos/ui/components/ui/status-badge";
import { useMemo, useState } from "react";
import { Streamdown, type UrlTransform } from "streamdown";
import "streamdown/styles.css";
import {
  formatToolPayload,
  type ParsedAgentMessage,
  parseAgentMessage,
  type ToolActivity,
  type ToolActivityStatus,
  webSearchResults,
} from "./message-output";
import "./message-content.css";

interface MessageContentProps {
  content: string;
  pending?: boolean;
  parsedAgentMessage?: ParsedAgentMessage;
  separateAgentEvents?: boolean;
}

const MAX_TOOL_PAYLOAD_LENGTH = 40_000;

function safeProtocol(value: string, protocols: string[]): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("#") ||
    protocols.some((protocol) => normalized.startsWith(`${protocol}:`))
  );
}

export const safeMessageUrl: UrlTransform = (url, key) => {
  const protocols =
    key === "src" ? ["http", "https"] : ["http", "https", "mailto"];
  return safeProtocol(url, protocols) ? url : null;
};

function statusLabel(status: ToolActivityStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "error":
      return "Failed";
    case "running":
      return "Running";
    default:
      return "Pending";
  }
}

function statusVariant(status: ToolActivityStatus) {
  switch (status) {
    case "completed":
      return "success";
    case "error":
      return "danger";
    case "running":
      return "processing";
    default:
      return "muted";
  }
}

function toolLabel(activity: ToolActivity): string {
  const normalized = activity.name.replace(/[_-]+/gu, " ").trim();
  return normalized
    ? normalized
        .toLowerCase()
        .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase())
    : "Agent tool";
}

function toolSummary(activity: ToolActivity): string | undefined {
  if (typeof activity.input === "string") {
    return activity.input.trim() || undefined;
  }
  if (!activity.input || typeof activity.input !== "object") return undefined;
  const input = activity.input as Record<string, unknown>;
  for (const key of [
    "query",
    "path",
    "filePath",
    "command",
    "url",
    "workingDirectory",
  ]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function clippedPayload(value: unknown): { text: string; clipped: boolean } {
  const text = formatToolPayload(value);
  if (text.length <= MAX_TOOL_PAYLOAD_LENGTH) return { text, clipped: false };
  return {
    text: `${text.slice(0, MAX_TOOL_PAYLOAD_LENGTH)}\n\n… output truncated in chat`,
    clipped: true,
  };
}

function ToolPayload({ label, value }: { label: string; value: unknown }) {
  const payload = clippedPayload(value);
  if (!payload.text) return null;
  return (
    <section className="message-tool-section">
      <div className="message-tool-section__heading">
        <span>{label}</span>
        {payload.clipped ? <small>First 40k characters</small> : null}
      </div>
      <pre>
        <code>{payload.text}</code>
      </pre>
    </section>
  );
}

function WebSearchSources({ activity }: { activity: ToolActivity }) {
  const results = webSearchResults(activity.output);
  if (!results.length) return null;
  return (
    <section className="message-tool-section message-tool-sources">
      <div className="message-tool-section__heading">
        <span>Sources</span>
        <small>{results.length} found</small>
      </div>
      <ol>
        {results.slice(0, 10).map((result) => (
          <li key={result.url}>
            <a href={result.url} rel="noreferrer" target="_blank">
              <strong>{result.title}</strong>
              <span>{new URL(result.url).hostname}</span>
            </a>
            {result.excerpt ? <p>{result.excerpt.slice(0, 360)}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ToolActivityCard({ activity }: { activity: ToolActivity }) {
  const [copyLabel, setCopyLabel] = useState("Copy");
  const summary = toolSummary(activity);
  const copyOutput = async () => {
    const value = formatToolPayload(activity.output);
    if (!value || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyLabel("Copied");
    } catch {
      setCopyLabel("Copy failed");
    }
    window.setTimeout(() => setCopyLabel("Copy"), 1_500);
  };

  return (
    <details className={`message-tool-card is-${activity.status}`}>
      <summary>
        <span className="message-tool-card__icon" aria-hidden="true">
          ↗
        </span>
        <span className="message-tool-card__summary">
          <strong>{toolLabel(activity)}</strong>
          {summary ? (
            <>
              <i aria-hidden="true">·</i>
              <small title={summary}>{summary}</small>
            </>
          ) : null}
        </span>
        <StatusBadge
          className={`message-tool-card__status is-${activity.status}`}
          label={statusLabel(activity.status)}
          status={statusVariant(activity.status)}
          pulse={activity.status === "running"}
          withDot
        />
        <span className="message-tool-card__chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="message-tool-card__body">
        {activity.error ? (
          <p className="message-tool-card__error">{activity.error}</p>
        ) : null}
        <ToolPayload label="Input" value={activity.input} />
        <WebSearchSources activity={activity} />
        <ToolPayload label="Raw output" value={activity.output} />
        {activity.output !== undefined ? (
          <footer>
            <Button
              onClick={() => void copyOutput()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {copyLabel}
            </Button>
          </footer>
        ) : null}
      </div>
    </details>
  );
}

function ToolActivityGroup({
  pending,
  tools,
}: {
  pending: boolean;
  tools: ToolActivity[];
}) {
  const completed = tools.filter(
    (activity) => activity.status === "completed",
  ).length;
  const failed = tools.filter((activity) => activity.status === "error").length;
  const active = tools.length - completed - failed;
  const status =
    failed > 0
      ? "error"
      : active > 0 || pending
        ? "running"
        : ("completed" as const);
  const state =
    failed > 0
      ? `${failed} failed`
      : active > 0
        ? `${active} active`
        : pending
          ? "Working"
          : "Completed";

  return (
    <details className={`message-tool-group is-${status}`}>
      <summary>
        <span className={`message-tool-group__state is-${status}`}>
          <i aria-hidden="true" />
          Activity
        </span>
        <span className="message-tool-group__preview">
          {tools.map(toolLabel).join(" · ")}
        </span>
        <span className="message-tool-group__count">
          {state} · {tools.length}
        </span>
        <span className="message-tool-group__chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="message-tool-group__body">
        {tools.map((activity) => (
          <ToolActivityCard activity={activity} key={activity.id} />
        ))}
      </div>
    </details>
  );
}

function AgentSteps({
  continued,
  failed,
  finished,
}: {
  continued: number;
  failed: number;
  finished: number;
}) {
  if (!failed) return null;
  return (
    <details className="message-agent-steps">
      <summary>
        <span aria-hidden="true">⌁</span>
        <strong>Run diagnostics</strong>
        <small>
          {failed} {failed === 1 ? "issue" : "issues"}
        </small>
        <i aria-hidden="true">›</i>
      </summary>
      <div>
        {continued > 0 ? (
          <p>
            The evaluator requested another step before a final response was
            available.
          </p>
        ) : null}
        {finished > 0 ? <p>{finished} completion signal recorded.</p> : null}
        {failed > 0 ? <p>{failed} evaluation failure recorded.</p> : null}
        <small>
          Internal reasoning is intentionally not displayed. Open Activity for
          full operator telemetry.
        </small>
      </div>
    </details>
  );
}

export function MessageContent({
  content,
  pending = false,
  parsedAgentMessage,
  separateAgentEvents = false,
}: MessageContentProps) {
  const parsed = useMemo(
    () =>
      parsedAgentMessage ??
      (separateAgentEvents
        ? parseAgentMessage(content)
        : {
            text: content,
            tools: [],
            steps: { continued: 0, failed: 0, finished: 0 },
          }),
    [content, parsedAgentMessage, separateAgentEvents],
  );
  const hasActivity =
    parsed.tools.length > 0 ||
    parsed.steps.continued + parsed.steps.failed + parsed.steps.finished > 0;

  return (
    <PagePanel className="message-content">
      {parsed.text ? (
        <Streamdown
          animated={pending ? { animation: "fadeIn", duration: 120 } : false}
          caret="block"
          className="message-content__response"
          controls={{
            code: { copy: true, download: false },
            table: { copy: true, download: false, fullscreen: false },
          }}
          dir="auto"
          isAnimating={pending}
          lineNumbers={false}
          linkSafety={{ enabled: true }}
          mode={pending ? "streaming" : "static"}
          normalizeHtmlIndentation
          urlTransform={safeMessageUrl}
        >
          {parsed.text}
        </Streamdown>
      ) : !hasActivity ? (
        <p className="message-content__empty">
          <span className="thinking">Empty</span>
        </p>
      ) : null}
      {parsed.tools.length > 0 ? (
        <section
          aria-label="Agent tool activity"
          className="message-tool-activity"
        >
          {parsed.tools.length === 1 ? (
            <ToolActivityCard activity={parsed.tools[0]} />
          ) : (
            <ToolActivityGroup pending={pending} tools={parsed.tools} />
          )}
        </section>
      ) : null}
      <AgentSteps {...parsed.steps} />
    </PagePanel>
  );
}
