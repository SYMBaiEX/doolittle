import type { KeyboardEvent, RefObject } from "react";
import { Badge, displayTimestamp, EmptyBlock } from "../lib";
import {
  REVIEW_FILTERS,
  type ReviewFilter,
  type ReviewItem,
  statusTone,
} from "./models";

export interface ReviewQueueProps {
  filter: ReviewFilter;
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  items: ReviewItem[];
  visibleItems: ReviewItem[];
  platform: string;
  selectedId: string;
  onFilterChange: (filter: ReviewFilter) => void;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
}

export function ReviewQueue({
  filter,
  query,
  searchRef,
  items,
  visibleItems,
  platform,
  selectedId,
  onFilterChange,
  onQueryChange,
  onSelect,
}: ReviewQueueProps) {
  const selectFilterAt = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = REVIEW_FILTERS[index];
    if (!next) return;
    const tablist = event.currentTarget.parentElement;
    onFilterChange(next.id);
    requestAnimationFrame(() => {
      tablist
        ?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
        [index]?.focus();
    });
  };

  return (
    <aside className="review-rail">
      <div aria-label="Review filters" className="review-tabs" role="tablist">
        {REVIEW_FILTERS.map(({ id, label }, index) => (
          <button
            aria-controls="review-filter-panel"
            aria-selected={filter === id}
            className={filter === id ? "selected" : ""}
            id={`review-filter-${id}`}
            key={id}
            onClick={() => onFilterChange(id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                selectFilterAt(event, (index + 1) % REVIEW_FILTERS.length);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                selectFilterAt(
                  event,
                  (index - 1 + REVIEW_FILTERS.length) % REVIEW_FILTERS.length,
                );
              } else if (event.key === "Home") {
                event.preventDefault();
                selectFilterAt(event, 0);
              } else if (event.key === "End") {
                event.preventDefault();
                selectFilterAt(event, REVIEW_FILTERS.length - 1);
              }
            }}
            role="tab"
            tabIndex={filter === id ? 0 : -1}
            type="button"
          >
            {label}
            <span>
              {id === "all"
                ? items.length
                : items.filter((item) => item.kind === id).length}
            </span>
          </button>
        ))}
      </div>
      <label className="review-search">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Search review queue"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search decisions and changes"
          ref={searchRef}
          type="search"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear review search"
            onClick={() => onQueryChange("")}
            type="button"
          >
            ×
          </button>
        ) : (
          <kbd>{platform === "darwin" ? "⌘F" : "Ctrl F"}</kbd>
        )}
      </label>
      <div
        aria-labelledby={`review-filter-${filter}`}
        className="review-list"
        id="review-filter-panel"
        role="tabpanel"
      >
        {visibleItems.length === 0 ? (
          <EmptyBlock title="No matching work">
            Completed agent work will appear here as it happens.
          </EmptyBlock>
        ) : (
          visibleItems.map((item) => (
            <button
              aria-current={selectedId === item.id}
              className={selectedId === item.id ? "selected" : ""}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <span
                className={`review-kind-mark ${item.kind} ${
                  item.kind === "ci" ? statusTone(item.status) : ""
                }`.trim()}
              >
                {item.kind === "approvals"
                  ? "!"
                  : item.kind === "ci"
                    ? "✓"
                    : item.kind === "changes"
                      ? "±"
                      : "↗"}
              </span>
              <span className="review-list-copy">
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                {item.timestamp ? (
                  <time dateTime={item.timestamp}>
                    {displayTimestamp(item.timestamp)}
                  </time>
                ) : null}
              </span>
              <Badge tone={statusTone(item.status)}>{item.status}</Badge>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
