import type { ProgressiveWindow } from "../components/progressive-window";
import { asString, Badge, EmptyBlock } from "../lib";
import {
  orchestrationStatusTier,
  orchestrationTimingLabel,
  taskCapabilityLabel,
} from "../orchestration-helpers";
import type { DelegationTaskRecord } from "../orchestration-resources";
import { statusTone } from "./detail-primitives";

export function TaskQueueRail({
  filteredTasks,
  onClearFilters,
  onSelectTask,
  onShowMore,
  pageSize,
  selectedTaskId,
  taskWindow,
}: {
  filteredTasks: readonly DelegationTaskRecord[];
  onClearFilters: () => void;
  onSelectTask: (task: DelegationTaskRecord) => void;
  onShowMore: () => void;
  pageSize: number;
  selectedTaskId?: string;
  taskWindow: ProgressiveWindow<DelegationTaskRecord>;
}) {
  if (filteredTasks.length === 0) {
    return (
      <EmptyBlock
        actions={
          <button
            className="secondary-button"
            onClick={onClearFilters}
            type="button"
          >
            Clear filters
          </button>
        }
        density="compact"
        title="No matching tasks"
      >
        Change the search or lifecycle filter.
      </EmptyBlock>
    );
  }

  return (
    <ul className="orchestration-master-list">
      {taskWindow.visible.map((task) => {
        const status = asString(task.status, "pending");
        const tier = orchestrationStatusTier(status);
        const timing = orchestrationTimingLabel({
          status,
          startedAt: asString(task.startedAt),
          completedAt: asString(task.completedAt),
          updatedAt: asString(task.updatedAt),
          createdAt: asString(task.createdAt),
        });
        const priority = asString(task.priority, "normal");
        const capability = taskCapabilityLabel(
          task.capabilityProfile,
          task.kind,
        );
        return (
          <li key={task.id}>
            <button
              type="button"
              className={
                task.id === selectedTaskId
                  ? `orchestration-master-item selected tier-${tier}`
                  : `orchestration-master-item tier-${tier}`
              }
              aria-pressed={task.id === selectedTaskId}
              onClick={() => onSelectTask(task)}
            >
              <span className="master-row master-row-top">
                <span className="master-title-line">
                  <i className="master-status-dot" aria-hidden="true" />
                  <strong>{asString(task.title, "Untitled task")}</strong>
                </span>
                <Badge tone={statusTone(status)}>{status}</Badge>
              </span>
              <small className="orchestration-task-rail-meta">
                {timing} · {priority} · {capability}
              </small>
            </button>
          </li>
        );
      })}
      {taskWindow.remaining ? (
        <li className="orchestration-master-footer">
          <span>
            Showing {taskWindow.visible.length} of {filteredTasks.length}
          </span>
          <button
            className="secondary-button"
            onClick={onShowMore}
            type="button"
          >
            Show {Math.min(pageSize, taskWindow.remaining)} more
          </button>
        </li>
      ) : null}
    </ul>
  );
}
