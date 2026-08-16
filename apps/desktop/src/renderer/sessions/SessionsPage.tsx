import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
import type { SessionSummary } from "../../shared/contracts";
import { OfflineRouteState } from "../components/OfflineRouteState";
import { EmptyBlock, PageHeader } from "../lib";
import { SessionDetail } from "./SessionDetail";
import { SessionListPanel } from "./SessionListPanel";
import {
  SESSIONS_PAGE_CLASS,
  SESSIONS_WORKSPACE_CLASS,
} from "./sessions-layout";
import { useSessionArchiveTransfer } from "./useSessionArchiveTransfer";

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
    <div className={SESSIONS_PAGE_CLASS} data-sessions-page="true">
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
              <Button
                disabled={!active || transfer.transferring}
                onClick={() => transfer.archiveInputRef.current?.click()}
                size="sm"
                type="button"
                variant="secondary"
              >
                Import archive
              </Button>
            ) : null}
            <Button
              disabled={!active}
              onClick={refresh}
              size="sm"
              type="button"
              variant="secondary"
            >
              Refresh
            </Button>
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
          className={
            showEmptyLanding
              ? "split-workspace is-empty min-h-0 flex-none"
              : `split-workspace ${SESSIONS_WORKSPACE_CLASS}`
          }
        >
          {showEmptyLanding ? (
            <section
              aria-labelledby="sessions-empty-title"
              className="session-empty-landing flex min-h-0 items-center justify-between gap-6 bg-[linear-gradient(105deg,color-mix(in_srgb,var(--accent)_6%,transparent),transparent_42%)] px-5 py-[18px] max-[860px]:flex-col max-[860px]:items-stretch max-[860px]:gap-3.5"
              data-session-empty-landing="true"
            >
              <div className="grid min-w-0 gap-[3px] [&_h2]:m-0 [&_h2]:text-sm [&_h2]:text-[var(--text-strong)] [&_p]:m-0 [&_p]:text-[length:var(--text-control)] [&_p]:text-[var(--text-muted)]">
                <span className="eyebrow">Conversation archive</span>
                <h2 id="sessions-empty-title">No saved conversations</h2>
                <p>Start fresh, or bring in a portable Doolittle archive.</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 max-[860px]:justify-start">
                <Button onClick={onNewConversation} type="button">
                  New conversation
                </Button>
                <Button
                  disabled={transfer.transferring}
                  onClick={() => transfer.archiveInputRef.current?.click()}
                  type="button"
                  variant="secondary"
                >
                  Import archive
                </Button>
              </div>
            </section>
          ) : null}
          {!showEmptyLanding ? (
            <>
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
              <section className="detail-panel min-h-0 overflow-auto px-4 pt-3.5 [scrollbar-gutter:stable]">
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
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
