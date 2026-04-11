import type { DelegationTaskRecord } from "@/types";
import type {
  DelegationAggregationSummary,
  DelegationOverview,
} from "./read-model";
import type { DelegationSupervisionReport } from "./service-types";

export async function superviseDelegationQueue(input: {
  queue: DelegationTaskRecord[];
  skipped: { id: string; reason: string }[];
  concurrency: number;
  markRunning: (id: string) => DelegationTaskRecord;
  complete: (id: string, note?: string) => DelegationTaskRecord;
  fail: (id: string, note: string) => DelegationTaskRecord;
  get: (id: string) => DelegationTaskRecord;
  aggregate: (id: string) => DelegationAggregationSummary;
  overview: () => DelegationOverview;
  onExecutionDelta: (delta: number) => void;
  runner: (task: DelegationTaskRecord) => Promise<string>;
  onComplete?: (task: DelegationTaskRecord) => Promise<void> | void;
  onError?: (task: DelegationTaskRecord, error: string) => Promise<void> | void;
}): Promise<DelegationSupervisionReport> {
  const started: string[] = [];
  const completed: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const inflight = new Set<Promise<void>>();

  const launchTask = (task: DelegationTaskRecord): Promise<void> => {
    const job = (async () => {
      try {
        const runningTask = input.markRunning(task.id);
        started.push(runningTask.id);
        const result = await input.runner(runningTask);
        const completedTask = input.complete(task.id, result);
        completed.push(completedTask.id);
        await input.onComplete?.(completedTask);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push({ id: task.id, error: message });
        const failedTask = input.fail(task.id, message);
        await input.onError?.(failedTask, message);
      }
    })().finally(() => {
      inflight.delete(job);
      input.onExecutionDelta(-1);
    });

    inflight.add(job);
    input.onExecutionDelta(1);
    return job;
  };

  for (const task of input.queue) {
    while (inflight.size >= input.concurrency) {
      await Promise.race(inflight);
    }
    launchTask(task);
  }

  while (inflight.size > 0) {
    await Promise.race(inflight);
  }

  const overview = input.overview();
  const startedRoots = started.filter((id) => {
    const task = input.get(id);
    return !task.parentTaskId || !started.includes(task.parentTaskId);
  });

  return {
    concurrency: input.concurrency,
    started,
    completed,
    failed,
    skipped: input.skipped,
    aggregations: startedRoots.map((id) => input.aggregate(id)),
    overview,
  };
}
