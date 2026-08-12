import { type ChangeEvent, useMemo, useRef, useState } from "react";
import type {
  SessionSearchResponse,
  SessionSummary,
} from "../../shared/contracts";
import { OfflineRouteState } from "../components/OfflineRouteState";
import {
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  useApiResource,
  useDebouncedValue,
} from "../lib";
import { SessionDetail } from "./SessionDetail";

interface SessionArchivePreview {
  sourceApplication: string;
  title?: string;
  projectLabel?: string;
  messageCount: number;
  attachmentCount: number;
  omissionNotices: string[];
}

interface SessionArchiveExportResponse {
  archive: unknown;
}

interface SessionArchivePreviewResponse {
  preview: SessionArchivePreview;
}

interface SessionArchiveImportResponse {
  imported: {
    sessionId: string;
    importedMessageCount: number;
    omissionNotices: string[];
  };
}

export function shouldShowSessionEmptyLanding(
  sessionCount: number,
  query: string,
): boolean {
  return sessionCount === 0 && !query.trim();
}

export function SessionsPage({
  active,
  sessions,
  refresh,
  openChat,
  projectId,
}: {
  active: boolean;
  sessions: SessionSummary[];
  refresh: () => void;
  openChat: (sessionId: string) => void;
  projectId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim());
  const [selectedId, setSelectedId] = useState(sessions[0]?.sessionId ?? "");
  const [mutationError, setMutationError] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [transferring, setTransferring] = useState(false);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const searchPath =
    active && debouncedQuery && projectId !== null
      ? `/sessions/search?query=${encodeURIComponent(debouncedQuery)}&limit=25${
          projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""
        }`
      : null;
  const search = useApiResource<SessionSearchResponse>(searchPath, [
    searchPath,
  ]);
  const localFiltered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) =>
      [session.title, session.sessionId, session.preview?.join(" ")].some(
        (value) => value?.toLowerCase().includes(normalized),
      ),
    );
  }, [query, sessions]);
  const searchHitsBySession = useMemo(() => {
    const hits = new Map<string, { text: string; createdAt: string }>();
    for (const hit of search.data?.hits ?? []) {
      if (!hits.has(hit.sessionId)) {
        hits.set(hit.sessionId, {
          text: hit.text,
          createdAt: hit.createdAt,
        });
      }
    }
    return hits;
  }, [search.data]);
  const filtered = useMemo(() => {
    if (!active || !query.trim() || !searchHitsBySession.size) {
      return localFiltered;
    }
    return [...searchHitsBySession.entries()].map(([sessionId, hit]) => {
      const existing = sessions.find(
        (session) => session.sessionId === sessionId,
      );
      return (
        existing ?? {
          sessionId,
          title: hit.text.slice(0, 52),
          messageCount: 0,
          endedAt: hit.createdAt,
          participants: [],
          preview: [hit.text],
        }
      );
    });
  }, [active, localFiltered, query, searchHitsBySession, sessions]);
  const selected =
    filtered.find((session) => session.sessionId === selectedId) ??
    sessions.find((session) => session.sessionId === selectedId) ??
    filtered[0] ??
    sessions[0];
  const exportArchive = async () => {
    if (!active || !selected || transferring) return;
    setMutationError("");
    setTransferStatus("Preparing portable archive…");
    setTransferring(true);
    try {
      const response = await desktopRequest<SessionArchiveExportResponse>(
        `/sessions/export?sessionId=${encodeURIComponent(selected.sessionId)}`,
      );
      const json = `${JSON.stringify(response.archive, null, 2)}\n`;
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      const basename = (
        selected.title ||
        selected.preview?.[0] ||
        "doolittle-session"
      )
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/^-+|-+$/gu, "")
        .slice(0, 80);
      link.download = `${basename || "doolittle-session"}.doolittle.json`;
      link.href = url;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setTransferStatus(
        `Exported ${selected.messageCount} messages. Attachment descriptors are included; local binary files stay on this device.`,
      );
    } catch (error) {
      setMutationError(
        `Could not export the session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      setTransferStatus("");
    } finally {
      setTransferring(false);
    }
  };

  const importArchive = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!active || !file || transferring) return;
    setMutationError("");
    setTransferStatus("Validating archive before import…");
    setTransferring(true);
    try {
      if (file.size > 2_000_000) {
        throw new Error("Archive exceeds the 2 MB safety limit.");
      }
      const archive = JSON.parse(await file.text()) as unknown;
      const { preview } = await desktopRequest<SessionArchivePreviewResponse>(
        "/sessions/import/preview",
        "POST",
        { archive },
      );
      const destination =
        projectId && projectId !== "unscoped"
          ? "the current project"
          : "Unscoped chats";
      const confirmed = window.confirm(
        `Import “${preview.title || "Untitled conversation"}” from ${
          preview.sourceApplication
        }?\n\n${preview.messageCount} messages · ${
          preview.attachmentCount
        } attachment descriptors\nDestination: ${destination}${
          preview.omissionNotices.length
            ? `\n\n${preview.omissionNotices.join("\n")}`
            : ""
        }`,
      );
      if (!confirmed) {
        setTransferStatus("Import cancelled. No local data changed.");
        return;
      }
      const { imported } = await desktopRequest<SessionArchiveImportResponse>(
        "/sessions/import",
        "POST",
        {
          archive,
          ...(projectId && projectId !== "unscoped" ? { projectId } : {}),
        },
      );
      refresh();
      setTransferStatus(
        `Imported ${imported.importedMessageCount} messages into a new local conversation.`,
      );
      openChat(imported.sessionId);
    } catch (error) {
      setMutationError(
        `Could not import the archive: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      setTransferStatus("");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="page page-sessions">
      <PageHeader
        eyebrow="Workspace"
        title="Sessions"
        description={
          projectId === null
            ? "Search, inspect, rename, and resume unscoped local conversations."
            : projectId
              ? "Search, inspect, rename, and resume conversations in this project."
              : "Search, inspect, rename, and resume every conversation stored by the local runtime."
        }
        actions={
          <>
            <input
              accept=".json,.doolittle.json,application/json"
              aria-label="Choose a Doolittle session archive"
              hidden
              onChange={importArchive}
              ref={archiveInputRef}
              type="file"
            />
            <button
              className="secondary-button"
              disabled={!active || transferring}
              onClick={() => archiveInputRef.current?.click()}
              type="button"
            >
              Import archive
            </button>
            <button
              className="secondary-button"
              disabled={!active}
              onClick={refresh}
              type="button"
            >
              Refresh
            </button>
          </>
        }
      />
      {active && transferStatus ? (
        <div aria-live="polite" className="notice neutral" role="status">
          {transferStatus}
        </div>
      ) : null}
      {active && mutationError ? (
        <div className="inline-error">{mutationError}</div>
      ) : null}
      {!active ? (
        <OfflineRouteState>
          Saved sessions, transcript details, and transfer actions will be
          available again when the local runtime is ready.
        </OfflineRouteState>
      ) : (
        <div
          className={`split-workspace ${
            shouldShowSessionEmptyLanding(sessions.length, query)
              ? "is-empty"
              : ""
          }`}
        >
          {shouldShowSessionEmptyLanding(sessions.length, query) ? (
            <section className="session-empty-landing">
              <EmptyBlock title="No sessions yet">
                Start a conversation from Chat, or import a portable archive.
              </EmptyBlock>
            </section>
          ) : null}
          <section className="list-panel">
            <label className="search-field">
              <span className="sr-only">Search sessions</span>
              <input
                placeholder="Search conversations or message text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {active && query.trim() ? (
              <div style={{ marginBottom: "10px" }}>
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
              {filtered.map((session) => (
                <button
                  className={`row-card ${
                    selected?.sessionId === session.sessionId ? "selected" : ""
                  }`}
                  key={session.sessionId}
                  onClick={() => setSelectedId(session.sessionId)}
                  type="button"
                >
                  <span className="row-card-main">
                    <strong>
                      {session.title ||
                        session.preview?.[0] ||
                        "Untitled conversation"}
                    </strong>
                    <small>{session.preview?.[0] || session.sessionId}</small>
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
            </section>
          </section>
          <section className="detail-panel">
            {!selected ? (
              <EmptyBlock title="No sessions yet">
                Your saved conversations will appear here.
              </EmptyBlock>
            ) : (
              <SessionDetail
                active={active}
                onExport={() => void exportArchive()}
                onOpenChat={openChat}
                onRefresh={refresh}
                onSelectSession={setSelectedId}
                selected={selected}
                transferring={transferring}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
