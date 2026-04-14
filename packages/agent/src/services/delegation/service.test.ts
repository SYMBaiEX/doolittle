import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DelegationService } from "./service";

describe("DelegationService", () => {
  it("tracks worker lifecycle metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-delegation-test-"));
    const service = new DelegationService(root);

    try {
      const task = service.create({
        title: "Worker Task",
        objective: "Run in a worker process",
        group: "research",
        profile: "research",
        priority: "high",
        tags: ["browser", "voice"],
        metadata: { owner: "alice" },
        executionMode: "delegated",
      });
      const paths = service.getWorkerPaths(task.id);

      service.markRunning(task.id);
      const started = service.markWorkerStarted(task.id, {
        pid: 12345,
        mode: "process",
        outputPath: paths.outputPath,
      });

      expect(started.workerPid).toBe(12345);
      expect(started.workerMode).toBe("process");
      expect(started.group).toBe("research");
      expect(started.profile).toBe("research");
      expect(started.priority).toBe("high");
      expect(started.tags).toEqual(["browser", "voice"]);
      expect(started.metadata?.owner).toBe("alice");
      expect(started.lastOutputPath).toBe(paths.outputPath);
      expect(started.attempts).toBe(1);
      expect(
        started.notes.some((note) => note.startsWith("system: worker started")),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports retry queues and cancellation", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-delegation-queue-"));
    const service = new DelegationService(root);

    try {
      const task = service.create({
        title: "Retry Task",
        objective: "Retry me",
        group: "ops",
        executionMode: "delegated",
        maxAttempts: 2,
      });

      service.markRunning(task.id);
      service.fail(task.id, "First failure");
      expect(service.pending().some((entry) => entry.id === task.id)).toBe(
        true,
      );

      const retried = service.requeue(task.id, "Retrying");
      expect(retried.status).toBe("pending");

      const cancelled = service.cancel(task.id, "Stop now");
      expect(cancelled.status).toBe("cancelled");
      expect(service.pending().some((entry) => entry.id === task.id)).toBe(
        false,
      );
      expect(
        cancelled.notes.some((note) => note.startsWith("system: cancelled")),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("spawns child tasks and builds task trees", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-delegation-tree-"));
    const service = new DelegationService(root);

    try {
      const parent = service.create({
        title: "Parent Task",
        objective: "Coordinate the workstream",
        group: "browser",
        profile: "research",
        tags: ["parent"],
        metadata: { owner: "bob" },
        executionMode: "delegated",
      });

      const child = service.spawnChild(parent.id, {
        title: "Child Task",
        objective: "Handle the screenshot lane",
        labels: ["screenshot", "vision"],
        metadata: { lane: "capture" },
      });

      const tree = service.tree(parent.id);

      expect(child.parentTaskId).toBe(parent.id);
      expect(child.group).toBe("browser");
      expect(child.profile).toBe("research");
      expect(child.labels).toEqual(["parent", "screenshot", "vision"]);
      expect(child.metadata?.owner).toBe("bob");
      expect(child.metadata?.lane).toBe("capture");
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0]?.task.id).toBe(child.id);
      expect(service.listByGroup("browser")).toHaveLength(2);
      expect(service.listByLabel("screenshot")).toHaveLength(1);
      expect(
        service.list({ group: "browser", label: "screenshot" }),
      ).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("cascades cancellation and requeue decisions through nested children", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-delegation-cascade-"));
    const service = new DelegationService(root);

    try {
      const parent = service.create({
        title: "Parent Cascade",
        objective: "Cascade across nested descendants",
        group: "browser",
        executionMode: "delegated",
      });
      const child = service.spawnChild(parent.id, {
        title: "Child Cascade",
        objective: "Propagate through the first layer",
      });
      const grandchild = service.spawnChild(child.id, {
        title: "Grandchild Cascade",
        objective: "Propagate through the second layer",
      });

      const cancelled = service.cancel(parent.id);
      expect(cancelled.status).toBe("cancelled");
      expect(service.get(child.id).status).toBe("cancelled");
      expect(service.get(grandchild.id).status).toBe("cancelled");
      expect(service.get(child.id).notes).toContain(
        `Cancelled because parent ${parent.id} was cancelled.`,
      );
      expect(service.get(grandchild.id).notes).toContain(
        `Cancelled because parent ${child.id} was cancelled.`,
      );

      const requeued = service.requeue(parent.id, undefined, {
        cascadeChildren: true,
      });
      expect(requeued.status).toBe("pending");
      expect(service.get(child.id).status).toBe("pending");
      expect(service.get(grandchild.id).status).toBe("pending");
      expect(service.get(child.id).notes).toContain(
        `Requeued because parent ${parent.id} was requeued.`,
      );
      expect(service.get(grandchild.id).notes).toContain(
        `Requeued because parent ${child.id} was requeued.`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("summarizes queue health and supervises queued workers", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-delegation-supervision-"),
    );
    const service = new DelegationService(root);

    try {
      const _pending = service.create({
        title: "Queued Task",
        objective: "Finish the queued task",
        group: "ops",
        profile: "ops",
        priority: "high",
        labels: ["queue"],
        executionMode: "delegated",
        maxAttempts: 2,
      });
      const running = service.create({
        title: "Running Task",
        objective: "Keep this task running",
        group: "research",
        profile: "research",
        priority: "normal",
        labels: ["worker"],
        executionMode: "delegated",
      });

      service.markRunning(running.id);
      service.markWorkerStarted(running.id, {
        pid: process.pid,
        mode: "process",
        outputPath: service.getWorkerPaths(running.id).outputPath,
      });

      const overview = service.overview();
      expect(overview.total).toBe(2);
      expect(overview.pending).toBe(1);
      expect(overview.running).toBe(1);
      expect(overview.activeWorkers).toBe(1);
      expect(overview.aliveWorkers).toBe(1);
      expect(overview.byGroup.some((entry) => entry.group === "ops")).toBe(
        true,
      );
      expect(overview.byLabel.some((entry) => entry.label === "queue")).toBe(
        true,
      );
      expect(overview.byProfile.some((entry) => entry.profile === "ops")).toBe(
        true,
      );
      expect(
        overview.byProfile.some((entry) => entry.profile === "research"),
      ).toBe(true);
      expect(
        overview.byPriority.some((entry) => entry.priority === "high"),
      ).toBe(true);

      const workers = service.workers();
      expect(
        workers.some((worker) => worker.id === running.id && worker.alive),
      ).toBe(true);
      expect(service.workers(10, { profile: "research" })).toHaveLength(1);

      const filtered = service.pending({ group: "ops" });
      expect(filtered).toHaveLength(1);

      const report = await service.superviseQueued(
        async (task) => `completed: ${task.id}`,
        {
          concurrency: 1,
          filter: { group: "ops" },
        },
      );

      expect(report.started.length).toBe(1);
      expect(report.completed.length).toBe(1);
      expect(report.skipped.length).toBeGreaterThanOrEqual(0);
      expect(report.failed.length).toBe(0);
      expect(report.overview.completed).toBeGreaterThanOrEqual(1);

      const parent = service.create({
        title: "Parent Cancel",
        objective: "Cascade me",
        group: "browser",
        executionMode: "delegated",
      });
      const child = service.spawnChild(parent.id, {
        title: "Child Cancel",
        objective: "Follow the parent",
      });
      const cancelled = service.cancel(parent.id, "Operator cancelled.");
      expect(cancelled.status).toBe("cancelled");
      expect(service.get(child.id).status).toBe("cancelled");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves queue alias entrypoints", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-delegation-aliases-"));
    const service = new DelegationService(root);

    try {
      const first = service.create({
        title: "Alias Task One",
        objective: "Exercise the supervision alias",
        group: "ops",
        executionMode: "delegated",
      });
      expect(service.queueSummary()).toEqual(service.overview());

      const supervised = await service.supervise(
        async (task) => `completed: ${task.id}`,
        { concurrency: 1 },
      );
      expect(supervised.completed).toContain(first.id);

      const second = service.create({
        title: "Alias Task Two",
        objective: "Exercise the execution alias",
        group: "ops",
        executionMode: "delegated",
      });
      const executed = await service.runQueued(
        async (task) => `completed: ${task.id}`,
        { concurrency: 1 },
      );
      expect(executed.map((task) => task.id)).toContain(second.id);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
