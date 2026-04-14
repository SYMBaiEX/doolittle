import { describe, expect, it } from "bun:test";
import {
  applyDelegationTaskCancellation,
  applyDelegationTaskCompletion,
  applyDelegationTaskFailure,
  applyDelegationTaskRequeue,
  applyDelegationTaskRunning,
  applyDelegationWorkerStarted,
  createDelegationChildInput,
  createDelegationTaskRecord,
  linkDelegationChildTask,
} from "./task-mutations";

describe("delegation task mutation helpers", () => {
  it("creates a normalized delegation task record", () => {
    const task = createDelegationTaskRecord({
      title: "Research lane",
      objective: "Investigate the issue",
      profile: "research",
      labels: [" browser ", "vision"],
      metadata: { owner: "alice", empty: "   " },
      executionMode: "delegated",
    });

    expect(task.group).toBe("research");
    expect(task.labels).toEqual(["browser", "vision"]);
    expect(task.tags).toEqual(["browser", "vision"]);
    expect(task.metadata).toEqual({ owner: "alice" });
    expect(task.workerMode).toBe("process");
    expect(task.notes[0]).toContain("queued");
  });

  it("builds child input by inheriting group, labels, and metadata", () => {
    const parent = createDelegationTaskRecord({
      title: "Parent",
      objective: "Coordinate",
      group: "browser",
      profile: "research",
      labels: ["parent"],
      metadata: { owner: "bob" },
      executionMode: "delegated",
    });

    const child = createDelegationChildInput(parent, {
      title: "Child",
      objective: "Capture screenshots",
      labels: ["vision"],
      metadata: { lane: "capture" },
    });

    expect(child.group).toBe("browser");
    expect(child.profile).toBe("research");
    expect(child.labels).toEqual(["parent", "vision"]);
    expect(child.metadata).toEqual({
      owner: "bob",
      lane: "capture",
      parentTaskId: parent.id,
    });
  });

  it("requeues a failed task without losing its retry budget", () => {
    const task = createDelegationTaskRecord({
      title: "Retryable",
      objective: "Retry me",
      executionMode: "delegated",
      maxAttempts: 4,
    });
    task.status = "running";
    task.attempts = 2;

    applyDelegationTaskFailure(task, "boom");
    expect(String(task.status)).toBe("failed");
    expect(task.notes.at(-1)).toContain("failed after 2/4 attempts");

    applyDelegationTaskRequeue(task, "try again");
    expect(String(task.status)).toBe("pending");
    expect(task.workerMode).toBe("process");
    expect(task.startedAt).toBeUndefined();
    expect(task.completedAt).toBeUndefined();
    expect(task.notes.at(-1)).toContain("requeued with 4 max attempts");
  });

  it("tracks running, worker start, and completion details", () => {
    const task = createDelegationTaskRecord({
      title: "Delegated",
      objective: "Do the work",
      executionMode: "delegated",
      maxAttempts: 2,
    });

    applyDelegationTaskRunning(task);
    applyDelegationWorkerStarted(task, {
      pid: 1234,
      outputPath: "/tmp/delegation.log",
    });
    applyDelegationTaskCompletion(task, "all set");

    expect(String(task.status)).toBe("completed");
    expect(task.attempts).toBe(1);
    expect(task.startedAt).toBeTruthy();
    expect(task.completedAt).toBeTruthy();
    expect(task.workerPid).toBeUndefined();
    expect(task.workerMode).toBe("process");
    expect(task.lastOutputPath).toBe("/tmp/delegation.log");
    expect(task.notes).toContain("all set");
    expect(task.notes.some((note) => note.includes("worker started"))).toBe(
      true,
    );
  });

  it("cancels a running task and records the cancellation note", () => {
    const task = createDelegationTaskRecord({
      title: "Cancelable",
      objective: "Stop me",
    });

    applyDelegationTaskRunning(task);
    applyDelegationTaskCancellation(task, "user requested stop");

    expect(String(task.status)).toBe("cancelled");
    expect(task.completedAt).toBeTruthy();
    expect(task.workerPid).toBeUndefined();
    expect(task.notes).toContain("user requested stop");
    expect(task.notes.at(-1)).toContain("cancelled at");
  });

  it("links child task ids back onto the parent record", () => {
    const parent = createDelegationTaskRecord({
      title: "Parent",
      objective: "Coordinate",
    });
    const child = createDelegationTaskRecord({
      title: "Child",
      objective: "Execute",
      parentTaskId: parent.id,
    });

    linkDelegationChildTask(
      [parent, child],
      parent.id,
      child.id,
      child.createdAt,
    );

    expect(parent.childTaskIds).toEqual([child.id]);
    expect(parent.notes.at(-1)).toContain(child.id);
  });
});
