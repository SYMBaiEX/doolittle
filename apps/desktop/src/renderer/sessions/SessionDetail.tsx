import { type FormEvent, useState } from "react";
import type {
  SessionMessagesResponse,
  SessionSummary,
  SessionUsageSummary,
  StoredMessage,
} from "../../shared/contracts";
import { CompactStatStrip } from "../components/CompactStatStrip";
import { MessageContent } from "../components/MessageContent";
import {
  compactNumber,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  useApiResource,
} from "../lib";
import { sessionDetailRequests } from "../resource-request-policy";

interface SessionUsageResponse {
  usage?: SessionUsageSummary;
}

interface SessionContinuityResponse {
  sessions?: SessionSummary[];
}

export function SessionTranscriptMessage({
  message,
}: {
  message: StoredMessage;
}) {
  return (
    <article className={`transcript-message ${message.role}`}>
      <div className="transcript-message__header">
        <strong>
          {message.role === "assistant"
            ? "Doolittle"
            : message.role === "user"
              ? "You"
              : "System"}
        </strong>
        <time>{displayTimestamp(message.createdAt)}</time>
      </div>
      <MessageContent
        content={message.text}
        separateAgentEvents={message.role === "assistant"}
      />
    </article>
  );
}

export function SessionDetail({
  active,
  onExport,
  onOpenChat,
  onRefresh,
  onSelectSession,
  selected,
  transferring,
}: {
  active: boolean;
  onExport(): void;
  onOpenChat(sessionId: string): void;
  onRefresh(): void;
  onSelectSession(sessionId: string): void;
  selected: SessionSummary;
  transferring: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [continuityOpen, setContinuityOpen] = useState(false);
  const requestPolicy = sessionDetailRequests({ active, continuityOpen });
  const transcript = useApiResource<SessionMessagesResponse>(
    requestPolicy.primary
      ? `/sessions/messages?sessionId=${encodeURIComponent(selected.sessionId)}&limit=500`
      : null,
    [requestPolicy.primary, selected.sessionId],
  );
  const usage = useApiResource<SessionUsageResponse>(
    requestPolicy.primary
      ? `/sessions/usage?sessionId=${encodeURIComponent(selected.sessionId)}`
      : null,
    [requestPolicy.primary, selected.sessionId],
  );
  const continuity = useApiResource<SessionContinuityResponse>(
    requestPolicy.continuity
      ? `/sessions/continuity?sessionId=${encodeURIComponent(selected.sessionId)}&limit=8`
      : null,
    [requestPolicy.continuity, selected.sessionId],
  );
  const transcriptMessages = transcript.data?.messages ?? [];
  const transcriptCount = transcriptMessages.length;
  const transcriptStatusLabel = transcript.loading
    ? "Loading…"
    : transcript.error
      ? "Unavailable"
      : `${compactNumber(transcriptCount)} message${
          transcriptCount === 1 ? "" : "s"
        }`;

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setMutationError("");
    try {
      await desktopRequest("/sessions/title", "POST", {
        sessionId: selected.sessionId,
        title: nextTitle,
      });
      setEditing(false);
      setTitle("");
      onRefresh();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="session-detail-stack">
      <div className="detail-toolbar">
        <div>
          <span className="eyebrow">Transcript</span>
          <h2>
            {selected.title || selected.preview?.[0] || "Untitled conversation"}
          </h2>
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={() => {
              setTitle(selected.title ?? "");
              setEditing(true);
            }}
            type="button"
          >
            Rename
          </button>
          <button
            className="secondary-button"
            disabled={transferring}
            onClick={onExport}
            type="button"
          >
            {transferring ? "Working…" : "Export"}
          </button>
          <button
            className="primary-button"
            onClick={() => onOpenChat(selected.sessionId)}
            type="button"
          >
            Open in chat
          </button>
        </div>
      </div>
      {editing ? (
        <form className="inline-form" onSubmit={rename}>
          <input
            aria-label="Session title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button className="primary-button" type="submit">
            Save
          </button>
          <button
            className="text-button"
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : null}
      {mutationError ? (
        <div className="inline-error">{mutationError}</div>
      ) : null}
      <CompactStatStrip
        label="Session summary"
        stats={[
          {
            label: "Messages",
            value: compactNumber(
              usage.data?.usage?.messageCount ?? selected.messageCount ?? 0,
            ),
            detail: `Updated ${displayTimestamp(
              usage.data?.usage?.endedAt ?? selected.endedAt,
            )}`,
          },
          {
            label: "Estimated tokens",
            value: compactNumber(usage.data?.usage?.estimatedTokens ?? 0),
            detail: `${compactNumber(
              usage.data?.usage?.characterCount ?? 0,
            )} characters`,
          },
          {
            label: "Participants",
            value: selected.participants.length || 0,
            detail: selected.participants.join(", ") || "Local session",
          },
          {
            label: "Continuity",
            value: continuityOpen
              ? continuity.loading
                ? "…"
                : (continuity.data?.sessions?.length ?? 0)
              : selected.parentSessionId
                ? "Branch"
                : "—",
            detail: continuityOpen
              ? selected.continuityKey || "No continuity key"
              : "Open related sessions",
          },
        ]}
      />
      <div className="session-insight-grid">
        <details className="session-insight-disclosure">
          <summary>
            <span>
              <strong>Session metadata</strong>
              <small>Identifiers, branch lineage, and timestamps</small>
            </span>
            <span>Inspect</span>
          </summary>
          <div className="stack-list">
            <div className="status-row">
              <div>
                <strong>Session id</strong>
                <small>{selected.sessionId}</small>
              </div>
            </div>
            {selected.parentSessionId ? (
              <div className="status-row">
                <div>
                  <strong>Parent branch</strong>
                  <small>{selected.parentSessionId}</small>
                </div>
              </div>
            ) : null}
            {selected.rootSessionId ? (
              <div className="status-row">
                <div>
                  <strong>Branch root</strong>
                  <small>{selected.rootSessionId}</small>
                </div>
              </div>
            ) : null}
            {selected.forkedFromMessageId ? (
              <div className="status-row">
                <div>
                  <strong>Fork anchor</strong>
                  <small>{selected.forkedFromMessageId}</small>
                </div>
              </div>
            ) : null}
            <div className="status-row">
              <div>
                <strong>Started</strong>
                <small>{displayTimestamp(selected.startedAt)}</small>
              </div>
            </div>
            <div className="status-row">
              <div>
                <strong>Latest preview</strong>
                <small>{selected.preview?.[0] ?? "No preview"}</small>
              </div>
            </div>
          </div>
        </details>
        <details
          className="session-insight-disclosure"
          onToggle={(event) => setContinuityOpen(event.currentTarget.open)}
        >
          <summary>
            <span>
              <strong>Related sessions</strong>
              <small>Branches sharing this continuity key</small>
            </span>
            <span>
              {continuityOpen
                ? continuity.loading
                  ? "…"
                  : (continuity.data?.sessions?.length ?? 0)
                : "Open"}
            </span>
          </summary>
          {continuityOpen && continuity.loading ? (
            <LoadingBlock />
          ) : continuityOpen && continuity.error ? (
            <ErrorBlock error={continuity.error} retry={continuity.reload} />
          ) : continuityOpen && continuity.data?.sessions?.length ? (
            <div className="stack-list">
              {continuity.data.sessions.map((session) => (
                <button
                  className="status-row"
                  key={session.sessionId}
                  onClick={() => onSelectSession(session.sessionId)}
                  type="button"
                >
                  <div>
                    <strong>
                      {session.title ||
                        session.preview?.[0] ||
                        session.sessionId}
                    </strong>
                    <small>
                      {displayTimestamp(session.endedAt)} ·{" "}
                      {compactNumber(session.messageCount)} messages
                      {session.parentSessionId ? " · branch" : ""}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          ) : continuityOpen ? (
            <EmptyBlock title="No related sessions">
              This session does not currently have a continuity chain.
            </EmptyBlock>
          ) : null}
        </details>
      </div>
      <section className="session-transcript-panel">
        <header className="session-transcript-panel__header">
          <span>
            <strong>Persisted messages</strong>
          </span>
          <small>{transcriptStatusLabel}</small>
        </header>
        <div className="transcript">
          {transcript.loading ? (
            <LoadingBlock label="Loading transcript…" />
          ) : transcript.error ? (
            <ErrorBlock error={transcript.error} retry={transcript.reload} />
          ) : transcriptCount ? (
            transcriptMessages.map((message) => (
              <SessionTranscriptMessage key={message.id} message={message} />
            ))
          ) : (
            <EmptyBlock title="Empty transcript">
              No persisted messages were found for this session.
            </EmptyBlock>
          )}
        </div>
      </section>
    </div>
  );
}
