import { ClipboardList, Inbox, ListTodo } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { progressiveWindow } from "../components/progressive-window";
import {
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  asNumber,
  ErrorBlock,
  LoadingBlock,
  titleCase,
  type UnknownRecord,
} from "../lib";
import type {
  DelegationTaskRecord,
  RepositoryWorktreeRecord,
} from "../orchestration-resources";
import { statusTier } from "../work-surface/status";
import { WorkDetail, WorkRail, WorkSplit } from "../work-surface/WorkSurface";
import type {
  BulkTaskAction,
  ConfirmedAction,
  ResourceState,
  TaskAction,
} from "./models";
import { TaskQueueDetail } from "./TaskQueueDetail";
import { TaskQueueRail } from "./TaskQueueRail";
import {
  availableTaskQueueTiers,
  filterTaskQueue,
  type TaskQueueTier,
} from "./task-queue-model";

export const TASK_QUEUE_PAGE_SIZE = 20;

export function TaskQueuePanel({
  active,
  projectScope,
  workspaceLabel,
  effectiveOverview,
  tasksResource,
  taskDetailReady = false,
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
  onSelectTask,
  onRunTaskAction,
  onRunBulkTaskAction,
  onRequestDestructiveAction,
  onCloseConfirmation,
  onToggleChildCreate,
  onChildTitleChange,
  onChildObjectiveChange,
  onChildWorkspaceRootChange,
  onSubmitSpawn,
  onTaskNoteChange,
  onSubmitNote,
}: {
  active: boolean;
  projectScope: string;
  workspaceLabel?: string;
  effectiveOverview: UnknownRecord;
  tasksResource: ResourceState;
  taskDetailReady?: boolean;
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
  onSelectTask: (task: DelegationTaskRecord) => void;
  onRunTaskAction: (task: DelegationTaskRecord, action: TaskAction) => void;
  onRunBulkTaskAction: (
    tasks: readonly DelegationTaskRecord[],
    action: BulkTaskAction,
  ) => Promise<void>;
  onRequestDestructiveAction: (
    task: DelegationTaskRecord,
    action: "cancel" | "fail",
    returnTarget: HTMLButtonElement,
  ) => void;
  onCloseConfirmation: () => void;
  onToggleChildCreate: (task: DelegationTaskRecord) => void;
  onChildTitleChange: (value: string) => void;
  onChildObjectiveChange: (value: string) => void;
  onChildWorkspaceRootChange: (value: string) => void;
  onSubmitSpawn: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTaskNoteChange: (value: string, taskId: string) => void;
  onSubmitNote: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const pageKey = `${projectScope}:${tasks.length}:${tasks[0]?.id ?? "empty"}`;
  const [page, setPage] = useState({
    key: pageKey,
    limit: TASK_QUEUE_PAGE_SIZE,
  });
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const [tier, setTier] = useState<TaskQueueTier>("all");
  const [bulkAction, setBulkAction] = useState<BulkTaskAction | null>(null);
  const tiers = availableTaskQueueTiers(tasks);
  const effectiveTier = tiers.includes(tier) ? tier : "all";
  useEffect(() => {
    if (tier !== effectiveTier) setTier(effectiveTier);
  }, [effectiveTier, tier]);
  const filteredTasks = filterTaskQueue(tasks, {
    query,
    tier: effectiveTier,
  });
  const actionableTasks = filteredTasks.filter((task) => {
    const tier = statusTier(task.status ?? "pending");
    return tier !== "done" && tier !== "failed" && tier !== "muted";
  });
  const bulkBusy = bulkAction
    ? Boolean(busyKeys[`task:bulk:${bulkAction}`])
    : false;
  const filterKey = `${pageKey}:${effectiveTier}:${query.trim().toLocaleLowerCase()}`;
  const requested = page.key === filterKey ? page.limit : TASK_QUEUE_PAGE_SIZE;
  const selectedIndex = selectedTask
    ? filteredTasks.findIndex((task) => task.id === selectedTask.id)
    : -1;
  const taskWindow = progressiveWindow(filteredTasks, {
    pageSize: TASK_QUEUE_PAGE_SIZE,
    requested,
    selectedIndex,
  });

  if (tasksResource.error) {
    return (
      <ErrorBlock error={tasksResource.error} retry={tasksResource.reload} />
    );
  }
  if (tasksResource.loading && tasks.length === 0) {
    return <LoadingBlock label="Loading task queue…" />;
  }
  if (tasks.length === 0) {
    return (
      <WorkbenchSection title="Task queue" icon={ListTodo}>
        <div id="orchestration-empty-queue-title">
          <WorkbenchEmpty
            icon={Inbox}
            title={
              projectScope === "all"
                ? "No tasks yet"
                : `No tasks for ${workspaceLabel || "this project"}`
            }
          >
            Progress and results appear here.
          </WorkbenchEmpty>
        </div>
      </WorkbenchSection>
    );
  }

  return (
    <WorkSplit>
      <WorkRail
        heading="Queue"
        meta={`${asNumber(effectiveOverview.total)} total${
          projectScope === "all"
            ? ""
            : ` · ${workspaceLabel || "selected project"}`
        }`}
        controls={
          <>
            <label>
              <span className="sr-only">Search task queue</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter tasks"
                ref={search}
                type="search"
                value={query}
              />
            </label>
            <label>
              <span className="sr-only">Task lifecycle</span>
              <select
                aria-label="Task lifecycle"
                onChange={(event) =>
                  setTier(event.target.value as TaskQueueTier)
                }
                value={effectiveTier}
              >
                {tiers.map((value) => (
                  <option key={value} value={value}>
                    {value === "all" ? "All states" : titleCase(value)}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        note={
          active && actionableTasks.length > 1 ? (
            bulkAction ? (
              <>
                <span>
                  {bulkAction === "complete"
                    ? "Complete"
                    : bulkAction === "fail"
                      ? "Fail"
                      : "Cancel"}{" "}
                  {actionableTasks.length} filtered tasks?
                </span>
                <button
                  className="text-button"
                  disabled={bulkBusy}
                  onClick={() => setBulkAction(null)}
                  type="button"
                >
                  Keep tasks
                </button>
                <button
                  className={
                    bulkAction === "complete"
                      ? "primary-button"
                      : "danger-button"
                  }
                  disabled={bulkBusy}
                  onClick={() => {
                    const action = bulkAction;
                    void onRunBulkTaskAction(actionableTasks, action).finally(
                      () => setBulkAction(null),
                    );
                  }}
                  type="button"
                >
                  {bulkBusy ? "Updating…" : `Confirm ${bulkAction}`}
                </button>
              </>
            ) : (
              <>
                <span>{actionableTasks.length} actionable</span>
                <button
                  className="text-button"
                  onClick={() => setBulkAction("complete")}
                  type="button"
                >
                  Complete filtered
                </button>
                <button
                  className="text-button danger-text-button"
                  onClick={() => setBulkAction("fail")}
                  type="button"
                >
                  Fail filtered
                </button>
                <button
                  className="text-button danger-text-button"
                  onClick={() => setBulkAction("cancel")}
                  type="button"
                >
                  Cancel filtered
                </button>
              </>
            )
          ) : undefined
        }
      >
        <TaskQueueRail
          filteredTasks={filteredTasks}
          onClearFilters={() => {
            search.current?.focus();
            setQuery("");
            setTier("all");
          }}
          onSelectTask={onSelectTask}
          onShowMore={() =>
            setPage({
              key: filterKey,
              limit: taskWindow.limit + TASK_QUEUE_PAGE_SIZE,
            })
          }
          pageSize={TASK_QUEUE_PAGE_SIZE}
          selectedTaskId={selectedTask?.id}
          taskWindow={taskWindow}
        />
      </WorkRail>

      <WorkDetail>
        {!selectedTask ? (
          <WorkbenchEmpty icon={ClipboardList} title="Choose a task">
            Select a task to see its progress, actions, and evidence.
          </WorkbenchEmpty>
        ) : (
          <TaskQueueDetail
            active={active}
            busyKeys={busyKeys}
            childObjective={childObjective}
            childTitle={childTitle}
            childWorkspaceRoot={childWorkspaceRoot}
            confirmedAction={confirmedAction}
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
            taskDetailReady={taskDetailReady}
            selectedTaskNote={selectedTaskNote}
            showChildCreate={showChildCreate}
            worktrees={worktrees}
          />
        )}
      </WorkDetail>
    </WorkSplit>
  );
}
