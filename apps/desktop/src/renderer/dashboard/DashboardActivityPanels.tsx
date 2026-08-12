import type {
  DashboardApprovalCard,
  DashboardSessionCard,
  DashboardTaskCard,
} from "../dashboard-helpers";
import { Badge, displayTimestamp, ErrorBlock, LoadingBlock } from "../lib";

export function DashboardActivityPanels({
  approvals,
  approvalsError,
  approvalsLoading,
  onOpenChat,
  onOpenReview,
  onOpenTasks,
  reloadApprovals,
  reloadTasks,
  sessions,
  tasks,
  tasksError,
  tasksLoading,
}: {
  approvals: DashboardApprovalCard[];
  approvalsError: string;
  approvalsLoading: boolean;
  onOpenChat?: (sessionId?: string) => void;
  onOpenReview?: () => void;
  onOpenTasks?: () => void;
  reloadApprovals: () => void;
  reloadTasks: () => void;
  sessions: DashboardSessionCard[];
  tasks: DashboardTaskCard[];
  tasksError: string;
  tasksLoading: boolean;
}) {
  const executionHasContent =
    approvals.length > 0 ||
    tasks.length > 0 ||
    approvalsLoading ||
    tasksLoading ||
    Boolean(approvalsError) ||
    Boolean(tasksError);

  return (
    <div className="dashboard-mini-grid">
      <section
        className={`content-card${sessions.length ? "" : " dashboard-quiet-card"}`}
      >
        <div className="card-heading">
          <div>
            <span className="eyebrow">Recent conversations</span>
            <h2>{sessions.length ? "Sessions" : "No saved sessions"}</h2>
            {sessions.length ? null : (
              <small>Start a conversation to build local history.</small>
            )}
          </div>
          <button
            className="text-button"
            disabled={!onOpenChat}
            onClick={() => onOpenChat?.()}
            type="button"
          >
            Open chat
          </button>
        </div>
        {sessions.length ? (
          <div className="stack-list">
            {sessions.map((session) => (
              <button
                className="row-card dashboard-session-button"
                key={session.id}
                onClick={() => onOpenChat?.(session.id)}
                type="button"
              >
                <span className="row-card-main">
                  <strong>{session.title}</strong>
                  <small>{session.preview}</small>
                </span>
                <span className="row-card-meta">
                  <small>{session.messageCount} messages</small>
                  <small>{displayTimestamp(session.lastActivityLabel)}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section
        className={`content-card${executionHasContent ? "" : " dashboard-quiet-card"}`}
      >
        <div className="card-heading">
          <div>
            <span className="eyebrow">Execution queue</span>
            <h2>
              {executionHasContent ? "Approvals and tasks" : "Queue clear"}
            </h2>
            {executionHasContent ? null : (
              <small>No approvals or delegated tasks need attention.</small>
            )}
          </div>
          <div className="page-actions">
            <button
              className="text-button"
              disabled={!onOpenReview}
              onClick={onOpenReview}
              type="button"
            >
              Review
            </button>
            <button
              className="text-button"
              disabled={!onOpenTasks}
              onClick={onOpenTasks}
              type="button"
            >
              Tasks
            </button>
          </div>
        </div>
        {executionHasContent ? (
          <>
            <div className="stack-list">
              {approvals.slice(0, 3).map((approval) => (
                <div className="status-row" key={approval.id}>
                  <div>
                    <strong>{approval.command}</strong>
                    <small>
                      {approval.reason} · expires{" "}
                      {displayTimestamp(approval.expiresAt)}
                    </small>
                  </div>
                  <Badge tone="warn">pending</Badge>
                </div>
              ))}
              {tasks.slice(0, 4).map((task) => (
                <div className="status-row" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.profile} · {task.priority} · {task.executionMode} ·{" "}
                      {displayTimestamp(task.updatedAt)}
                    </small>
                  </div>
                  <Badge tone={task.status === "running" ? "good" : "neutral"}>
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
            {approvalsLoading || tasksLoading ? <LoadingBlock /> : null}
            {approvalsError ? (
              <ErrorBlock error={approvalsError} retry={reloadApprovals} />
            ) : null}
            {tasksError ? (
              <ErrorBlock error={tasksError} retry={reloadTasks} />
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
