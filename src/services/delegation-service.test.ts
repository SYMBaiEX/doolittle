import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DelegationService } from "./delegation-service";

describe("DelegationService", () => {
  it("tracks worker lifecycle metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-delegation-test-"));
    const service = new DelegationService(root);

    try {
      const task = service.create({
        title: "Worker Task",
        objective: "Run in a worker process",
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
      expect(started.lastOutputPath).toBe(paths.outputPath);
      expect(started.attempts).toBe(1);
      expect(started.notes.some((note) => note.startsWith("system: worker started"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports retry queues and cancellation", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-delegation-queue-"));
    const service = new DelegationService(root);

    try {
      const task = service.create({
        title: "Retry Task",
        objective: "Retry me",
        executionMode: "delegated",
        maxAttempts: 2,
      });

      service.markRunning(task.id);
      service.fail(task.id, "First failure");
      expect(service.pending().some((entry) => entry.id === task.id)).toBe(true);

      const retried = service.requeue(task.id, "Retrying");
      expect(retried.status).toBe("pending");

      const cancelled = service.cancel(task.id, "Stop now");
      expect(cancelled.status).toBe("cancelled");
      expect(service.pending().some((entry) => entry.id === task.id)).toBe(false);
      expect(cancelled.notes.some((note) => note.startsWith("system: cancelled"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("summarizes queue health and supervises queued workers", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-delegation-supervision-"));
    const service = new DelegationService(root);

    try {
      const pending = service.create({
        title: "Queued Task",
        objective: "Finish the queued task",
        executionMode: "delegated",
        maxAttempts: 2,
      });
      const running = service.create({
        title: "Running Task",
        objective: "Keep this task running",
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

      const workers = service.workers();
      expect(workers.some((worker) => worker.id === running.id && worker.alive)).toBe(true);

      const report = await service.superviseQueued(async (task) => `completed: ${task.id}`, {
        concurrency: 1,
      });

      expect(report.started.length).toBe(1);
      expect(report.completed.length).toBe(1);
      expect(report.failed.length).toBe(0);
      expect(report.overview.completed).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
