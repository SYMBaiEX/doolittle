import { describe, expect, it } from "bun:test";
import type { DelegationTaskRecord } from "@/types";
import {
  buildDelegationAggregationSummary,
  buildDelegationOverview,
  buildDelegationTaskTree,
  buildDelegationWorkerStatuses,
  matchDelegationTaskFilter,
} from "./read-model";

function makeTask(
  id: string,
  overrides: Partial<DelegationTaskRecord> = {},
): DelegationTaskRecord {
  const createdAt = "2026-03-30T00:00:00.000Z";
  return {
    id,
    title: `Task ${id}`,
    objective: `Objective ${id}`,
    status: "pending",
    notes: [],
    createdAt,
    updatedAt: createdAt,
    executionMode: "local",
    ...overrides,
  };
}

function getTaskOrThrow(
  tasks: Map<string, DelegationTaskRecord>,
  taskId: string,
): DelegationTaskRecord {
  const task = tasks.get(taskId);
  if (!task) {
    throw new Error(`Missing test task: ${taskId}`);
  }
  return task;
}

describe("delegation/read-model", () => {
  it("matches delegation filters using group fallback and labels", () => {
    const task = makeTask("task-1", {
      group: undefined,
      profile: "research",
      priority: "high",
      labels: ["queue", "review"],
      executionMode: "delegated",
    });

    expect(matchDelegationTaskFilter(task, { group: "research" })).toBe(true);
    expect(matchDelegationTaskFilter(task, { label: "review" })).toBe(true);
    expect(matchDelegationTaskFilter(task, { priority: "low" })).toBe(false);
  });

  it("builds overview and worker summaries from extracted helpers", () => {
    const tasks = [
      makeTask("pending", {
        group: "ops",
        profile: "ops",
        labels: ["queue"],
        workerMode: "inline",
      }),
      makeTask("running", {
        status: "running",
        executionMode: "delegated",
        orchestrationMode: "parallel",
        group: "ops",
        profile: "ops",
        priority: "high",
        labels: ["queue", "delegated"],
        workerMode: "process",
        workerPid: 4242,
        attempts: 1,
        maxAttempts: 3,
        startedAt: "2026-03-30T00:00:05.000Z",
        lastOutputPath: "/tmp/running-output.json",
        notes: ["system: running"],
      }),
      makeTask("failed", {
        status: "failed",
        executionMode: "delegated",
        profile: "research",
        group: "research",
        priority: "normal",
        labels: ["queue"],
        workerMode: "process",
        attempts: 1,
        maxAttempts: 3,
      }),
    ];

    const overview = buildDelegationOverview(tasks, {
      activeExecutions: 2,
      isProcessAlive: (pid) => pid === 4242,
    });
    expect(overview.total).toBe(3);
    expect(overview.running).toBe(1);
    expect(overview.failed).toBe(1);
    expect(overview.retryable).toBe(1);
    expect(overview.activeWorkers).toBe(1);
    expect(overview.aliveWorkers).toBe(1);
    expect(overview.byGroup[0]?.group).toBe("ops");
    expect(
      overview.byOrchestration.some((entry) => entry.mode === "parallel"),
    ).toBe(true);

    const workers = buildDelegationWorkerStatuses(tasks, {
      limit: 10,
      filter: { executionMode: "delegated" },
      isProcessAlive: (pid) => pid === 4242,
    });
    expect(workers).toHaveLength(2);
    expect(workers[0]?.status).toBe("running");
    expect(workers[0]?.alive).toBe(true);
    expect(workers[0]?.attemptsRemaining).toBe(2);
  });

  it("builds stable trees and aggregation summaries", () => {
    const root = makeTask("root", {
      executionMode: "delegated",
      orchestrationMode: "parallel",
      childTaskIds: ["child-complete", "child-failed"],
      workerMode: "process",
      workerPid: 100,
    });
    const childComplete = makeTask("child-complete", {
      status: "completed",
      parentTaskId: "root",
      lastOutputPath: "/tmp/complete.json",
      notes: ["system: done"],
      childTaskIds: [],
    });
    const childFailed = makeTask("child-failed", {
      status: "failed",
      parentTaskId: "root",
      notes: ["system: blocked"],
      childTaskIds: [],
    });
    const tasks = new Map(
      [root, childComplete, childFailed].map((task) => [task.id, task]),
    );

    const tree = buildDelegationTaskTree("root", {
      getTask: (taskId) => getTaskOrThrow(tasks, taskId),
      listChildren: (parentTaskId) =>
        Array.from(tasks.values()).filter(
          (task) => task.parentTaskId === parentTaskId,
        ),
    });
    expect(tree.children).toHaveLength(2);
    expect(tree.children.map((entry) => entry.task.id)).toEqual([
      "child-complete",
      "child-failed",
    ]);

    const summary = buildDelegationAggregationSummary("root", {
      getTask: (taskId) => getTaskOrThrow(tasks, taskId),
      isProcessAlive: () => false,
    });
    expect(summary.totalTasks).toBe(3);
    expect(summary.completedTasks).toBe(1);
    expect(summary.failedTasks).toBe(1);
    expect(summary.stalledWorkers).toBe(1);
    expect(summary.completedOutputs[0]?.id).toBe("child-complete");
    expect(summary.blockers.some((entry) => entry.id === "child-failed")).toBe(
      true,
    );
  });
});
