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
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
