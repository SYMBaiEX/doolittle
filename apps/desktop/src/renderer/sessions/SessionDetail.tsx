import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { type FormEvent, useState } from "react";
import type {
  SessionMessagesResponse,
  SessionSummary,
  SessionUsageSummary,
  StoredMessage,
} from "../../shared/contracts";
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
import { compactSessionPreview } from "../session-preview";
import {
  SESSION_DETAIL_CLASS,
  SESSION_DETAIL_TOOLBAR_CLASS,
  SESSION_DISCLOSURE_CLASS,
  SESSION_DISCLOSURE_SUMMARY_CLASS,
  SESSION_STATUS_ROW_CLASS,
  SESSION_TRANSCRIPT_BODY_CLASS,
  SESSION_TRANSCRIPT_HEADER_CLASS,
  SESSION_TRANSCRIPT_LABEL_CLASS,
  SESSION_TRANSCRIPT_MESSAGE_CLASS,
  SESSION_TRANSCRIPT_PANEL_CLASS,
  SESSION_TRANSCRIPT_USER_BODY_CLASS,
  SESSION_TRANSCRIPT_USER_MESSAGE_CLASS,
} from "./sessions-layout";

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
    <article
      className={`${SESSION_TRANSCRIPT_MESSAGE_CLASS} ${message.role === "user" ? SESSION_TRANSCRIPT_USER_MESSAGE_CLASS : ""}`}
      data-message-role={message.role}
    >
      <div className={SESSION_TRANSCRIPT_LABEL_CLASS}>
        <strong>
          {message.role === "assistant"
            ? "Doolittle"
            : message.role === "user"
              ? "You"
              : "System"}
        </strong>
        <time>{displayTimestamp(message.createdAt)}</time>
      </div>
      <div
        className={`${SESSION_TRANSCRIPT_BODY_CLASS} ${message.role === "user" ? SESSION_TRANSCRIPT_USER_BODY_CLASS : ""}`}
      >
        <MessageContent
          content={message.text}
          separateAgentEvents={message.role === "assistant"}
        />
      </div>
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
    <div className={SESSION_DETAIL_CLASS} data-session-detail="true">
      <div className={SESSION_DETAIL_TOOLBAR_CLASS}>
        <div>
          <span className="eyebrow">Transcript</span>
          <h2>
            {compactSessionPreview(selected.title || "") ||
              compactSessionPreview(selected.preview?.[0] || "") ||
              "Untitled conversation"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 max-[860px]:justify-start">
          <Button
            onClick={() => {
              setTitle(selected.title ?? "");
              setEditing(true);
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            Rename
          </Button>
          <Button
            disabled={transferring}
            onClick={onExport}
            size="sm"
            type="button"
            variant="secondary"
          >
            {transferring ? "Working…" : "Export"}
          </Button>
          <Button
            onClick={() => onOpenChat(selected.sessionId)}
            size="sm"
            type="button"
          >
            Open in chat
          </Button>
        </div>
      </div>
      {editing ? (
        <form
          className="flex items-center gap-2 pt-3 max-[640px]:flex-wrap"
          onSubmit={rename}
        >
          <Input
            aria-label="Session title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button size="sm" type="submit">
            Save
          </Button>
          <Button
            onClick={() => setEditing(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </form>
      ) : null}
      {mutationError ? (
        <div className="inline-error">{mutationError}</div>
      ) : null}
      <div
        className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 border-y border-[var(--border-subtle)] py-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--text-muted)]"
        data-session-summary="true"
      >
        <span>
          {compactNumber(
            usage.data?.usage?.messageCount ?? selected.messageCount ?? 0,
          )}{" "}
          messages
        </span>
        <span>
          Updated{" "}
          {displayTimestamp(usage.data?.usage?.endedAt ?? selected.endedAt)}
        </span>
        <span title={selected.participants.join(", ") || "Local session"}>
          {selected.participants.length || 0} participants
        </span>
        {selected.parentSessionId ? <span>Branch conversation</span> : null}
      </div>
      <details
        className={SESSION_DISCLOSURE_CLASS}
        data-session-details="true"
        onToggle={(event) => setContinuityOpen(event.currentTarget.open)}
      >
        <summary className={SESSION_DISCLOSURE_SUMMARY_CLASS}>
          <span className="grid min-w-0 gap-px [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--text-muted)] [&_strong]:text-[10px] [&_strong]:text-[var(--text-strong)]">
            <strong>Conversation details</strong>
            <small>Technical metadata and related conversations</small>
          </span>
          <span className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            {continuityOpen
              ? continuity.loading
                ? "Loading…"
                : `${continuity.data?.sessions?.length ?? 0} related`
              : "Inspect"}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-x-4 border-[var(--border)] border-t p-2 max-[760px]:grid-cols-1">
          <div className="grid min-w-0">
            <div className={SESSION_STATUS_ROW_CLASS}>
              <div>
                <strong>Conversation id</strong>
                <small>{selected.sessionId}</small>
              </div>
            </div>
            {selected.parentSessionId ? (
              <div className={SESSION_STATUS_ROW_CLASS}>
                <div>
                  <strong>Parent branch</strong>
                  <small>{selected.parentSessionId}</small>
                </div>
              </div>
            ) : null}
            {selected.rootSessionId ? (
              <div className={SESSION_STATUS_ROW_CLASS}>
                <div>
                  <strong>Branch root</strong>
                  <small>{selected.rootSessionId}</small>
                </div>
              </div>
            ) : null}
            {selected.forkedFromMessageId ? (
              <div className={SESSION_STATUS_ROW_CLASS}>
                <div>
                  <strong>Fork anchor</strong>
                  <small>{selected.forkedFromMessageId}</small>
                </div>
              </div>
            ) : null}
            <div className={SESSION_STATUS_ROW_CLASS}>
              <div>
                <strong>Started</strong>
                <small>{displayTimestamp(selected.startedAt)}</small>
              </div>
            </div>
            <div className={SESSION_STATUS_ROW_CLASS}>
              <div>
                <strong>Estimated context</strong>
                <small>
                  {compactNumber(usage.data?.usage?.estimatedTokens ?? 0)}{" "}
                  tokens ·{" "}
                  {compactNumber(usage.data?.usage?.characterCount ?? 0)}{" "}
                  characters
                </small>
              </div>
            </div>
            <div className={SESSION_STATUS_ROW_CLASS}>
              <div>
                <strong>Latest preview</strong>
                <small>
                  {compactSessionPreview(selected.preview?.[0] ?? "") ||
                    "No preview"}
                </small>
              </div>
            </div>
          </div>
          <section aria-label="Related conversations" className="min-w-0">
            <div className="border-[var(--border-subtle)] border-b py-1.5 text-[length:var(--text-meta)] font-semibold text-[var(--text-soft)]">
              Related conversations
            </div>
            {continuityOpen && continuity.loading ? (
              <LoadingBlock />
            ) : continuityOpen && continuity.error ? (
              <ErrorBlock error={continuity.error} retry={continuity.reload} />
            ) : continuityOpen && continuity.data?.sessions?.length ? (
              <div className="grid">
                {continuity.data.sessions.map((session) => (
                  <button
                    className={SESSION_STATUS_ROW_CLASS}
                    key={session.sessionId}
                    onClick={() => onSelectSession(session.sessionId)}
                    type="button"
                  >
                    <div>
                      <strong>
                        {compactSessionPreview(session.title || "") ||
                          compactSessionPreview(session.preview?.[0] || "") ||
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
              <EmptyBlock title="No related conversations">
                This conversation does not currently have a continuity chain.
              </EmptyBlock>
            ) : (
              <p className="mb-0 text-[length:var(--text-meta)] text-[var(--text-muted)]">
                Open details to find related branches.
              </p>
            )}
          </section>
        </div>
      </details>
      <section className={SESSION_TRANSCRIPT_PANEL_CLASS}>
        <header className={SESSION_TRANSCRIPT_HEADER_CLASS}>
          <span>
            <strong>Messages</strong>
          </span>
          <small>{transcriptStatusLabel}</small>
        </header>
        <div className="grid gap-2 px-3 pt-2.5 pb-3">
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
