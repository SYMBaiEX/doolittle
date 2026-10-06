import { ContextActionMenu } from "@doolittle/ui";
import { useState } from "react";
import type { SessionSummary } from "../../shared/contracts";
import { Button } from "../components/ElizaControls";
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
  embedded = false,
}: {
  active: boolean;
  sessions: SessionSummary[];
  refresh: () => void;
  openChat: (sessionId: string) => void;
  onNewConversation: () => void;
  projectId?: string | null;
  embedded?: boolean;
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

  const actions = (
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
  );

  return (
    <ContextActionMenu
      items={[
        {
          id: "new-conversation",
          label: "New conversation",
          disabled: !active,
          onSelect: onNewConversation,
        },
        {
          id: "import",
          label: "Import conversation archive…",
          disabled: !active || transfer.transferring,
          onSelect: () => transfer.archiveInputRef.current?.click(),
        },
        {
          id: "refresh",
          label: "Refresh history",
          disabled: !active,
          onSelect: refresh,
        },
      ]}
      label="Conversation history actions"
      scopeKey={`history:${projectId ?? "all"}`}
    >
      <div
        className={SESSIONS_PAGE_CLASS}
        data-sessions-embedded={embedded || undefined}
        data-sessions-page="true"
      >
        {embedded ? (
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-3">
            <div className="grid gap-1">
              <h2 className="text-[length:var(--text-section)] font-semibold">
                Conversation history
              </h2>
              <p className="text-[length:var(--text-control)] text-[var(--muted)]">
                Review a transcript, then open it in the workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </header>
        ) : (
          <PageHeader
            eyebrow="Chat"
            title="Conversation history"
            description={
              projectId === null
                ? "Find and reopen conversations outside a project."
                : projectId
                  ? "Find and reopen conversations in this project."
                  : "Find, review, and reopen conversations from your workspace."
            }
            actions={actions}
          />
        )}
        {active && transfer.transferStatus ? (
          <div aria-live="polite" className="notice neutral" role="status">
            {transfer.transferStatus}
          </div>
        ) : null}
        {active && transfer.mutationError ? (
          <div className="inline-error" role="alert">
            {transfer.mutationError}
          </div>
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
                className="session-empty-landing flex min-h-0 items-center justify-between gap-4 px-4 py-3 max-[860px]:flex-col max-[860px]:items-stretch max-[860px]:gap-3"
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
                  onOpenSession={openChat}
                  onQueryChange={setQuery}
                  onSelect={(session) => {
                    setSelectedId(session.sessionId);
                    setSelectedSearchSession(session);
                  }}
                />
                <section className="detail-panel [scrollbar-gutter:stable]">
                  {!selected ? (
                    <EmptyBlock title="No sessions yet">
                      Your saved conversations will appear here.
                    </EmptyBlock>
                  ) : (
                    <SessionDetail
                      key={selected.sessionId}
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
    </ContextActionMenu>
  );
}
