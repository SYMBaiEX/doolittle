import type { DelegationTaskRecord } from "@/types";
import { buildDelegationSkippedTasks } from "../queue";
import type {
  DelegationAggregationSummary,
  DelegationOverview,
  DelegationTaskFilter,
} from "../read-model";
import type {
  DelegationSupervisionOptions,
  DelegationSupervisionReport,
} from "../service-types";
import { superviseDelegationQueue } from "../supervision";

export interface DelegationServiceSupervisionBindings {
  readTasks(): DelegationTaskRecord[];
  pending(filter?: DelegationTaskFilter): DelegationTaskRecord[];
  markRunning(id: string): DelegationTaskRecord;
  complete(id: string, note?: string): DelegationTaskRecord;
  fail(
    id: string,
    note: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord;
  get(id: string): DelegationTaskRecord;
  aggregate(id: string): DelegationAggregationSummary;
  overview(): DelegationOverview;
  adjustActiveExecutions(delta: number): void;
}

export function runDelegationServiceExecution(
  bindings: DelegationServiceSupervisionBindings,
  runner: (task: DelegationTaskRecord) => Promise<string>,
  options?: DelegationSupervisionOptions,
): Promise<DelegationSupervisionReport> {
  return superviseDelegationQueue({
    queue: bindings.pending(options?.filter),
    skipped: buildDelegationSkippedTasks(bindings.readTasks(), options?.filter),
    concurrency: Math.max(1, options?.concurrency ?? 2),
    markRunning: bindings.markRunning,
    complete: bindings.complete,
    fail: bindings.fail,
    get: bindings.get,
    aggregate: bindings.aggregate,
    overview: bindings.overview,
    onExecutionDelta: bindings.adjustActiveExecutions,
    runner,
    onComplete: options?.onComplete,
    onError: options?.onError,
  });
}

export function superviseDelegationServiceQueue(
  bindings: DelegationServiceSupervisionBindings,
  runner: (task: DelegationTaskRecord) => Promise<string>,
  options?: DelegationSupervisionOptions,
): Promise<DelegationSupervisionReport> {
  return runDelegationServiceExecution(bindings, runner, options);
}
