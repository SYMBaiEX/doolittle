import type { DelegationTaskRecord } from "@/types";

import type {
  DelegationAggregationSummary,
  DelegationOverview,
  DelegationTaskFilter,
  DelegationTaskTree,
  DelegationWorkerStatus,
} from "./read-model";
import {
  buildDelegationAggregationSummary,
  buildDelegationOverview,
  buildDelegationTaskTree,
  buildDelegationWorkerStatuses,
} from "./read-model";
import { isDelegationProcessAlive } from "./utils";

export function buildDelegationProjectionOverview(
  tasks: DelegationTaskRecord[],
  activeExecutions: number,
): DelegationOverview {
  return buildDelegationOverview(tasks, {
    activeExecutions,
    isProcessAlive: (pid) => isDelegationProcessAlive(pid),
  });
}

export function buildDelegationProjectionWorkers(
  tasks: DelegationTaskRecord[],
  limit: number,
  filter?: DelegationTaskFilter,
): DelegationWorkerStatus[] {
  return buildDelegationWorkerStatuses(tasks, {
    limit,
    filter,
    isProcessAlive: (pid) => isDelegationProcessAlive(pid),
  });
}

export function buildDelegationProjectionTree(
  id: string,
  getTask: (taskId: string) => DelegationTaskRecord,
  listChildren: (parentTaskId: string) => DelegationTaskRecord[],
): DelegationTaskTree {
  return buildDelegationTaskTree(id, {
    getTask,
    listChildren,
  });
}

export function buildDelegationProjectionAggregation(
  id: string,
  getTask: (taskId: string) => DelegationTaskRecord,
): DelegationAggregationSummary {
  return buildDelegationAggregationSummary(id, {
    getTask,
    isProcessAlive: (pid) => isDelegationProcessAlive(pid),
  });
}
