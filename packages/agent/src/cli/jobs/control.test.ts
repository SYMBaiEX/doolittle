import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createJobControl,
  monitorJobCancel,
  requestJobCancel,
} from "./control";
import { cancelCliJob } from "./lifecycle";
import { createCliJob, finalizeCliJob, getCliJob } from "./store";
import { jobPaths } from "./store/index-store";

describe("durable job cancellation", () => {
  it("aborts an actual loopback child turn across process boundaries", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-child-turn-"));
    const job = createCliJob(dataDir, "wait");
    const nonce = createJobControl(dataDir, job.id);
    const code = `
      import { handleRuntimePromptCommand } from "./packages/agent/src/entrypoint/prompt-command.ts";
      const controller = new AbortController();
      await handleRuntimePromptCommand({
        command: "exec", shellIsInteractive: false, immediatePrompt: "wait",
        oneShot: { json: false, jsonStream: true, background: false, jobId: process.env.TEST_JOB_ID },
        jobControlDir: process.env.TEST_JOB_DIR, jobControlNonce: process.env.TEST_NONCE,
        onCancelRequested: () => controller.abort(), abortSignal: controller.signal,
        context: { config: { dataDir: process.env.TEST_JOB_DIR } }, writeStdout: () => {},
        runCliPromptWithEvents: async (_context, _line, handlers, options) => {
          await new Promise((resolve) => options.abortSignal.addEventListener("abort", resolve, { once: true }));
          await handlers.onEvent({ type: "completed", timestamp: new Date().toISOString(), status: "cancelled" });
          return { result: { text: "stopped", tone: "agent", status: "cancelled" }, sessionId: "loopback" };
        },
      });
    `;
    const child = spawn("nub", ["-e", code], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TEST_JOB_DIR: dataDir,
        TEST_JOB_ID: job.id,
        TEST_NONCE: nonce,
      },
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    try {
      const heartbeat = jobPaths(dataDir, job.id).heartbeatPath;
      const deadline = Date.now() + 5000;
      while (!existsSync(heartbeat) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      expect(existsSync(heartbeat), stderr).toBe(true);
      expect(cancelCliJob(dataDir, job.id).kind).toBe("requested");
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      expect(code, stderr).toBe(130);
      expect(getCliJob(dataDir, job.id)?.status).toBe("cancelled");
    } finally {
      if (child.exitCode === null) child.kill();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 10_000);
  it("accepts an addressed cancellation request from a fresh process", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-cross-process-"));
    try {
      const job = createCliJob(dataDir, "task");
      const nonce = createJobControl(dataDir, job.id);
      const code =
        'import { cancelCliJob } from "./packages/agent/src/cli/jobs/lifecycle.ts"; const result = cancelCliJob(process.env.TEST_JOB_DIR!, process.env.TEST_JOB_ID!); if (result.kind !== "requested") process.exitCode = 1';
      const child = spawnSync("nub", ["-e", code], {
        cwd: process.cwd(),
        env: { ...process.env, TEST_JOB_DIR: dataDir, TEST_JOB_ID: job.id },
        encoding: "utf8",
      });
      expect(child.status, child.stderr).toBe(0);
      expect(getCliJob(dataDir, job.id)?.status).toBe("queued");
      const abort = vi.fn();
      const stop = monitorJobCancel(dataDir, job.id, nonce, abort);
      expect(abort).toHaveBeenCalledOnce();
      stop();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("requests without finalizing, then only the addressed child can observe it", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-control-"));
    try {
      const job = createCliJob(dataDir, "task");
      const nonce = createJobControl(dataDir, job.id);
      const result = cancelCliJob(dataDir, job.id);
      expect(result.kind).toBe("requested");
      expect(getCliJob(dataDir, job.id)?.status).toBe("queued");
      const abort = vi.fn();
      expect(() => monitorJobCancel(dataDir, job.id, "wrong", abort)).toThrow();
      const stop = monitorJobCancel(dataDir, job.id, nonce, abort);
      expect(abort).toHaveBeenCalledOnce();
      stop();
      finalizeCliJob(dataDir, job.id, "cancelled", 130);
      expect(cancelCliJob(dataDir, job.id).kind).toBe("already-terminal");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("rejects a forged request nonce and preserves a completed job", () => {
    const dataDir = mkdtempSync(
      join(tmpdir(), "doolittle-job-control-forged-"),
    );
    try {
      const job = createCliJob(dataDir, "task");
      const nonce = createJobControl(dataDir, job.id);
      const request = jobPaths(dataDir, job.id).requestPath;
      writeFileSync(
        request,
        JSON.stringify({ id: job.id, nonce: "f".repeat(64) }),
      );
      expect(requestJobCancel(dataDir, job.id)).toBe("cannot-request");
      const abort = vi.fn();
      const stop = monitorJobCancel(dataDir, job.id, nonce, abort);
      expect(abort).not.toHaveBeenCalled();
      stop();
      unlinkSync(request);
      finalizeCliJob(dataDir, job.id, "completed", 0);
      expect(cancelCliJob(dataDir, job.id).kind).toBe("already-terminal");
      expect(getCliJob(dataDir, job.id)?.status).toBe("completed");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
