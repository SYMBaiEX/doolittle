import { useState } from "react";
import type { SessionSummary } from "../../shared/contracts";
import { OfflineRouteState } from "../components/OfflineRouteState";
import { EmptyBlock, PageHeader } from "../lib";
import { SessionDetail } from "./SessionDetail";
import { SessionListPanel } from "./SessionListPanel";
import { useSessionArchiveTransfer } from "./useSessionArchiveTransfer";
import "./sessions.css";

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
  onNewConversation,
  projectId,
}: {
  active: boolean;
  sessions: SessionSummary[];
  refresh: () => void;
  openChat: (sessionId: string) => void;
  onNewConversation: () => void;
  projectId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(sessions[0]?.sessionId ?? "");
  const [selectedSearchSession, setSelectedSearchSession] =
    useState<SessionSummary | null>(null);
  const selected =
    sessions.find((session) => session.sessionId === selectedId) ??
    (selectedSearchSession?.sessionId === selectedId
      ? selectedSearchSession
      : undefined) ??
    sessions[0];
  const transfer = useSessionArchiveTransfer({
    active,
    selected,
    projectId,
    refresh,
    openChat,
  });
  const showEmptyLanding =
    active && shouldShowSessionEmptyLanding(sessions.length, query);

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
              onChange={transfer.importArchive}
              ref={transfer.archiveInputRef}
              type="file"
            />
            {!showEmptyLanding ? (
              <button
                className="secondary-button"
                disabled={!active || transfer.transferring}
                onClick={() => transfer.archiveInputRef.current?.click()}
                type="button"
              >
                Import archive
              </button>
            ) : null}
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
      {active && transfer.transferStatus ? (
        <div aria-live="polite" className="notice neutral" role="status">
          {transfer.transferStatus}
        </div>
      ) : null}
      {active && transfer.mutationError ? (
        <div className="inline-error">{transfer.mutationError}</div>
      ) : null}
      {!active ? (
        <OfflineRouteState>
          Saved sessions, transcript details, and transfer actions will be
          available again when the local runtime is ready.
        </OfflineRouteState>
      ) : (
        <div
          className={`split-workspace ${showEmptyLanding ? "is-empty" : ""}`}
        >
          {showEmptyLanding ? (
            <section
              aria-labelledby="sessions-empty-title"
              className="session-empty-landing"
            >
              <div className="session-empty-landing__copy">
                <span className="eyebrow">Conversation archive</span>
                <h2 id="sessions-empty-title">No saved conversations</h2>
                <p>Start fresh, or bring in a portable Doolittle archive.</p>
              </div>
              <div className="session-empty-landing__actions">
                <button
                  className="primary-button"
                  onClick={onNewConversation}
                  type="button"
                >
                  New conversation
                </button>
                <button
                  className="secondary-button"
                  disabled={transfer.transferring}
                  onClick={() => transfer.archiveInputRef.current?.click()}
                  type="button"
                >
                  Import archive
                </button>
              </div>
            </section>
          ) : null}
          <SessionListPanel
            active={active}
            sessions={sessions}
            projectId={projectId}
            selectedId={selected?.sessionId ?? ""}
            onQueryChange={setQuery}
            onSelect={(session) => {
              setSelectedId(session.sessionId);
              setSelectedSearchSession(session);
            }}
          />
          <section className="detail-panel">
            {!selected ? (
              <EmptyBlock title="No sessions yet">
                Your saved conversations will appear here.
              </EmptyBlock>
            ) : (
              <SessionDetail
                active={active}
                onExport={() => void transfer.exportArchive()}
                onOpenChat={openChat}
                onRefresh={refresh}
                onSelectSession={(sessionId) => {
                  setSelectedId(sessionId);
                  if (sessionId !== selectedSearchSession?.sessionId) {
                    setSelectedSearchSession(null);
                  }
                }}
                selected={selected}
                transferring={transfer.transferring}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
