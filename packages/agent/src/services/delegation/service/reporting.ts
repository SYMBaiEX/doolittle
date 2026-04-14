import type { DelegationTaskRecord } from "@/types";
import type {
  DelegationTaskFilter,
  DelegationWorkerStatus,
} from "../read-model";
import {
  buildDelegationServiceAggregation,
  buildDelegationServiceOverview,
  buildDelegationServiceWorkers,
} from "../reporting";

export function readDelegationServiceOverview(
  read: () => { tasks: DelegationTaskRecord[] },
  activeExecutions: number,
): ReturnType<typeof buildDelegationServiceOverview> {
  return buildDelegationServiceOverview(read().tasks, activeExecutions);
}

export function readDelegationServiceWorkers(
  read: () => { tasks: DelegationTaskRecord[] },
  limit = 20,
  filter?: DelegationTaskFilter,
): DelegationWorkerStatus[] {
  return buildDelegationServiceWorkers(read().tasks, limit, filter);
}

export function buildDelegationServiceAggregationForId(
  _read: () => { tasks: DelegationTaskRecord[] },
  id: string,
  getTask: (taskId: string) => DelegationTaskRecord,
): ReturnType<typeof buildDelegationServiceAggregation> {
  return buildDelegationServiceAggregation(id, getTask);
}
