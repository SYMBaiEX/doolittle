import { type FormEvent, type RefObject, useState } from "react";
import { progressiveWindow } from "../components/progressive-window";
import {
  asArray,
  asNumber,
  asString,
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  type UnknownRecord,
} from "../lib";
import {
  orchestrationStatusTier,
  orchestrationTimingLabel,
  taskCapabilityLabel,
  taskExecutionLabel,
} from "../orchestration-helpers";
import type {
  DelegationTaskRecord,
  RepositoryWorktreeRecord,
} from "../orchestration-resources";
import { compactWorkspacePath } from "../workspace-path";
import {
  DetailRow,
  DetailTag,
  SmallEmpty,
  statusTone,
} from "./detail-primitives";
import type { ConfirmedAction, ResourceState, TaskAction } from "./models";
import { normalizeText } from "./models";

export const TASK_QUEUE_PAGE_SIZE = 20;

export function TaskQueuePanel({
  active,
  projectScope,
  workspaceLabel,
  effectiveOverview,
  tasksResource,
  tasks,
  selectedTask,
  busyKeys,
  selectedTaskNote,
  showChildCreate,
  childTitle,
  childObjective,
  childWorkspaceRoot,
  worktrees,
  confirmedAction,
  cascadeChildren,
  confirmDialogRef,
  onSelectTask,
  onRunTaskAction,
  onRequestDestructiveAction,
  onCloseConfirmation,
  onCascadeChildrenChange,
  onToggleChildCreate,
  onChildTitleChange,
  onChildObjectiveChange,
  onChildWorkspaceRootChange,
  onSubmitSpawn,
  onTaskNoteChange,
  onSubmitNote,
  onNewCodingTask,
}: {
  active: boolean;
  projectScope: string;
  workspaceLabel?: string;
  effectiveOverview: UnknownRecord;
  tasksResource: ResourceState;
  tasks: readonly DelegationTaskRecord[];
  selectedTask?: DelegationTaskRecord;
  busyKeys: Readonly<Record<string, boolean>>;
  selectedTaskNote: string;
  showChildCreate: boolean;
  childTitle: string;
  childObjective: string;
  childWorkspaceRoot: string;
  worktrees: readonly RepositoryWorktreeRecord[];
  confirmedAction: ConfirmedAction | null;
  cascadeChildren: boolean;
  confirmDialogRef: RefObject<HTMLDivElement | null>;
  onSelectTask: (task: DelegationTaskRecord) => void;
  onRunTaskAction: (task: DelegationTaskRecord, action: TaskAction) => void;
  onRequestDestructiveAction: (
    task: DelegationTaskRecord,
    action: "cancel" | "fail",
    returnTarget: HTMLButtonElement,
  ) => void;
  onCloseConfirmation: () => void;
  onCascadeChildrenChange: (value: boolean) => void;
  onToggleChildCreate: (task: DelegationTaskRecord) => void;
  onChildTitleChange: (value: string) => void;
  onChildObjectiveChange: (value: string) => void;
  onChildWorkspaceRootChange: (value: string) => void;
  onSubmitSpawn: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTaskNoteChange: (value: string, taskId: string) => void;
  onSubmitNote: (event: FormEvent<HTMLFormElement>) => void;
  onNewCodingTask?: () => void;
}) {
  const pageKey = `${projectScope}:${tasks.length}:${tasks[0]?.id ?? "empty"}`;
  const [page, setPage] = useState({
    key: pageKey,
    limit: TASK_QUEUE_PAGE_SIZE,
  });
  const requested = page.key === pageKey ? page.limit : TASK_QUEUE_PAGE_SIZE;
  const selectedIndex = selectedTask
    ? tasks.findIndex((task) => task.id === selectedTask.id)
    : -1;
  const taskWindow = progressiveWindow(tasks, {
    pageSize: TASK_QUEUE_PAGE_SIZE,
    requested,
    selectedIndex,
  });

  const renderTaskRail = () => {
    if (tasksResource.error) {
      return (
        <ErrorBlock error={tasksResource.error} retry={tasksResource.reload} />
      );
    }
    if (tasksResource.loading) return <LoadingBlock />;
    if (tasks.length === 0) {
      return (
        <EmptyBlock
          title={
            projectScope === "all"
              ? "No tasks yet"
              : `No tasks for ${workspaceLabel || "this project"}`
          }
          actions={
            onNewCodingTask ? (
              <button
                className="primary-button"
                disabled={!active}
                onClick={onNewCodingTask}
                type="button"
              >
                New coding task
              </button>
            ) : undefined
          }
        >
          Create a focused task to start an operator workflow in this workspace.
        </EmptyBlock>
      );
    }
    return (
      <ul className="orchestration-master-list">
        {taskWindow.visible.map((task) => {
          const status = asString(task.status, "pending");
          const tier = orchestrationStatusTier(status);
          return (
            <li key={task.id}>
              <button
                type="button"
                className={
                  task.id === selectedTask?.id
                    ? `orchestration-master-item selected tier-${tier}`
                    : `orchestration-master-item tier-${tier}`
                }
                aria-pressed={task.id === selectedTask?.id}
                onClick={() => onSelectTask(task)}
              >
                <span className="master-row master-row-top">
                  <span className="master-title-line">
                    <i className="master-status-dot" aria-hidden="true" />
                    <strong>{asString(task.title, "Untitled task")}</strong>
                  </span>
                  <Badge tone={statusTone(status)}>{status}</Badge>
                </span>
                <span className="master-summary">
                  {normalizeText(asString(task.objective), 92)}
                </span>
                <span className="master-row master-row-bottom">
                  <small>
                    {orchestrationTimingLabel({
                      status,
                      startedAt: asString(task.startedAt),
                      completedAt: asString(task.completedAt),
                      updatedAt: asString(task.updatedAt),
                      createdAt: asString(task.createdAt),
                    })}
                  </small>
                  <small>{asString(task.priority, "normal")} priority</small>
                  <small>
                    {taskCapabilityLabel(task.capabilityProfile, task.kind)}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
        {taskWindow.remaining ? (
          <li className="orchestration-master-footer">
            <span>
              Showing {taskWindow.visible.length} of {tasks.length}
            </span>
            <button
              className="secondary-button"
              onClick={() =>
                setPage({
                  key: pageKey,
                  limit: taskWindow.limit + TASK_QUEUE_PAGE_SIZE,
                })
              }
              type="button"
            >
              Show {Math.min(TASK_QUEUE_PAGE_SIZE, taskWindow.remaining)} more
            </button>
          </li>
        ) : null}
      </ul>
    );
  };

  return (
    <div className="orchestration-master-detail">
      <aside className="orchestration-master">
        <div className="orchestration-pane-heading">
          <span>Queue</span>
          <small>
            {asNumber(effectiveOverview.total)} total
            {projectScope === "all"
              ? ""
              : ` · ${workspaceLabel || "selected project"}`}
          </small>
        </div>
        <div className="orchestration-scroll">{renderTaskRail()}</div>
      </aside>

      <article className="orchestration-detail">
        {!selectedTask ? (
          <EmptyBlock title="Choose a task">
            Task controls and evidence appear here.
          </EmptyBlock>
        ) : (
          <TaskDetail
            active={active}
            busyKeys={busyKeys}
            cascadeChildren={cascadeChildren}
            childObjective={childObjective}
            childTitle={childTitle}
            childWorkspaceRoot={childWorkspaceRoot}
            confirmDialogRef={confirmDialogRef}
            confirmedAction={confirmedAction}
            onCascadeChildrenChange={onCascadeChildrenChange}
            onChildObjectiveChange={onChildObjectiveChange}
            onChildTitleChange={onChildTitleChange}
            onChildWorkspaceRootChange={onChildWorkspaceRootChange}
            onCloseConfirmation={onCloseConfirmation}
            onRequestDestructiveAction={onRequestDestructiveAction}
            onRunTaskAction={onRunTaskAction}
            onSubmitNote={onSubmitNote}
            onSubmitSpawn={onSubmitSpawn}
            onTaskNoteChange={onTaskNoteChange}
            onToggleChildCreate={onToggleChildCreate}
            selectedTask={selectedTask}
            selectedTaskNote={selectedTaskNote}
            showChildCreate={showChildCreate}
            worktrees={worktrees}
          />
        )}
      </article>
    </div>
  );
}

function TaskDetail({
  active,
  busyKeys,
  cascadeChildren,
  childObjective,
  childTitle,
  childWorkspaceRoot,
  confirmDialogRef,
  confirmedAction,
  onCascadeChildrenChange,
  onChildObjectiveChange,
  onChildTitleChange,
  onChildWorkspaceRootChange,
  onCloseConfirmation,
  onRequestDestructiveAction,
  onRunTaskAction,
  onSubmitNote,
  onSubmitSpawn,
  onTaskNoteChange,
  onToggleChildCreate,
  selectedTask,
  selectedTaskNote,
  showChildCreate,
  worktrees,
}: {
  active: boolean;
  busyKeys: Readonly<Record<string, boolean>>;
  cascadeChildren: boolean;
  childObjective: string;
  childTitle: string;
  childWorkspaceRoot: string;
  confirmDialogRef: RefObject<HTMLDivElement | null>;
  confirmedAction: ConfirmedAction | null;
  onCascadeChildrenChange: (value: boolean) => void;
  onChildObjectiveChange: (value: string) => void;
  onChildTitleChange: (value: string) => void;
  onChildWorkspaceRootChange: (value: string) => void;
  onCloseConfirmation: () => void;
  onRequestDestructiveAction: (
    task: DelegationTaskRecord,
    action: "cancel" | "fail",
    returnTarget: HTMLButtonElement,
  ) => void;
  onRunTaskAction: (task: DelegationTaskRecord, action: TaskAction) => void;
  onSubmitNote: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitSpawn: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTaskNoteChange: (value: string, taskId: string) => void;
  onToggleChildCreate: (task: DelegationTaskRecord) => void;
  selectedTask: DelegationTaskRecord;
  selectedTaskNote: string;
  showChildCreate: boolean;
  worktrees: readonly RepositoryWorktreeRecord[];
}) {
  const status = asString(selectedTask.status, "pending");
  return (
    <>
      <div className="orchestration-detail-header">
        <div>
          <span className="detail-kicker">
            {asString(selectedTask.group, "ungrouped")} /{" "}
            {taskCapabilityLabel(
              selectedTask.capabilityProfile,
              selectedTask.kind,
            )}{" "}
            ·{" "}
            {asString(
              selectedTask.framework,
              selectedTask.profile || "automatic",
            )}
          </span>
          <h2>{selectedTask.title}</h2>
          <p>{selectedTask.objective}</p>
        </div>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </div>

      <div className="orchestration-detail-tags">
        <DetailTag tone={statusTone(status)}>
          {orchestrationTimingLabel({
            status,
            startedAt: asString(selectedTask.startedAt),
            completedAt: asString(selectedTask.completedAt),
            updatedAt: asString(selectedTask.updatedAt),
            createdAt: asString(selectedTask.createdAt),
          })}
        </DetailTag>
        <DetailTag>{taskExecutionLabel(selectedTask.executionMode)}</DetailTag>
        <DetailTag>
          {asString(selectedTask.priority, "normal")} priority
        </DetailTag>
        <DetailTag>
          {selectedTask.workerPid
            ? `PID ${selectedTask.workerPid}`
            : "No live worker"}
        </DetailTag>
        <DetailTag>
          {selectedTask.accountLabel || selectedTask.accountId
            ? `account ${selectedTask.accountLabel || selectedTask.accountId}`
            : "automatic account routing"}
        </DetailTag>
      </div>

      <div className="orchestration-action-deck">
        <div className="orchestration-action-main">
          {(["execute", "run", "complete"] as const).map((action) => (
            <button
              className={
                action === "execute" ? "primary-button" : "secondary-button"
              }
              type="button"
              key={action}
              onClick={() => onRunTaskAction(selectedTask, action)}
              disabled={
                !active || busyKeys[`task:${selectedTask.id}:${action}`]
              }
            >
              {action === "execute"
                ? "Execute"
                : action === "run"
                  ? "Mark running"
                  : "Complete"}
            </button>
          ))}
        </div>
        <div className="orchestration-action-secondary">
          <button
            className="text-button"
            type="button"
            onClick={() => onRunTaskAction(selectedTask, "retry")}
            disabled={!active || busyKeys[`task:${selectedTask.id}:retry`]}
          >
            Retry
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => onToggleChildCreate(selectedTask)}
            aria-expanded={showChildCreate}
            disabled={!active}
          >
            Add child
          </button>
          <button
            className="text-button danger-text-button"
            type="button"
            onClick={(event) =>
              onRequestDestructiveAction(
                selectedTask,
                "fail",
                event.currentTarget,
              )
            }
            disabled={!active || busyKeys[`task:${selectedTask.id}:fail`]}
          >
            Mark failed
          </button>
          <button
            className="text-button danger-text-button"
            type="button"
            onClick={(event) =>
              onRequestDestructiveAction(
                selectedTask,
                "cancel",
                event.currentTarget,
              )
            }
            disabled={!active || busyKeys[`task:${selectedTask.id}:cancel`]}
          >
            Cancel
          </button>
        </div>
      </div>

      {confirmedAction?.taskId === selectedTask.id ? (
        <div
          className="orchestration-confirm"
          aria-live="polite"
          ref={confirmDialogRef}
          tabIndex={-1}
        >
          <div>
            <strong id="task-confirm-title">
              {confirmedAction.action === "fail"
                ? "Mark this task failed?"
                : "Cancel this task?"}
            </strong>
            <span id="task-confirm-description">
              This changes task state
              {cascadeChildren ? " and includes child tasks" : ""}.
            </span>
          </div>
          <label>
            <input
              type="checkbox"
              checked={cascadeChildren}
              onChange={(event) =>
                onCascadeChildrenChange(event.target.checked)
              }
            />
            Cascade to children
          </label>
          <button
            className="danger-button"
            type="button"
            onClick={() =>
              onRunTaskAction(selectedTask, confirmedAction.action)
            }
            disabled={!active}
          >
            Confirm {confirmedAction.action}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={onCloseConfirmation}
          >
            Keep task
          </button>
        </div>
      ) : null}

      {showChildCreate ? (
        <form className="orchestration-inline-form" onSubmit={onSubmitSpawn}>
          <label>
            <span>Child title</span>
            <input
              value={childTitle}
              onChange={(event) => onChildTitleChange(event.target.value)}
              placeholder="Child task"
              disabled={!active || busyKeys[`task:${selectedTask.id}:spawn`]}
            />
          </label>
          <label className="inline-form-wide">
            <span>Child objective</span>
            <input
              value={childObjective}
              onChange={(event) => onChildObjectiveChange(event.target.value)}
              placeholder="A bounded piece of the parent objective"
              required
              disabled={!active || busyKeys[`task:${selectedTask.id}:spawn`]}
            />
          </label>
          <label>
            <span>Execution worktree</span>
            <select
              aria-label="Child execution worktree"
              value={childWorkspaceRoot}
              onChange={(event) =>
                onChildWorkspaceRootChange(event.target.value)
              }
              disabled={!active || busyKeys[`task:${selectedTask.id}:spawn`]}
            >
              <option value="">Inherit parent worktree</option>
              {worktrees.map((worktree) => (
                <option key={worktree.path} value={worktree.path}>
                  {worktree.branch ??
                    (worktree.detached ? "detached" : "worktree")}{" "}
                  · {compactWorkspacePath(worktree.path)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            type="submit"
            disabled={
              !active ||
              !childObjective.trim() ||
              busyKeys[`task:${selectedTask.id}:spawn`]
            }
          >
            {busyKeys[`task:${selectedTask.id}:spawn`] ? "Spawning…" : "Spawn"}
          </button>
        </form>
      ) : null}

      <div className="orchestration-detail-grid">
        <dl>
          <DetailRow label="Task ID" value={selectedTask.id} />
          <DetailRow
            label="Attempts"
            value={`${asNumber(selectedTask.attempts)} / ${asNumber(
              selectedTask.maxAttempts,
              1,
            )}`}
          />
          <DetailRow
            label="Priority"
            value={asString(selectedTask.priority, "normal")}
          />
          <DetailRow
            label="Execution"
            value={taskExecutionLabel(selectedTask.executionMode)}
          />
          <DetailRow
            label="Capability"
            value={taskCapabilityLabel(
              selectedTask.capabilityProfile,
              selectedTask.kind,
            )}
          />
          <DetailRow
            label="Framework"
            value={asString(selectedTask.framework, "automatic")}
          />
          <DetailRow
            label="Account provider"
            value={asString(selectedTask.accountProviderId, "automatic")}
          />
          <DetailRow
            label="Account"
            value={asString(
              selectedTask.accountLabel,
              asString(selectedTask.accountId, "automatic"),
            )}
          />
          <DetailRow
            label="Session"
            value={asString(selectedTask.sessionId, "not assigned")}
          />
          <DetailRow
            label="Execution root"
            value={
              selectedTask.workspaceRoot
                ? compactWorkspacePath(selectedTask.workspaceRoot)
                : "current workspace"
            }
          />
          <DetailRow
            label="Updated"
            value={displayTimestamp(asString(selectedTask.updatedAt))}
          />
          <DetailRow label="Worker PID" value={selectedTask.workerPid} />
        </dl>
        <div className="orchestration-evidence">
          <span className="detail-kicker">Evidence</span>
          {selectedTask.lastOutputPath ? (
            <code>{selectedTask.lastOutputPath}</code>
          ) : (
            <SmallEmpty>No artifact path reported.</SmallEmpty>
          )}
          <span className="detail-kicker">Task notes</span>
          {asArray(selectedTask.notes).length > 0 ? (
            <ul>
              {asArray(selectedTask.notes)
                .slice(-5)
                .map((note) => (
                  <li key={`${selectedTask.id}:note:${asString(note)}`}>
                    {asString(note)}
                  </li>
                ))}
            </ul>
          ) : (
            <SmallEmpty>No notes recorded.</SmallEmpty>
          )}
        </div>
      </div>

      <form className="orchestration-note-composer" onSubmit={onSubmitNote}>
        <label>
          <span>Operator note</span>
          <textarea
            rows={2}
            value={selectedTaskNote}
            onChange={(event) =>
              onTaskNoteChange(event.target.value, selectedTask.id)
            }
            placeholder="Record context for this task. Notes stay isolated per task."
            disabled={!active || busyKeys[`task:${selectedTask.id}:note`]}
          />
        </label>
        <button
          className="secondary-button"
          type="submit"
          disabled={
            !active ||
            !selectedTaskNote.trim() ||
            busyKeys[`task:${selectedTask.id}:note`]
          }
        >
          {busyKeys[`task:${selectedTask.id}:note`] ? "Adding…" : "Add note"}
        </button>
      </form>
    </>
  );
}
