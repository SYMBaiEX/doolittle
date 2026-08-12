import type { FormEvent, RefObject } from "react";
import { asArray, asNumber, asString, Badge, displayTimestamp } from "../lib";
import {
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
import type { ConfirmedAction, TaskAction } from "./models";

export type TaskQueueDetailProps = {
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
  taskDetailReady: boolean;
  selectedTaskNote: string;
  showChildCreate: boolean;
  worktrees: readonly RepositoryWorktreeRecord[];
};

export function TaskQueueDetail({
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
  taskDetailReady,
  selectedTaskNote,
  showChildCreate,
  worktrees,
}: TaskQueueDetailProps) {
  const status = asString(selectedTask.status, "pending");
  const notes = asArray(selectedTask.notes);
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

      <div className="orchestration-detail-tags orchestration-detail-facts">
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
          {selectedTask.workspaceRoot
            ? compactWorkspacePath(selectedTask.workspaceRoot)
            : "current workspace"}
        </DetailTag>
        {selectedTask.workerPid ? (
          <DetailTag>PID {selectedTask.workerPid}</DetailTag>
        ) : null}
        <DetailTag>
          {selectedTask.accountLabel || selectedTask.accountId
            ? `account ${selectedTask.accountLabel || selectedTask.accountId}`
            : "automatic account routing"}
        </DetailTag>
      </div>

      <section className="orchestration-action-card">
        <span className="detail-kicker">Task controls</span>
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
              disabled={!active || !taskDetailReady}
              title={
                !taskDetailReady
                  ? "Loading task details before creating a child"
                  : undefined
              }
            >
              Add child
            </button>
            <details className="orchestration-action-overflow">
              <summary>More actions</summary>
              <div className="orchestration-action-overflow__body">
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
                  disabled={
                    !active || busyKeys[`task:${selectedTask.id}:cancel`]
                  }
                >
                  Cancel
                </button>
              </div>
            </details>
          </div>
        </div>
      </section>

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

      <div className="orchestration-task-workspace">
        <section className="orchestration-evidence orchestration-workspace-card">
          <span className="detail-kicker">Evidence</span>
          {selectedTask.lastOutputPath ? (
            <code>{selectedTask.lastOutputPath}</code>
          ) : (
            <SmallEmpty>No artifact path reported.</SmallEmpty>
          )}
        </section>
        <section className="orchestration-evidence orchestration-workspace-card">
          <span className="detail-kicker">Task notes</span>
          {notes.length > 0 ? (
            <ul>
              {notes.slice(-5).map((note) => (
                <li key={`${selectedTask.id}:note:${asString(note)}`}>
                  {asString(note)}
                </li>
              ))}
            </ul>
          ) : (
            <SmallEmpty>No notes recorded.</SmallEmpty>
          )}
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
              {busyKeys[`task:${selectedTask.id}:note`]
                ? "Adding…"
                : "Add note"}
            </button>
          </form>
        </section>
      </div>

      <details className="orchestration-task-diagnostics">
        <summary>
          <span>
            <strong>Execution details</strong>
            <small>IDs, session, account, and runtime diagnostics</small>
          </span>
          <small>
            {asNumber(selectedTask.attempts)} /{" "}
            {asNumber(selectedTask.maxAttempts, 1)} attempts
          </small>
        </summary>
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
      </details>
    </>
  );
}
