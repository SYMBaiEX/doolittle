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
    <section className="content-card activity-feed">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Operator stream</span>
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

      <ol className="activity-event-list">
        {groups.map(({ count, event, summary }) => {
          const tone = activityTone(event);
          const state = activityState(event);
          return (
            <li key={event.id}>
              <article
                className={`activity-entry severity-${state.severity} liveness-${state.liveness}`}
              >
                <div className="activity-entry-rail" aria-hidden="true">
                  <i className="activity-entry-dot" />
                </div>
                <div className="activity-entry-body">
                  <header className="activity-entry-head">
                    <div className="activity-entry-meta">
                      <span className={`activity-source is-${tone}`}>
                        {ACTIVITY_SOURCE_LABELS[event.kind]}
                      </span>
                      <span className="activity-event-context">
                        {event.status} · {event.target}
                        {count > 1 ? ` · ${count} events` : ""}
                      </span>
                    </div>
                    <time dateTime={event.occurredAt}>
                      {displayTimestamp(event.occurredAt)}
                    </time>
                  </header>

                  <p className="activity-sentence">
                    <strong>{event.title}</strong>
                  </p>
                  {activitySummaryIsDistinct(event.title, summary) ? (
                    <p className="activity-outcome">{summary}</p>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
      {remainingGroups ? (
        <footer className="activity-feed-more">
          <span>{remainingGroups} older groups</span>
          <button
            className="secondary-button"
            onClick={onShowMore}
            type="button"
          >
            Show next {Math.min(ACTIVITY_PAGE_SIZE, remainingGroups)}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
