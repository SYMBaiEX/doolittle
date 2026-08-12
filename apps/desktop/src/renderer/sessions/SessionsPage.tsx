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
  projectId,
}: {
  active: boolean;
  sessions: SessionSummary[];
  refresh: () => void;
  openChat: (sessionId: string) => void;
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
            <button
              className="secondary-button"
              disabled={!active || transfer.transferring}
              onClick={() => transfer.archiveInputRef.current?.click()}
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
