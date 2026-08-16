import type { ActivityEvent } from "../../shared/contracts";
import { displayTimestamp } from "../lib";
import {
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_SOURCE_LABELS,
  type ActivityEventGroup,
  activityState,
  activitySummaryIsDistinct,
  activityTone,
} from "./activity-model";

const SOURCE_CLASS =
  "inline-flex min-h-[18px] items-center rounded-[2px] border border-[var(--border)] px-[5px] font-[var(--font-mono)] text-[9px] uppercase tracking-[0.04em] text-[var(--muted)]";

function sourceToneClass(tone: ReturnType<typeof activityTone>): string {
  if (tone === "bad") {
    return "border-[color-mix(in_srgb,var(--bad)_42%,var(--border))] text-[var(--bad)]";
  }
  if (tone === "warn") {
    return "border-[color-mix(in_srgb,var(--warn)_42%,var(--border))] text-[var(--warn)]";
  }
  return "";
}

function dotStateClass(event: ActivityEvent): string {
  const state = activityState(event);
  if (state.severity === "critical") {
    return "border-[var(--bad)] bg-[var(--bad)]";
  }
  if (state.severity === "warning") return "border-[var(--warn)]";
  if (state.liveness === "live") {
    return "border-[var(--accent)] bg-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]";
  }
  return "border-[var(--muted)] bg-[var(--surface-raised)]";
}

export function ActivityTimeline({
  filteredCount,
  groups,
  onShowMore,
  remainingGroups,
  totalCount,
}: {
  filteredCount: number;
  groups: readonly ActivityEventGroup<ActivityEvent>[];
  onShowMore: () => void;
  remainingGroups: number;
  totalCount: number;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5">
        <div>
          <span className="font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            Operator stream
          </span>
          <h2>Timeline</h2>
        </div>
        <small>
          {groups.length} visible
          {groups.length + remainingGroups !== filteredCount
            ? ` · ${filteredCount} events`
            : totalCount !== filteredCount
              ? ` of ${totalCount}`
              : ""}
        </small>
      </div>

      <ol className="m-0 list-none p-0">
        {groups.map(({ count, event, summary }, index) => {
          const tone = activityTone(event);
          const state = activityState(event);
          return (
            <li className="m-0" key={event.id}>
              <article
                className="grid grid-cols-[15px_minmax(0,1fr)] gap-x-[7px] border-b border-[var(--border)] px-3 last:border-b-0 hover:bg-[color-mix(in_srgb,var(--accent)_2.5%,var(--surface-soft))] max-[700px]:px-[9px]"
                data-activity-entry="true"
                data-liveness={state.liveness}
                data-severity={state.severity}
              >
                <div
                  className="relative flex justify-center"
                  aria-hidden="true"
                >
                  <span
                    className={`absolute w-px bg-[var(--border)] ${
                      index === 0 ? "top-4" : "top-0"
                    } ${index === groups.length - 1 ? "bottom-[calc(100%_-_16px)]" : "bottom-0"}`}
                  />
                  <i
                    className={`relative z-[1] mt-[15px] size-[7px] rounded-full border-2 ${dotStateClass(event)}`}
                  />
                </div>
                <div className="min-w-0 py-2">
                  <header className="flex items-center justify-between gap-2 max-[700px]:items-start">
                    <div className="flex flex-wrap items-center gap-[5px]">
                      <span
                        className={`${SOURCE_CLASS} ${sourceToneClass(tone)}`}
                      >
                        {ACTIVITY_SOURCE_LABELS[event.kind]}
                      </span>
                      <span className="inline-flex min-h-[18px] items-center font-[var(--font-mono)] text-[9px] uppercase tracking-[0.04em] text-[var(--muted)]">
                        {event.status} · {event.target}
                        {count > 1 ? ` · ${count} events` : ""}
                      </span>
                    </div>
                    <time
                      className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] tabular-nums"
                      dateTime={event.occurredAt}
                    >
                      {displayTimestamp(event.occurredAt)}
                    </time>
                  </header>

                  <p className="mt-1 text-[13px] leading-[1.35] text-[var(--text)] [overflow-wrap:anywhere]">
                    <strong className="font-bold text-[var(--accent)]">
                      {event.title}
                    </strong>
                  </p>
                  {activitySummaryIsDistinct(event.title, summary) ? (
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-[var(--text-soft)] [overflow-wrap:anywhere]">
                      {summary}
                    </p>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
      {remainingGroups ? (
        <footer className="flex min-h-10 items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--surface-soft)_82%,transparent)] px-3 py-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
          <span>{remainingGroups} older groups</span>
          <Button
            onClick={onShowMore}
            size="sm"
            type="button"
            variant="outline"
          >
            Show next {Math.min(ACTIVITY_PAGE_SIZE, remainingGroups)}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

import { Button } from "@elizaos/ui/components/ui/button";
