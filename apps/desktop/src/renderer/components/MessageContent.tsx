import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { StatusBadge } from "@elizaos/ui/components/ui/status-badge";
import { Activity, ChevronRight, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { Streamdown, type UrlTransform } from "streamdown";
import "streamdown/styles.css";
import {
  MESSAGE_AGENT_STEPS_CLASS,
  MESSAGE_RESPONSE_CLASS,
  MESSAGE_TOOL_BODY_CLASS,
  MESSAGE_TOOL_CARD_CLASS,
  MESSAGE_TOOL_CARD_SUMMARY_CLASS,
  MESSAGE_TOOL_GROUP_CLASS,
  MESSAGE_TOOL_PAYLOAD_CLASS,
  MESSAGE_TOOL_SECTION_CLASS,
  MESSAGE_TOOL_SECTION_HEADING_CLASS,
  MESSAGE_TOOL_STATE_CLASS,
  MESSAGE_TOOL_SUMMARY_CLASS,
} from "./message-content-layout";
import {
  formatToolPayload,
  type ParsedAgentMessage,
  parseAgentMessage,
  type ToolActivity,
  type ToolActivityStatus,
  webSearchResults,
} from "./message-output";
import { UiIcon } from "./UiIcon";

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
    <section className={MESSAGE_TOOL_SECTION_CLASS}>
      <div className={MESSAGE_TOOL_SECTION_HEADING_CLASS}>
        <span>{label}</span>
        {payload.clipped ? <small>First 40k characters</small> : null}
      </div>
      <pre className={MESSAGE_TOOL_PAYLOAD_CLASS}>
        <code>{payload.text}</code>
      </pre>
    </section>
  );
}

function WebSearchSources({ activity }: { activity: ToolActivity }) {
  const results = webSearchResults(activity.output);
  if (!results.length) return null;
  return (
    <section className={MESSAGE_TOOL_SECTION_CLASS}>
      <div className={MESSAGE_TOOL_SECTION_HEADING_CLASS}>
        <span>Sources</span>
        <small>{results.length} found</small>
      </div>
      <ol className="m-0 grid list-none gap-1.5 p-0">
        {results.slice(0, 10).map((result) => (
          <li
            className="rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_76%,transparent)] px-2.25 py-2"
            key={result.url}
          >
            <a
              className="flex items-baseline justify-between gap-3 text-[var(--text-soft)] no-underline hover:[&>strong]:text-[var(--accent)]"
              href={result.url}
              rel="noreferrer"
              target="_blank"
            >
              <strong>{result.title}</strong>
              <span className="shrink-0 font-mono text-[length:var(--text-meta)] text-[var(--faint)]">
                {new URL(result.url).hostname}
              </span>
            </a>
            {result.excerpt ? (
              <p className="mt-1.25 mb-0 line-clamp-3 overflow-hidden text-[length:var(--text-meta)] leading-normal text-[var(--muted)]">
                {result.excerpt.slice(0, 360)}
              </p>
            ) : null}
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
    <details
      className={MESSAGE_TOOL_CARD_CLASS}
      data-tool-card="true"
      data-tool-status={activity.status}
    >
      <summary className={MESSAGE_TOOL_CARD_SUMMARY_CLASS}>
        <UiIcon className="text-[var(--accent)]" icon={Wrench} size="xs" />
        <span className="flex min-w-0 items-baseline gap-1.25">
          <strong className="truncate text-[length:var(--text-meta)] font-semibold text-[var(--text-soft)]">
            {toolLabel(activity)}
          </strong>
          {summary ? (
            <>
              <i
                aria-hidden="true"
                className="shrink-0 font-mono text-[length:var(--text-meta)] not-italic text-[var(--faint)]"
              >
                ·
              </i>
              <small
                className="min-w-0 flex-1 truncate font-mono text-[length:var(--text-meta)] text-[var(--faint)]"
                title={summary}
              >
                {summary}
              </small>
            </>
          ) : null}
        </span>
        <StatusBadge
          className={`${MESSAGE_TOOL_STATE_CLASS} max-[760px]:text-[0]`}
          label={statusLabel(activity.status)}
          status={statusVariant(activity.status)}
          pulse={activity.status === "running"}
          withDot
        />
        <UiIcon
          className="text-[var(--faint)] transition-transform group-open:rotate-90 motion-reduce:transition-none"
          icon={ChevronRight}
          size="xs"
        />
      </summary>
      <div className={MESSAGE_TOOL_BODY_CLASS}>
        {activity.error ? (
          <p className="my-2.25 border-[var(--danger)] border-l-2 bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] px-2.5 py-2 text-[11px] text-[color-mix(in_srgb,var(--danger)_82%,var(--text))]">
            {activity.error}
          </p>
        ) : null}
        <ToolPayload label="Input" value={activity.input} />
        <WebSearchSources activity={activity} />
        <ToolPayload label="Raw output" value={activity.output} />
        {activity.output !== undefined ? (
          <footer className="flex justify-end pt-2.25">
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
    <details
      className={MESSAGE_TOOL_GROUP_CLASS}
      data-tool-group="true"
      data-tool-status={status}
    >
      <summary className={MESSAGE_TOOL_SUMMARY_CLASS}>
        <span
          className={`${MESSAGE_TOOL_STATE_CLASS} ${
            status === "error"
              ? "text-[var(--danger)]"
              : status === "running"
                ? "text-[var(--accent)]"
                : "text-[var(--success)]"
          }`}
        >
          <i
            aria-hidden="true"
            className={`size-1.25 rounded-full bg-current ${
              status === "running"
                ? "animate-pulse motion-reduce:animate-none"
                : ""
            }`}
          />
          Activity
        </span>
        <span className="truncate text-[length:var(--text-meta)] text-[var(--text-soft)]">
          {tools.map(toolLabel).join(" · ")}
        </span>
        <span className="whitespace-nowrap font-mono text-[length:var(--text-meta)] text-[var(--faint)] max-[760px]:hidden">
          {state} · {tools.length}
        </span>
        <UiIcon
          className="text-[var(--faint)] transition-transform group-open:rotate-90 motion-reduce:transition-none"
          icon={ChevronRight}
          size="xs"
        />
      </summary>
      <div className="grid max-h-45 gap-0.5 overflow-auto border-[var(--border)] border-t p-0.75 [scrollbar-gutter:stable]">
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
    <details className={MESSAGE_AGENT_STEPS_CLASS}>
      <summary className="grid min-h-6 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.25 px-0.75 py-0.5 font-mono text-[length:var(--text-meta)] [&::-webkit-details-marker]:hidden">
        <UiIcon className="text-[var(--faint)]" icon={Activity} size="xs" />
        <strong className="font-medium text-[var(--muted)]">
          Run diagnostics
        </strong>
        <small className="text-[var(--faint)]">
          {failed} {failed === 1 ? "issue" : "issues"}
        </small>
        <UiIcon
          className="text-[var(--faint)] transition-transform group-open:rotate-90 motion-reduce:transition-none"
          icon={ChevronRight}
          size="xs"
        />
      </summary>
      <div className="max-h-42.5 overflow-auto pt-0.25 pr-1.5 pb-2.25 pl-5.75 text-[10px] leading-[1.55] text-[var(--muted)] [&>p]:my-1 [&>small]:mt-1.75 [&>small]:block [&>small]:text-[var(--faint)]">
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
    <PagePanel
      className="min-w-0 !space-y-0 !bg-transparent !p-0"
      data-message-content="true"
    >
      {parsed.text ? (
        <Streamdown
          animated={pending ? { animation: "fadeIn", duration: 120 } : false}
          caret="block"
          className={MESSAGE_RESPONSE_CLASS}
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
        <p data-message-content-state="empty">
          <span className="thinking">Empty</span>
        </p>
      ) : null}
      {parsed.tools.length > 0 ? (
        <section aria-label="Agent tool activity" className="mt-0.5 grid">
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
