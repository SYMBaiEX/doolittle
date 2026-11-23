import { SearchX } from "lucide-react";
import type { ProgressiveWindow } from "../components/progressive-window";
import {
  WorkbenchAction,
  WorkbenchEmpty,
} from "../components/workbench/Workbench";
import { asString } from "../lib";
import {
  orchestrationTimingLabel,
  taskCapabilityLabel,
} from "../orchestration-helpers";
import type { DelegationTaskRecord } from "../orchestration-resources";
import { statusTier } from "../work-surface/status";
import { WorkList, WorkListFooter, WorkRow } from "../work-surface/WorkSurface";

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
      <WorkbenchEmpty
        actions={
          <WorkbenchAction onClick={onClearFilters}>
            Clear filters
          </WorkbenchAction>
        }
        icon={SearchX}
        title="No matching tasks"
      >
        Change the search or lifecycle filter.
      </WorkbenchEmpty>
    );
  }

  return (
    <WorkList>
      {taskWindow.visible.map((task) => {
        const status = asString(task.status, "pending");
        const timing = orchestrationTimingLabel({
          status,
          startedAt: asString(task.startedAt),
          completedAt: asString(task.completedAt),
          updatedAt: asString(task.updatedAt),
          createdAt: asString(task.createdAt),
        });
        const priority = asString(task.priority, "normal");
        const meta = [
          taskCapabilityLabel(task.capabilityProfile, task.kind),
          ...(priority !== "normal" ? [priority] : []),
        ];
        return (
          <WorkRow
            key={task.id}
            label={asString(task.title, "Untitled task")}
            meta={meta}
            onSelect={() => onSelectTask(task)}
            selected={task.id === selectedTaskId}
            status={status}
            time={timing}
            title={asString(task.title, "Untitled task")}
            tone={statusTier(status)}
          />
        );
      })}
      {taskWindow.remaining ? (
        <WorkListFooter>
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
        </WorkListFooter>
      ) : null}
    </WorkList>
  );
}
