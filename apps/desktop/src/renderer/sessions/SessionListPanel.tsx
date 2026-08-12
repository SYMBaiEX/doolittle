import { useMemo, useState } from "react";
import type {
  SessionSearchResponse,
  SessionSummary,
} from "../../shared/contracts";
import { progressiveWindow } from "../components/progressive-window";
import {
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  useApiResource,
  useDebouncedValue,
} from "../lib";
import { compactSessionPreview } from "../session-preview";

export const SESSION_LIST_PAGE_SIZE = 20;

export function SessionListPanel({
  active,
  sessions,
  projectId,
  selectedId,
  onQueryChange,
  onSelect,
}: {
  active: boolean;
  sessions: SessionSummary[];
  projectId?: string | null;
  selectedId: string;
  onQueryChange?: (query: string) => void;
  onSelect: (session: SessionSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState({ key: "", limit: SESSION_LIST_PAGE_SIZE });
  const debouncedQuery = useDebouncedValue(query.trim());
  const searchPath =
    active && debouncedQuery && projectId !== null
      ? `/sessions/search?query=${encodeURIComponent(debouncedQuery)}&limit=25${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}`
      : null;
  const search = useApiResource<SessionSearchResponse>(searchPath, [
    searchPath,
  ]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const local = !normalized
      ? sessions
      : sessions.filter((s) =>
          [s.title, s.sessionId, s.preview?.join(" ")].some((v) =>
            v?.toLowerCase().includes(normalized),
          ),
        );
    if (!active || !query.trim() || !search.data?.hits?.length) return local;
    const seen = new Set<string>();
    return search.data.hits
      .filter((hit) => {
        if (seen.has(hit.sessionId)) return false;
        seen.add(hit.sessionId);
        return true;
      })
      .map(
        (hit) =>
          sessions.find((s) => s.sessionId === hit.sessionId) ?? {
            sessionId: hit.sessionId,
            title: hit.text.slice(0, 52),
            messageCount: 0,
            endedAt: hit.createdAt,
            participants: [],
            preview: [hit.text],
          },
      );
  }, [active, query, search.data, sessions]);
  const filterKey = `${projectId ?? "all"}:${query.trim().toLocaleLowerCase()}`;
  const requested =
    page.key === filterKey ? page.limit : SESSION_LIST_PAGE_SIZE;
  const selectedIndex = filtered.findIndex(
    (session) => session.sessionId === selectedId,
  );
  const sessionWindow = progressiveWindow(filtered, {
    pageSize: SESSION_LIST_PAGE_SIZE,
    requested,
    selectedIndex,
  });
  return (
    <section className="list-panel">
      <label className="search-field">
        <span className="sr-only">Search sessions</span>
        <input
          placeholder="Search conversations or message text"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            onQueryChange?.(next);
          }}
        />
      </label>
      {active && query.trim() ? (
        <div className="session-search-status">
          {search.loading ? (
            <LoadingBlock label="Searching persisted sessions…" />
          ) : search.error ? (
            <ErrorBlock error={search.error} retry={search.reload} />
          ) : search.data?.hits?.length ? (
            <div className="status-row">
              <div>
                <strong>Full-text search</strong>
                <small>{search.data.hits.length} persisted hit(s)</small>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <section
        aria-label="Conversations"
        className="list-scroll session-list-scroll"
      >
        {sessionWindow.visible.map((session) => (
          <button
            className={`row-card ${selectedId === session.sessionId ? "selected" : ""}`}
            key={session.sessionId}
            onClick={() => onSelect(session)}
            type="button"
          >
            <span className="row-card-main">
              <strong>
                {compactSessionPreview(session.title || "") ||
                  compactSessionPreview(session.preview?.[0] || "") ||
                  "Untitled conversation"}
              </strong>
              <small>
                {compactSessionPreview(session.preview?.[0] || "") ||
                  session.sessionId}
              </small>
            </span>
            <span className="row-card-meta">
              <small>{session.messageCount} messages</small>
              <small>{displayTimestamp(session.endedAt)}</small>
            </span>
          </button>
        ))}
        {!filtered.length ? (
          <EmptyBlock title="No matching sessions">
            Try another search, or begin a conversation from Chat.
          </EmptyBlock>
        ) : null}
        {sessionWindow.remaining ? (
          <footer className="session-list-footer">
            <span>
              Showing {sessionWindow.visible.length} of {filtered.length}
            </span>
            <button
              className="secondary-button"
              onClick={() =>
                setPage({
                  key: filterKey,
                  limit: sessionWindow.limit + SESSION_LIST_PAGE_SIZE,
                })
              }
              type="button"
            >
              Show {Math.min(SESSION_LIST_PAGE_SIZE, sessionWindow.remaining)}
              {" more"}
            </button>
          </footer>
        ) : null}
      </section>
    </section>
  );
}
