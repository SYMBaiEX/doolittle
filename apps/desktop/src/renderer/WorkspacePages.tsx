import {
  type ChangeEvent,
  type FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  SessionMessagesResponse,
  SessionSearchResponse,
  SessionSummary,
  SessionUsageSummary,
} from "../shared/contracts";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  compactNumber,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  PageHeader,
  useApiResource,
} from "./lib";

interface SessionSummaryResponse {
  summary?: SessionSummary;
}

interface SessionUsageResponse {
  usage?: SessionUsageSummary;
}

interface SessionContinuityResponse {
  sessions?: SessionSummary[];
}

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
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [transferring, setTransferring] = useState(false);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const searchPath =
    active && query.trim() && projectId !== null
      ? `/sessions/search?query=${encodeURIComponent(query.trim())}&limit=25${
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
    if (!query.trim() || !searchHitsBySession.size) {
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
  }, [localFiltered, query, searchHitsBySession, sessions]);
  const selected =
    filtered.find((session) => session.sessionId === selectedId) ??
    sessions.find((session) => session.sessionId === selectedId) ??
    filtered[0] ??
    sessions[0];
  const transcript = useApiResource<SessionMessagesResponse>(
    active && selected?.sessionId
      ? `/sessions/messages?sessionId=${encodeURIComponent(selected.sessionId)}&limit=500`
      : null,
    [selected?.sessionId],
  );
  const summary = useApiResource<SessionSummaryResponse>(
    active && selected?.sessionId
      ? `/sessions/summary?sessionId=${encodeURIComponent(selected.sessionId)}`
      : null,
    [selected?.sessionId],
  );
  const usage = useApiResource<SessionUsageResponse>(
    active && selected?.sessionId
      ? `/sessions/usage?sessionId=${encodeURIComponent(selected.sessionId)}`
      : null,
    [selected?.sessionId],
  );
  const continuity = useApiResource<SessionContinuityResponse>(
    active && selected?.sessionId
      ? `/sessions/continuity?sessionId=${encodeURIComponent(selected.sessionId)}&limit=8`
      : null,
    [selected?.sessionId],
  );

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!selected || !nextTitle) return;
    setMutationError("");
    try {
      await desktopRequest("/sessions/title", "POST", {
        sessionId: selected.sessionId,
        title: nextTitle,
      });
      setEditing(false);
      setTitle("");
      refresh();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  const exportArchive = async () => {
    if (!selected || transferring) return;
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
    if (!file || transferring) return;
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
              disabled={transferring}
              onClick={() => archiveInputRef.current?.click()}
              type="button"
            >
              Import archive
            </button>
            <button
              className="secondary-button"
              onClick={refresh}
              type="button"
            >
              Refresh
            </button>
          </>
        }
      />
      {transferStatus ? (
        <div aria-live="polite" className="notice neutral" role="status">
          {transferStatus}
        </div>
      ) : null}
      <div className="split-workspace">
        <section className="list-panel">
          <label className="search-field">
            <span className="sr-only">Search sessions</span>
            <input
              placeholder="Search conversations or message text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {query.trim() ? (
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
          <div className="list-scroll">
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
          </div>
        </section>
        <section className="detail-panel">
          {!selected ? (
            <EmptyBlock title="No sessions yet">
              Your saved conversations will appear here.
            </EmptyBlock>
          ) : (
            <>
              <div className="detail-toolbar">
                <div>
                  <span className="eyebrow">Transcript</span>
                  <h2>
                    {selected.title ||
                      selected.preview?.[0] ||
                      "Untitled conversation"}
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
                    onClick={() => void exportArchive()}
                    type="button"
                  >
                    {transferring ? "Working…" : "Export portable archive"}
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => openChat(selected.sessionId)}
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
              <div className="metric-grid compact" style={{ margin: "16px 0" }}>
                <MetricCard
                  label="Messages"
                  value={compactNumber(
                    usage.data?.usage?.messageCount ??
                      selected.messageCount ??
                      0,
                  )}
                  detail={`Updated ${displayTimestamp(
                    usage.data?.usage?.endedAt ?? selected.endedAt,
                  )}`}
                />
                <MetricCard
                  label="Estimated tokens"
                  value={compactNumber(usage.data?.usage?.estimatedTokens ?? 0)}
                  detail={`${compactNumber(
                    usage.data?.usage?.characterCount ?? 0,
                  )} characters`}
                />
                <MetricCard
                  label="Participants"
                  value={selected.participants.length || 0}
                  detail={selected.participants.join(", ") || "local session"}
                />
                <MetricCard
                  label="Continuity"
                  value={continuity.data?.sessions?.length ?? 0}
                  detail={
                    summary.data?.summary?.continuityKey || "No continuity key"
                  }
                />
              </div>
              <div className="two-column-grid" style={{ marginBottom: "16px" }}>
                <section className="content-card">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">Summary</span>
                      <h2>Session metadata</h2>
                    </div>
                  </div>
                  {summary.loading ? (
                    <LoadingBlock />
                  ) : summary.error ? (
                    <ErrorBlock error={summary.error} retry={summary.reload} />
                  ) : (
                    <div className="stack-list">
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
                            <small>
                              {summary.data.summary.parentSessionId}
                            </small>
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
                            <small>
                              {summary.data.summary.forkedFromMessageId}
                            </small>
                          </div>
                        </div>
                      ) : null}
                      <div className="status-row">
                        <div>
                          <strong>Started</strong>
                          <small>
                            {displayTimestamp(
                              summary.data?.summary?.startedAt ??
                                selected.startedAt,
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
                    </div>
                  )}
                </section>
                <section className="content-card">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">Continuity</span>
                      <h2>Related sessions</h2>
                    </div>
                  </div>
                  {continuity.loading ? (
                    <LoadingBlock />
                  ) : continuity.error ? (
                    <ErrorBlock
                      error={continuity.error}
                      retry={continuity.reload}
                    />
                  ) : continuity.data?.sessions?.length ? (
                    <div className="stack-list">
                      {continuity.data.sessions.map((session) => (
                        <button
                          className="status-row"
                          key={session.sessionId}
                          onClick={() => setSelectedId(session.sessionId)}
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
                </section>
              </div>
              <div className="transcript">
                {transcript.loading ? (
                  <LoadingBlock label="Loading transcript…" />
                ) : transcript.error ? (
                  <ErrorBlock
                    error={transcript.error}
                    retry={transcript.reload}
                  />
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
          )}
        </section>
      </div>
    </div>
  );
}

interface AnalyticsResponse {
  totals?: {
    sessions?: number;
    messages?: number;
    estimatedTokens?: number;
    userMessages?: number;
    assistantMessages?: number;
    systemMessages?: number;
  };
  recentSessions?: unknown[];
  dailyActivity?: unknown[];
}

export function AnalyticsPage({ active }: { active: boolean }) {
  const resource = useApiResource<AnalyticsResponse>(
    active ? "/analytics" : null,
    [active],
  );
  const totals = resource.data?.totals ?? {};
  const activity = asArray(resource.data?.dailyActivity).map((value) =>
    asRecord(value),
  );
  const maxMessages = Math.max(
    1,
    ...activity.map((entry) =>
      asNumber(entry.messages, asNumber(entry.messageCount)),
    ),
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Real local session activity and estimated context usage—no remote telemetry."
        actions={
          <button
            className="secondary-button"
            onClick={resource.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {resource.loading ? (
        <LoadingBlock label="Calculating local activity…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : (
        <>
          <div className="metric-grid">
            <MetricCard
              label="Sessions"
              value={compactNumber(totals.sessions ?? 0)}
              detail="persisted locally"
            />
            <MetricCard
              label="Messages"
              value={compactNumber(totals.messages ?? 0)}
              detail={`${compactNumber(totals.userMessages ?? 0)} from you`}
            />
            <MetricCard
              label="Estimated tokens"
              value={compactNumber(totals.estimatedTokens ?? 0)}
              detail="character-based estimate"
            />
            <MetricCard
              label="Assistant replies"
              value={compactNumber(totals.assistantMessages ?? 0)}
              detail={`${compactNumber(totals.systemMessages ?? 0)} system events`}
            />
          </div>
          <section className="content-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Recent activity</span>
                <h2>Messages by day</h2>
              </div>
            </div>
            {activity.length ? (
              <div
                className="bar-chart"
                aria-label="Messages by day"
                role="img"
              >
                {activity.map((entry) => {
                  const messages = asNumber(
                    entry.messages,
                    asNumber(entry.messageCount),
                  );
                  const label = asString(
                    entry.date,
                    asString(entry.day, "No date"),
                  );
                  return (
                    <div
                      className="bar-column"
                      key={`${label}:${JSON.stringify(entry)}`}
                    >
                      <span className="bar-value">{messages}</span>
                      <div className="bar-track">
                        <i
                          style={{
                            height: `${Math.max(4, (messages / maxMessages) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>{label.slice(5) || label}</small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyBlock title="No activity yet">
                Start chatting with Doolittle and activity will accumulate here.
              </EmptyBlock>
            )}
          </section>
          <section className="content-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Conversations</span>
                <h2>Recent session usage</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Messages</th>
                    <th>Est. tokens</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {asArray(resource.data?.recentSessions).map(
                    (value, index) => {
                      const entry = asRecord(value);
                      return (
                        <tr key={asString(entry.sessionId, String(index))}>
                          <td>
                            {asString(
                              entry.title,
                              asString(entry.sessionId, "Untitled"),
                            )}
                          </td>
                          <td>{asNumber(entry.messageCount)}</td>
                          <td>
                            {compactNumber(asNumber(entry.estimatedTokens))}
                          </td>
                          <td>
                            {displayTimestamp(
                              asString(entry.endedAt) || undefined,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
