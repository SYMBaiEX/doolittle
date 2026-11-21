import { Activity, ChevronRight } from "lucide-react";
import { type ComponentProps, memo, useMemo, useState } from "react";
import {
  Streamdown,
  type StreamdownProps,
  type UrlTransform,
} from "streamdown";
import { MessageMarkdownCode } from "./MessageCodeBlock";
import {
  type ParsedAgentMessage,
  parseAgentMessage,
  safeHttpMessageUrl,
} from "./message-output";
import { ToolActivityGroup } from "./ToolActivityGroup";
import { UiIcon } from "./UiIcon";
import "./message-content.css";

interface MessageContentProps {
  content: string | ParsedAgentMessage;
  pending?: boolean;
  separateAgentEvents?: boolean;
}

export const safeMessageUrl: UrlTransform = (url, key) =>
  key === "src"
    ? safeHttpMessageUrl(url)
    : /^(?:#|https?:|mailto:)/iu.test(url.trim())
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
  const safeSrc = typeof src === "string" ? safeHttpMessageUrl(src) : null;
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

const MARKDOWN_COMPONENTS: StreamdownProps["components"] = {
  code: MessageMarkdownCode,
  img: MessageImage,
};
const MARKDOWN_CONTROLS: StreamdownProps["controls"] = {
  code: false,
  table: { copy: true, download: false, fullscreen: false },
};
const MARKDOWN_LINK_SAFETY = { enabled: true };

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
    <details className="group mt-0.5 border-[var(--border)] border-t text-[var(--muted)]">
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
        <small>Open Activity for the full run timeline.</small>
      </div>
    </details>
  );
}

export const MessageContent = memo(function MessageContent({
  content,
  pending = false,
  separateAgentEvents = false,
}: MessageContentProps) {
  const parsed = useMemo(
    () =>
      typeof content !== "string"
        ? content
        : separateAgentEvents
          ? parseAgentMessage(content)
          : {
              text: content,
              tools: [],
              steps: { continued: 0, failed: 0, finished: 0 },
            },
    [content, separateAgentEvents],
  );
  const hasActivity =
    parsed.tools.length > 0 ||
    parsed.steps.continued + parsed.steps.failed + parsed.steps.finished > 0;

  return (
    <div className="min-w-0" data-message-content="true">
      {parsed.text ? (
        <Streamdown
          animated={false}
          caret="circle"
          className="chat-message-prose"
          components={MARKDOWN_COMPONENTS}
          controls={MARKDOWN_CONTROLS}
          dir="auto"
          isAnimating={pending}
          linkSafety={MARKDOWN_LINK_SAFETY}
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
});
