import { ListFilter, ScrollText } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { WorkbenchEmpty } from "../components/workbench/Workbench";
import { Badge, displayTimestamp, ErrorBlock, LoadingBlock } from "../lib";
import { logEntryTone, type RuntimeLogEntry } from "../log-viewer-mapping";
import "./runtime-log-stream.css";

export function RuntimeLogStream({
  className = "",
  entries,
  error,
  filtered,
  filters,
  loading,
  onRetry,
  focusedLogId,
  focusRequestId,
  summary,
}: {
  className?: string;
  entries: RuntimeLogEntry[];
  error?: string;
  filtered: boolean;
  filters?: ReactNode;
  loading: boolean;
  onRetry: () => void;
  focusedLogId?: string;
  focusRequestId?: string;
  summary?: ReactNode;
}) {
  const titleId = useId();
  const focusedEntryRef = useRef<HTMLElement>(null);
  const visibleTarget =
    !loading && !error && entries.some((entry) => entry.id === focusedLogId);
  useEffect(() => {
    if (!visibleTarget || !focusRequestId) return;
    const frame = window.requestAnimationFrame(() => {
      const element = focusedEntryRef.current;
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId, visibleTarget]);

  return (
    <section
      aria-labelledby={titleId}
      className={`runtime-log-stream ${className}`}
      data-runtime-log-stream="true"
    >
      <header className="runtime-log-stream__header">
        <h3 id={titleId}>Runtime events</h3>
        {summary}
        {filters}
      </header>
      {loading ? (
        <LoadingBlock label="Loading log events…" />
      ) : error ? (
        <div className="p-2.5">
          <ErrorBlock error={error} retry={onRetry} />
        </div>
      ) : entries.length === 0 ? (
        <div className="p-2.5">
          <WorkbenchEmpty
            icon={filtered ? ListFilter : ScrollText}
            title={filtered ? "No matching log events" : "No log events"}
          >
            {filtered
              ? "The current filters did not match any recent records."
              : "Runtime events will appear here as local work runs."}
          </WorkbenchEmpty>
        </div>
      ) : (
        <div
          aria-label="Runtime log records"
          className="runtime-log-stream__records"
          role="log"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The log is an independent scroll region with no nested focusable controls.
          tabIndex={0}
        >
          {entries.map((entry) => (
            <article
              className="runtime-log-stream__row"
              data-search-target={entry.id === focusedLogId ? "" : undefined}
              key={entry.id}
              ref={entry.id === focusedLogId ? focusedEntryRef : undefined}
              tabIndex={entry.id === focusedLogId ? -1 : undefined}
            >
              <div className="runtime-log-stream__severity">
                <Badge tone={logEntryTone(entry.level)}>
                  {entry.level.toUpperCase()}
                </Badge>
              </div>
              {entry.timestamp ? (
                <time
                  className="runtime-log-stream__time"
                  dateTime={entry.timestamp}
                >
                  {displayTimestamp(entry.timestamp)}
                </time>
              ) : null}
              <p className="runtime-log-stream__message">{entry.message}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
