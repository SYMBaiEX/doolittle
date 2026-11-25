import { ContextActionMenu } from "@doolittle/ui";
import { type FormEvent, useRef } from "react";
import { copyContextText } from "../context-menu-clipboard";
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
import { statusTier, type WorkTier } from "../work-surface/status";
import {
  DetailFacts,
  DetailHeader,
  FactRow,
  WorkActions,
  WorkCard,
  WorkCards,
  WorkConfirm,
  WorkDisclosure,
  WorkTag,
} from "../work-surface/WorkSurface";
import { compactWorkspacePath } from "../workspace-path";
import { orchestrationClass as oc } from "./layout";
import type { ConfirmedAction, TaskAction } from "./models";

function tagTone(tier: WorkTier): "good" | "warn" | "bad" | "neutral" {
  if (tier === "done") return "good";
  if (tier === "attention") return "warn";
  if (tier === "failed") return "bad";
  return "neutral";
}

export type TaskQueueDetailProps = {
  active: boolean;
  busyKeys: Readonly<Record<string, boolean>>;
  childObjective: string;
  childTitle: string;
  childWorkspaceRoot: string;
  confirmedAction: ConfirmedAction | null;
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
  childObjective,
  childTitle,
  childWorkspaceRoot,
  confirmedAction,
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
  const tier = statusTier(status);
  const notes = asArray(selectedTask.notes);
  const overflowActionsRef = useRef<HTMLButtonElement>(null);
  const requestDestructiveAction = (action: "cancel" | "fail") => {
    const button = overflowActionsRef.current;
    if (!button) return;
    onRequestDestructiveAction(selectedTask, action, button);
  };
  return (
    <ContextActionMenu
      label="Task actions"
      scopeKey={`task:${selectedTask.id}:${status}`}
      items={[
        ...(["execute", "complete", "retry"] as const).map((action) => ({
          id: action,
          label:
            action === "execute"
              ? "Execute"
              : action === "complete"
                ? "Complete"
                : "Retry",
          disabled: !active || busyKeys[`task:${selectedTask.id}:${action}`],
          onSelect: () => onRunTaskAction(selectedTask, action),
        })),
        {
          id: "child",
          label: "Add child",
          disabled: !active || !taskDetailReady,
          onSelect: () => onToggleChildCreate(selectedTask),
        },
        {
          id: "copy-id",
          label: "Copy task ID",
          onSelect: () => void copyContextText(selectedTask.id),
        },
        {
          id: "fail",
          label: "Mark failed…",
          destructive: true,
          separatorBefore: true,
          disabled: !active || busyKeys[`task:${selectedTask.id}:fail`],
          onSelect: () => {
            requestDestructiveAction("fail");
          },
        },
        {
          id: "cancel",
          label: "Cancel…",
          destructive: true,
          disabled: !active || busyKeys[`task:${selectedTask.id}:cancel`],
          onSelect: () => {
            requestDestructiveAction("cancel");
          },
        },
      ]}
    >
      <DetailHeader
        kicker={`${asString(selectedTask.group, "ungrouped")} / ${taskCapabilityLabel(
          selectedTask.capabilityProfile,
          selectedTask.kind,
        )} · ${asString(
          selectedTask.framework,
          selectedTask.profile || "automatic",
        )}`}
        objective={selectedTask.objective}
        status={<Badge tone={tagTone(tier)}>{status}</Badge>}
        tags={
          <>
            <WorkTag tone={tagTone(tier)}>
              {orchestrationTimingLabel({
                status,
                startedAt: asString(selectedTask.startedAt),
                completedAt: asString(selectedTask.completedAt),
                updatedAt: asString(selectedTask.updatedAt),
                createdAt: asString(selectedTask.createdAt),
              })}
            </WorkTag>
            <WorkTag>{taskExecutionLabel(selectedTask.executionMode)}</WorkTag>
            <WorkTag>
              {asString(selectedTask.priority, "normal")} priority
            </WorkTag>
            <WorkTag>
              {selectedTask.workspaceRoot
                ? compactWorkspacePath(selectedTask.workspaceRoot)
                : "current workspace"}
            </WorkTag>
            <WorkTag>
              {selectedTask.accountLabel || selectedTask.accountId
                ? `account ${
                    selectedTask.accountLabel || selectedTask.accountId
                  }`
                : "automatic account routing"}
            </WorkTag>
          </>
        }
        title={selectedTask.title}
      />

      <WorkActions
        primary={(["execute", "complete"] as const).map((action) => (
          <button
            className={
              action === "execute" ? "primary-button" : "secondary-button"
            }
            type="button"
            key={action}
            onClick={() => onRunTaskAction(selectedTask, action)}
            disabled={!active || busyKeys[`task:${selectedTask.id}:${action}`]}
          >
            {action === "execute" ? "Execute" : "Complete"}
          </button>
        ))}
        secondary={
          <>
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
            <ContextActionMenu
              label="More task actions"
              scopeKey={`task-overflow:${selectedTask.id}:${status}`}
              items={[
                {
                  id: "fail",
                  label: "Mark failed",
                  destructive: true,
                  disabled: !active || busyKeys[`task:${selectedTask.id}:fail`],
                  onSelect: () => requestDestructiveAction("fail"),
                },
                {
                  id: "cancel",
                  label: "Cancel",
                  destructive: true,
                  disabled:
                    !active || busyKeys[`task:${selectedTask.id}:cancel`],
                  onSelect: () => requestDestructiveAction("cancel"),
                },
              ]}
              trigger={
                <button
                  className="ws-overflow-trigger"
                  ref={overflowActionsRef}
                  type="button"
                >
                  More
                </button>
              }
            >
              {null}
            </ContextActionMenu>
          </>
        }
      />

      {confirmedAction?.taskId === selectedTask.id ? (
        <WorkConfirm
          cancelLabel="Keep task"
          confirmDisabled={!active}
          confirmLabel={`Confirm ${confirmedAction.action}`}
          detail="This changes this task's state. Child tasks are unchanged."
          onCancel={onCloseConfirmation}
          onConfirm={() =>
            onRunTaskAction(selectedTask, confirmedAction.action)
          }
          title={
            confirmedAction.action === "fail"
              ? "Mark this task failed?"
              : "Cancel this task?"
          }
        />
      ) : null}

      {showChildCreate ? (
        <form
          className={oc("orchestration-inline-form")}
          onSubmit={onSubmitSpawn}
        >
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

      <WorkCards>
        <WorkCard kicker="Evidence">
          {selectedTask.lastOutputPath ? (
            <code>{selectedTask.lastOutputPath}</code>
          ) : (
            <p className="ws-empty-line">No artifact path reported.</p>
          )}
        </WorkCard>
        <WorkCard kicker="Task notes">
          {notes.length > 0 ? (
            <ul>
              {notes.slice(-5).map((note) => (
                <li key={`${selectedTask.id}:note:${asString(note)}`}>
                  {asString(note)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-empty-line">No notes recorded.</p>
          )}
          <form
            className={oc("orchestration-note-composer")}
            onSubmit={onSubmitNote}
          >
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
        </WorkCard>
      </WorkCards>

      <WorkDisclosure
        aside={`${asNumber(selectedTask.attempts)} / ${asNumber(
          selectedTask.maxAttempts,
          1,
        )} attempts`}
        detail="IDs, session, account, and runtime diagnostics"
        summary="Execution details"
      >
        <DetailFacts>
          <FactRow label="Task ID">{selectedTask.id}</FactRow>
          <FactRow label="Attempts">
            {asNumber(selectedTask.attempts)} /{" "}
            {asNumber(selectedTask.maxAttempts, 1)}
          </FactRow>
          <FactRow label="Priority">
            {asString(selectedTask.priority, "normal")}
          </FactRow>
          <FactRow label="Execution">
            {taskExecutionLabel(selectedTask.executionMode)}
          </FactRow>
          <FactRow label="Capability">
            {taskCapabilityLabel(
              selectedTask.capabilityProfile,
              selectedTask.kind,
            )}
          </FactRow>
          <FactRow label="Framework">
            {asString(selectedTask.framework, "automatic")}
          </FactRow>
          <FactRow label="Account provider">
            {asString(selectedTask.accountProviderId, "automatic")}
          </FactRow>
          <FactRow label="Account">
            {asString(
              selectedTask.accountLabel,
              asString(selectedTask.accountId, "automatic"),
            )}
          </FactRow>
          <FactRow label="Session">
            {asString(selectedTask.sessionId, "not assigned")}
          </FactRow>
          <FactRow label="Execution root">
            {selectedTask.workspaceRoot
              ? compactWorkspacePath(selectedTask.workspaceRoot)
              : "current workspace"}
          </FactRow>
          <FactRow label="Updated">
            {displayTimestamp(asString(selectedTask.updatedAt))}
          </FactRow>
          <FactRow label="Worker PID">{selectedTask.workerPid}</FactRow>
        </DetailFacts>
      </WorkDisclosure>
    </ContextActionMenu>
  );
}
