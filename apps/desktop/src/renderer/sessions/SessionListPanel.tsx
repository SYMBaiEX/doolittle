import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
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
import {
  SESSION_LIST_PANEL_CLASS,
  SESSION_ROW_CLASS,
  SESSION_ROW_SELECTED_CLASS,
  SESSION_STATUS_ROW_CLASS,
} from "./sessions-layout";

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
    <section className={`list-panel ${SESSION_LIST_PANEL_CLASS}`}>
      <label htmlFor="session-search-input">
        <span className="sr-only">Search sessions</span>
        <Input
          id="session-search-input"
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
        <div className="mb-1.5">
          {search.loading ? (
            <LoadingBlock label="Searching persisted sessions…" />
          ) : search.error ? (
            <ErrorBlock error={search.error} retry={search.reload} />
          ) : search.data?.hits?.length ? (
            <div className={SESSION_STATUS_ROW_CLASS}>
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
        className="overflow-auto overscroll-contain [scrollbar-gutter:stable]"
      >
        {sessionWindow.visible.map((session) => (
          <button
            className={`${SESSION_ROW_CLASS} ${selectedId === session.sessionId ? SESSION_ROW_SELECTED_CLASS : ""}`}
            data-session-row="true"
            key={session.sessionId}
            onClick={() => onSelect(session)}
            type="button"
          >
            <span className="grid min-w-0 gap-0.5 [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:text-[var(--text-meta)] [&_small]:text-[var(--text-muted)] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[var(--text-control)]">
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
            <span className="grid shrink-0 justify-items-end gap-0.5 [&_small]:font-[var(--font-mono)] [&_small]:text-[9px] [&_small]:text-[var(--text-muted)]">
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
          <footer
            className="mt-1 flex min-h-[38px] items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-1 pt-[5px]"
            data-session-list-footer="true"
          >
            <span className="font-[var(--font-mono)] text-[9px] tracking-[0.04em] text-[var(--text-muted)] uppercase">
              Showing {sessionWindow.visible.length} of {filtered.length}
            </span>
            <Button
              className="min-h-7 px-[9px]"
              onClick={() =>
                setPage({
                  key: filterKey,
                  limit: sessionWindow.limit + SESSION_LIST_PAGE_SIZE,
                })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              Show {Math.min(SESSION_LIST_PAGE_SIZE, sessionWindow.remaining)}
              {" more"}
            </Button>
          </footer>
        ) : null}
      </section>
    </section>
  );
}
