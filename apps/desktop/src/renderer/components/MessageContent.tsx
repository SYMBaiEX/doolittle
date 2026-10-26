import { type ContextAction, ContextActionMenu } from "@doolittle/ui";
import { Button } from "@elizaos/ui/components/ui/button";
import { StatusBadge } from "@elizaos/ui/components/ui/status-badge";
import {
  Activity,
  Check,
  ChevronRight,
  LoaderCircle,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import {
  type ComponentProps,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown, type UrlTransform } from "streamdown";
import {
  MESSAGE_AGENT_STEPS_CLASS,
  MESSAGE_RESPONSE_CLASS,
  MESSAGE_TOOL_BODY_CLASS,
  MESSAGE_TOOL_GROUP_CLASS,
  MESSAGE_TOOL_LIST_CLASS,
  MESSAGE_TOOL_PAYLOAD_CLASS,
  MESSAGE_TOOL_ROW_CLASS,
  MESSAGE_TOOL_ROW_SELECTED_CLASS,
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

function safeImageUrl(url: string): string | null {
  if (!/^https?:\/\//iu.test(url.trim())) return null;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname
      ? url
      : null;
  } catch {
    return null;
  }
}

export const safeMessageUrl: UrlTransform = (url, key) =>
  key === "src"
    ? safeImageUrl(url)
    : safeProtocol(url, ["http", "https", "mailto"])
      ? url
      : null;

function MessageImage({
  alt,
  src,
  title,
  width,
  height,
}: ComponentProps<"img"> & { node?: unknown }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safeSrc = typeof src === "string" ? safeImageUrl(src) : null;
  if (!safeSrc || failedSrc === safeSrc) {
    return (
      <span data-message-image-unavailable="true">
        {alt?.trim() || "Image unavailable"}
      </span>
    );
  }
  return (
    <img
      alt={alt ?? ""}
      height={height}
      loading="lazy"
      onError={() => setFailedSrc(safeSrc)}
      referrerPolicy="no-referrer"
      src={safeSrc}
      title={title}
      width={width}
    />
  );
}

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
            className="border-b border-[var(--border)] py-2 last:border-0"
            key={result.url}
          >
            <a
              className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[var(--text-soft)] no-underline hover:[&>strong]:text-[var(--accent)]"
              href={result.url}
              rel="noreferrer"
              target="_blank"
            >
              <strong className="min-w-0 [overflow-wrap:anywhere]">
                {result.title}
              </strong>
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

function ToolActivityGroup({
  pending,
  tools,
}: {
  pending: boolean;
  tools: ToolActivity[];
}) {
  // Follow live activity until the user explicitly inspects a step. New tools
  // must not replace a payload they are reading or selecting text within.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(pending);
  useEffect(
    () => () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (pending) setExpanded(true);
  }, [pending]);
  const selected =
    tools.find((activity) => activity.id === selectedId) ?? tools.at(-1);
  const copyLabel =
    copyState?.id === selected?.id ? copyState?.label : "Copy output";
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
      ? failed === 1 && tools.length === 1
        ? "Failed"
        : `${failed} failed · ${tools.length} steps`
      : active > 0
        ? active === 1 && tools.length === 1
          ? "Running"
          : `${active} running · ${tools.length} steps`
        : pending
          ? "Working"
          : tools.length === 1
            ? "Completed"
            : `${tools.length} steps complete`;
  const latestTool = tools.at(-1);
  const latestSummary = latestTool ? toolSummary(latestTool) : undefined;
  const activitySummary = latestTool
    ? `${tools.length > 1 ? `${tools.length} steps · ` : ""}${toolLabel(latestTool)}`
    : "Agent activity";
  const copyOutput = async (activity = selected) => {
    const value = formatToolPayload(activity?.output);
    if (!activity || !value) return;
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    if (!navigator.clipboard?.writeText) {
      setCopyState({ id: activity.id, label: "Copy unavailable" });
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyState({ id: activity.id, label: "Copied" });
    } catch {
      setCopyState({ id: activity.id, label: "Copy failed" });
    }
    copyTimer.current = setTimeout(() => setCopyState(null), 1_500);
  };
  const activityActions = (activity = selected): ContextAction[] => [
    {
      id: "toggle",
      label: expanded ? "Collapse tool activity" : "Expand tool activity",
      onSelect: () => setExpanded(!expanded),
    },
    {
      id: "copy-output",
      label: "Copy tool output",
      disabled:
        !formatToolPayload(activity?.output) ||
        typeof navigator === "undefined" ||
        !navigator.clipboard?.writeText,
      onSelect: () => void copyOutput(activity),
    },
  ];

  return (
    <ContextActionMenu
      label="Tool activity actions"
      scopeKey={selected?.id}
      items={activityActions()}
    >
      <details
        className={MESSAGE_TOOL_GROUP_CLASS}
        data-tool-group="true"
        data-tool-status={status}
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className={MESSAGE_TOOL_SUMMARY_CLASS}>
          <UiIcon
            className={
              status === "error"
                ? "text-[var(--danger)]"
                : "text-[var(--muted)]"
            }
            icon={Activity}
            size="sm"
          />
          <strong className="text-[length:var(--text-meta)] font-semibold text-[var(--text-soft)] max-[560px]:sr-only">
            Activity
          </strong>
          <span className="flex min-w-0 items-baseline gap-1.25">
            <span
              className="truncate text-[length:var(--text-meta)] text-[var(--text-soft)]"
              title={activitySummary}
            >
              {activitySummary}
            </span>
            {latestSummary ? (
              <small
                className="min-w-0 truncate font-mono text-[length:var(--text-meta)] text-[var(--faint)] max-[760px]:hidden"
                title={latestSummary}
              >
                · {latestSummary}
              </small>
            ) : null}
          </span>
          <StatusBadge
            className={`${MESSAGE_TOOL_STATE_CLASS} max-[760px]:text-[0]`}
            label={state}
            status={statusVariant(status)}
            pulse={status === "running"}
            withDot
          />
          <UiIcon
            className="text-[var(--faint)] transition-transform group-open:rotate-90 motion-reduce:transition-none"
            icon={ChevronRight}
            size="xs"
          />
        </summary>
        <ol className={MESSAGE_TOOL_LIST_CLASS} aria-label="Tool steps">
          {tools.map((activity) => {
            const target = toolSummary(activity);
            return (
              <li key={activity.id}>
                <ContextActionMenu
                  label={`Tool actions for ${toolLabel(activity)}`}
                  scopeKey={activity.id}
                  items={activityActions(activity)}
                >
                  <button
                    aria-pressed={selected?.id === activity.id}
                    className={`${MESSAGE_TOOL_ROW_CLASS} ${selected?.id === activity.id ? MESSAGE_TOOL_ROW_SELECTED_CLASS : ""}`}
                    data-tool-card="true"
                    data-tool-status={activity.status}
                    onClick={() => setSelectedId(activity.id)}
                    type="button"
                  >
                    <UiIcon
                      className={`${activity.status === "error" ? "text-[var(--danger)]" : activity.status === "completed" ? "text-[var(--success)]" : "text-[var(--accent)]"} ${activity.status === "running" ? "animate-spin motion-reduce:animate-none" : ""}`}
                      icon={
                        activity.status === "completed"
                          ? Check
                          : activity.status === "running"
                            ? LoaderCircle
                            : activity.status === "error"
                              ? TriangleAlert
                              : Wrench
                      }
                      size="xs"
                    />
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <strong className="min-w-0 [overflow-wrap:anywhere] text-[length:var(--text-control)] font-medium text-inherit">
                        {toolLabel(activity)}
                      </strong>
                      {target ? (
                        <small
                          className="min-w-0 truncate font-mono text-[length:var(--text-meta)] text-[var(--faint)]"
                          title={target}
                        >
                          {target}
                        </small>
                      ) : null}
                    </span>
                    <span
                      className={`text-[length:var(--text-meta)] ${activity.status === "error" ? "text-[var(--danger)]" : activity.status === "running" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
                    >
                      {statusLabel(activity.status)}
                    </span>
                  </button>
                </ContextActionMenu>
              </li>
            );
          })}
        </ol>
        {selected ? (
          <div className={MESSAGE_TOOL_BODY_CLASS} data-tool-detail="true">
            {selected.error ? (
              <p className="my-1.5 border-[var(--danger)] border-l-2 bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] px-2 py-1.5 text-[length:var(--text-meta)] text-[color-mix(in_srgb,var(--danger)_82%,var(--text))]">
                {selected.error}
              </p>
            ) : null}
            <ToolPayload label="Input" value={selected.input} />
            <WebSearchSources activity={selected} />
            <ToolPayload label="Output" value={selected.output} />
            {selected.output !== undefined ? (
              <footer className="flex justify-end pt-1.5">
                <Button
                  aria-live="polite"
                  disabled={!formatToolPayload(selected.output)}
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
        ) : null}
      </details>
    </ContextActionMenu>
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
      <summary className="grid min-h-10 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.25 px-0.75 py-1 text-[length:var(--text-control)] [&::-webkit-details-marker]:hidden max-[760px]:min-h-11">
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
      <div className="max-h-42.5 overflow-auto py-2 pl-6 pr-2 text-[length:var(--text-control)] leading-[1.55] text-[var(--muted)] [&>p]:my-1 [&>small]:mt-2 [&>small]:block">
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
    <div className="min-w-0" data-message-content="true">
      {parsed.text ? (
        <Streamdown
          animated={false}
          caret="block"
          className={MESSAGE_RESPONSE_CLASS}
          components={{ img: MessageImage }}
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
          <span className="thinking">
            {pending ? "Working…" : "No response text was returned."}
          </span>
        </p>
      ) : null}
      {parsed.tools.length > 0 ? (
        <section aria-label="Agent tool activity" className="mt-0.5 grid">
          <ToolActivityGroup pending={pending} tools={parsed.tools} />
        </section>
      ) : null}
      <AgentSteps {...parsed.steps} />
    </div>
  );
}
