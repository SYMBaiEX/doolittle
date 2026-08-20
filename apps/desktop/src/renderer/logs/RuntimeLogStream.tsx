import {
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from "../lib";
import {
  logEntryBorderColor,
  logEntryClassName,
  logEntryTone,
  type RuntimeLogEntry,
} from "../log-viewer-mapping";

export function RuntimeLogStream({
  className = "",
  entries,
  error,
  filtered,
  loading,
  onRetry,
}: {
  className?: string;
  entries: RuntimeLogEntry[];
  error?: string;
  filtered: boolean;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="runtime-log-stream-title"
      className={`overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] ${className}`}
      data-runtime-log-stream="true"
    >
      <header className="flex min-h-9.5 items-center justify-between gap-3 border-[var(--border)] border-b px-2.5 py-1.5">
        <div className="grid min-w-0 gap-px">
          <span className="font-[var(--font-mono)] text-[length:var(--text-meta)] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            Runtime
          </span>
          <h2
            className="m-0 text-[length:var(--text-control)] font-semibold text-[var(--text)]"
            id="runtime-log-stream-title"
          >
            Event stream
          </h2>
        </div>
        <span className="font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
          {entries.length.toLocaleString()} records
        </span>
      </header>
      {loading ? (
        <LoadingBlock label="Loading log events…" />
      ) : error ? (
        <div className="p-2.5">
          <ErrorBlock error={error} retry={onRetry} />
        </div>
      ) : entries.length === 0 ? (
        <div className="p-2.5">
          <EmptyBlock
            density="compact"
            title={filtered ? "No matching log events" : "No log events"}
          >
            {filtered
              ? "The current filters did not match any recent records."
              : "Runtime events will appear here as local work runs."}
          </EmptyBlock>
        </div>
      ) : (
        <div
          aria-label="Runtime log records"
          className="overflow-y-auto"
          role="log"
        >
          {entries.map((entry) => (
            <article
              className={`grid min-h-9 grid-cols-[54px_minmax(0,1fr)_92px] items-start gap-2 border-[var(--line-subtle)] border-b border-l-2 px-2.25 py-1.75 last:border-b-0 max-[700px]:grid-cols-[52px_minmax(0,1fr)] ${logEntryClassName(entry)}`}
              key={entry.id}
              style={{ borderLeftColor: logEntryBorderColor(entry.level) }}
            >
              <Badge tone={logEntryTone(entry.level)}>
                {entry.level.toUpperCase()}
              </Badge>
              <p className="m-0 min-w-0 whitespace-pre-wrap break-words font-[var(--font-mono)] text-[length:var(--text-meta)] leading-[1.5] text-[var(--text-soft)]">
                {entry.message}
              </p>
              {entry.timestamp ? (
                <time
                  className="text-right font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] max-[700px]:hidden"
                  dateTime={entry.timestamp}
                >
                  {displayTimestamp(entry.timestamp)}
                </time>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
