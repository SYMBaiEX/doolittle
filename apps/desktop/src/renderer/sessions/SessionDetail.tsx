import { type FormEvent, useState } from "react";
import type {
  SessionMessagesResponse,
  SessionSummary,
  SessionUsageSummary,
} from "../../shared/contracts";
import { CompactStatStrip } from "../components/CompactStatStrip";
import {
  compactNumber,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  useApiResource,
} from "../lib";

interface SessionSummaryResponse {
  summary?: SessionSummary;
}

interface SessionUsageResponse {
  usage?: SessionUsageSummary;
}

interface SessionContinuityResponse {
  sessions?: SessionSummary[];
}

export function SessionDetail({
  onExport,
  onOpenChat,
  onRefresh,
  onSelectSession,
  selected,
  transferring,
}: {
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
  const transcript = useApiResource<SessionMessagesResponse>(
    `/sessions/messages?sessionId=${encodeURIComponent(selected.sessionId)}&limit=500`,
    [selected.sessionId],
  );
  const summary = useApiResource<SessionSummaryResponse>(
    `/sessions/summary?sessionId=${encodeURIComponent(selected.sessionId)}`,
    [selected.sessionId],
  );
  const usage = useApiResource<SessionUsageResponse>(
    `/sessions/usage?sessionId=${encodeURIComponent(selected.sessionId)}`,
    [selected.sessionId],
  );
  const continuity = useApiResource<SessionContinuityResponse>(
    `/sessions/continuity?sessionId=${encodeURIComponent(selected.sessionId)}&limit=8`,
    [selected.sessionId],
  );

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
    <>
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
            value: continuity.data?.sessions?.length ?? 0,
            detail: summary.data?.summary?.continuityKey || "No continuity key",
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
            {summary.loading ? (
              <LoadingBlock />
            ) : summary.error ? (
              <ErrorBlock error={summary.error} retry={summary.reload} />
            ) : (
              <>
                <div className="status-row">
                  <div>
                    <strong>Session id</strong>
                    <small>{selected.sessionId}</small>
                  </div>
                </div>
                {summary.data?.summary?.parentSessionId ? (
                  <div className="status-row">
                    <div>
                      <strong>Parent branch</strong>
                      <small>{summary.data.summary.parentSessionId}</small>
                    </div>
                  </div>
                ) : null}
                {summary.data?.summary?.rootSessionId ? (
                  <div className="status-row">
                    <div>
                      <strong>Branch root</strong>
                      <small>{summary.data.summary.rootSessionId}</small>
                    </div>
                  </div>
                ) : null}
                {summary.data?.summary?.forkedFromMessageId ? (
                  <div className="status-row">
                    <div>
                      <strong>Fork anchor</strong>
                      <small>{summary.data.summary.forkedFromMessageId}</small>
                    </div>
                  </div>
                ) : null}
                <div className="status-row">
                  <div>
                    <strong>Started</strong>
                    <small>
                      {displayTimestamp(
                        summary.data?.summary?.startedAt ?? selected.startedAt,
                      )}
                    </small>
                  </div>
                </div>
                <div className="status-row">
                  <div>
                    <strong>Latest preview</strong>
                    <small>
                      {summary.data?.summary?.preview?.[0] ??
                        selected.preview?.[0] ??
                        "No preview"}
                    </small>
                  </div>
                </div>
              </>
            )}
          </div>
        </details>
        <details className="session-insight-disclosure">
          <summary>
            <span>
              <strong>Related sessions</strong>
              <small>Branches sharing this continuity key</small>
            </span>
            <span>{continuity.data?.sessions?.length ?? 0}</span>
          </summary>
          {continuity.loading ? (
            <LoadingBlock />
          ) : continuity.error ? (
            <ErrorBlock error={continuity.error} retry={continuity.reload} />
          ) : continuity.data?.sessions?.length ? (
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
          ) : (
            <EmptyBlock title="No related sessions">
              This session does not currently have a continuity chain.
            </EmptyBlock>
          )}
        </details>
      </div>
      <div className="transcript">
        {transcript.loading ? (
          <LoadingBlock label="Loading transcript…" />
        ) : transcript.error ? (
          <ErrorBlock error={transcript.error} retry={transcript.reload} />
        ) : transcript.data?.messages.length ? (
          transcript.data.messages.map((message) => (
            <article
              className={`transcript-message ${message.role}`}
              key={message.id}
            >
              <div>
                <strong>
                  {message.role === "assistant"
                    ? "Doolittle"
                    : message.role === "user"
                      ? "You"
                      : "System"}
                </strong>
                <time>{displayTimestamp(message.createdAt)}</time>
              </div>
              <p>{message.text}</p>
            </article>
          ))
        ) : (
          <EmptyBlock title="Empty transcript">
            No persisted messages were found for this session.
          </EmptyBlock>
        )}
      </div>
    </>
  );
}
