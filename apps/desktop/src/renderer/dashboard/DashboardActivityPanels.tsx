import { CheckCircle2, ListTodo, MessageSquare, Plus } from "lucide-react";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import type {
  DashboardApprovalCard,
  DashboardSessionCard,
  DashboardTaskCard,
} from "../dashboard-helpers";
import { Badge, displayTimestamp, ErrorBlock, LoadingBlock } from "../lib";
import {
  DASHBOARD_SPLIT_CLASS,
  DASHBOARD_STATUS_ROW_CLASS,
} from "./dashboard-layout";

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
    <div className={DASHBOARD_SPLIT_CLASS}>
      <WorkbenchSection
        actions={
          onOpenChat ? (
            <WorkbenchAction
              emphasis="quiet"
              icon={MessageSquare}
              onClick={() => onOpenChat()}
            >
              Open chat
            </WorkbenchAction>
          ) : undefined
        }
        icon={MessageSquare}
        title="Recent conversations"
      >
        {sessions.length ? (
          <div className="grid">
            {sessions.map((session) => (
              <button
                className="grid min-h-[46px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-xs)] p-2 text-left hover:bg-[var(--surface-hover)]"
                data-dashboard-session="true"
                disabled={!onOpenChat}
                key={session.id}
                onClick={() => onOpenChat?.(session.id)}
                type="button"
              >
                <span className="grid min-w-0 gap-0.5 [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap">
                  <strong>{session.title}</strong>
                  <small>{session.preview}</small>
                </span>
                <span className="grid justify-items-end gap-0.5 [&_small]:font-[var(--font-mono)] [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)]">
                  <small>{session.messageCount} messages</small>
                  <small>{displayTimestamp(session.lastActivityLabel)}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <WorkbenchEmpty icon={Plus} title="No saved conversations" />
        )}
      </WorkbenchSection>

      <WorkbenchSection
        actions={
          <>
            <WorkbenchAction
              disabled={!onOpenReview}
              emphasis="quiet"
              onClick={onOpenReview}
            >
              Review
            </WorkbenchAction>
            <WorkbenchAction
              disabled={!onOpenTasks}
              emphasis="quiet"
              onClick={onOpenTasks}
            >
              Tasks
            </WorkbenchAction>
          </>
        }
        icon={ListTodo}
        title="Approvals and tasks"
      >
        {executionHasContent ? (
          <>
            <div className="grid">
              {approvals.slice(0, 3).map((approval) => (
                <div className={DASHBOARD_STATUS_ROW_CLASS} key={approval.id}>
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
                <div className={DASHBOARD_STATUS_ROW_CLASS} key={task.id}>
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
        ) : (
          <WorkbenchEmpty icon={CheckCircle2} title="Nothing needs attention">
            Pending approvals and delegated tasks appear here.
          </WorkbenchEmpty>
        )}
      </WorkbenchSection>
    </div>
  );
}
