import { Activity, ChevronRight } from "lucide-react";
import { memo, useMemo } from "react";
import { MessageMarkdown } from "./message-markdown";
import { type ParsedAgentMessage, parseAgentMessage } from "./message-output";
import { ToolActivityGroup } from "./ToolActivityGroup";
import { UiIcon } from "./UiIcon";
import "./message-content.css";

interface MessageContentProps {
  content: string | ParsedAgentMessage;
  pending?: boolean;
  separateAgentEvents?: boolean;
}

export { safeMessageUrl } from "./message-markdown";

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
        <MessageMarkdown pending={pending} text={parsed.text} />
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
