import { spawn } from "node:child_process";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cancelCliJob } from "./lifecycle";
import {
  appendCliJobEvent,
  createCliJob,
  finalizeCliJob,
  getCliJob,
  listCliJobs,
  readCliJobEvents,
  summarizeCliJob,
} from "./store";

describe("cli job store", () => {
  it("serializes concurrent index writers across processes", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-writers-"));
    const code =
      'import { createCliJob } from "./packages/agent/src/cli/jobs/store/index.ts"; createCliJob(process.env.TEST_JOB_DIR!, "worker")';
    try {
      const run = () =>
        new Promise<void>((resolvePromise, reject) => {
          const child = spawn("nub", ["-e", code], {
            cwd: process.cwd(),
            env: { ...process.env, TEST_JOB_DIR: dataDir },
            stdio: "pipe",
          });
          let stderr = "";
          child.stderr?.on("data", (chunk) => {
            stderr += String(chunk);
          });
          child.on("error", reject);
          child.on("exit", (exitCode) =>
            exitCode === 0
              ? resolvePromise()
              : reject(new Error(`writer exited ${exitCode}: ${stderr}`)),
          );
        });
      await Promise.all(Array.from({ length: 4 }, run));
      expect(listCliJobs(dataDir)).toHaveLength(4);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("fails closed on an abandoned index lock rather than trusting a stored PID", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-lock-"));
    try {
      createCliJob(dataDir, "task");
      mkdirSync(join(dataDir, "cli-jobs", ".index-lock"), { mode: 0o700 });
      expect(() => listCliJobs(dataDir)).toThrow("Job index is locked");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 5000);
  it.skipIf(process.platform === "win32")(
    "preserves jobs across an operator-selected data directory symlink",
    () => {
      const parent = mkdtempSync(join(tmpdir(), "doolittle-job-alias-"));
      try {
        const actual = join(parent, "actual");
        mkdirSync(actual, { mode: 0o755 });
        const alias = join(parent, "alias");
        symlinkSync(actual, alias);
        const job = createCliJob(alias, "task");
        expect(getCliJob(actual, job.id)?.id).toBe(job.id);
        expect(getCliJob(actual, job.id)?.logPath).toBe(
          join(actual, "cli-jobs", job.id, "events.jsonl"),
        );
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    },
  );
  it("rejects a forged path while retaining valid legacy terminal records", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-index-"));
    try {
      const job = createCliJob(dataDir, "legacy");
      finalizeCliJob(dataDir, job.id, "completed", 0);
      expect(getCliJob(dataDir, job.id)?.status).toBe("completed");
      const indexPath = join(dataDir, "cli-jobs", "jobs.json");
      const index = JSON.parse(readFileSync(indexPath, "utf8"));
      index.jobs[0].logPath = join(dataDir, "outside");
      writeFileSync(indexPath, JSON.stringify(index));
      expect(() => listCliJobs(dataDir)).toThrow("path mismatch");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("refuses oversized and nonregular indexes without following a linked index", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-bounded-index-"));
    try {
      createCliJob(dataDir, "task");
      const indexPath = join(dataDir, "cli-jobs", "jobs.json");
      writeFileSync(indexPath, Buffer.alloc(16 * 1024 * 1024 + 1));
      expect(() => listCliJobs(dataDir)).toThrow();
      unlinkSync(indexPath);
      mkdirSync(indexPath);
      expect(() => listCliJobs(dataDir)).toThrow();
      rmSync(indexPath, { recursive: true });
      const external = join(dataDir, "external");
      writeFileSync(external, "keep");
      symlinkSync(external, indexPath);
      expect(() => listCliJobs(dataDir)).toThrow();
      expect(readFileSync(external, "utf8")).toBe("keep");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("never signals a stored PID and keeps an unconfirmed request honest", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-pid-"));
    const originalKill = process.kill;
    try {
      const job = createCliJob(dataDir, "task");
      const indexPath = join(dataDir, "cli-jobs", "jobs.json");
      const index = JSON.parse(readFileSync(indexPath, "utf8"));
      index.jobs[0].pid = process.pid;
      index.jobs[0].status = "running";
      writeFileSync(indexPath, JSON.stringify(index));
      process.kill = (() => {
        throw new Error("PID must not be used");
      }) as typeof process.kill;
      expect(cancelCliJob(dataDir, job.id).kind).toBe("cannot-request");
      expect(getCliJob(dataDir, job.id)?.status).toBe("running");
    } finally {
      process.kill = originalKill;
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("keeps other jobs usable when one event log is oversized", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-big-log-"));
    try {
      const first = createCliJob(dataDir, "large");
      const second = createCliJob(dataDir, "small");
      writeFileSync(first.logPath, Buffer.alloc(16 * 1024 * 1024 + 1));
      expect(listCliJobs(dataDir)).toHaveLength(2);
      expect(() => readCliJobEvents(dataDir, first.id)).toThrow();
      expect(getCliJob(dataDir, second.id)?.prompt).toBe("small");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("reserves terminal-event space when verbose progress reaches the log cap", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-log-cap-"));
    try {
      const job = createCliJob(dataDir, "task");
      const progress = {
        type: "notice",
        timestamp: new Date().toISOString(),
        kind: "status",
        message: "x".repeat(16 * 1024 * 1024 - 5000),
      } as const;
      appendCliJobEvent(dataDir, job.id, progress);
      appendCliJobEvent(dataDir, job.id, {
        ...progress,
        message: "y".repeat(5000),
      });
      appendCliJobEvent(dataDir, job.id, {
        type: "completed",
        timestamp: new Date().toISOString(),
        status: "cancelled",
      });
      expect(readCliJobEvents(dataDir, job.id).at(-1)?.type).toBe("completed");
      expect(getCliJob(dataDir, job.id)?.status).toBe("cancelled");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("keeps the first terminal event authoritative if a later failure frame appears", () => {
    const dataDir = mkdtempSync(
      join(tmpdir(), "doolittle-job-terminal-order-"),
    );
    try {
      const job = createCliJob(dataDir, "task");
      appendCliJobEvent(dataDir, job.id, {
        type: "completed",
        timestamp: new Date().toISOString(),
        status: "completed",
      });
      appendCliJobEvent(dataDir, job.id, {
        type: "completed",
        timestamp: new Date().toISOString(),
        status: "failed",
      });
      expect(getCliJob(dataDir, job.id)?.status).toBe("completed");
      finalizeCliJob(dataDir, job.id, "failed", 1);
      expect(getCliJob(dataDir, job.id)?.status).toBe("completed");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects hard-linked event logs before append or chmod",
    () => {
      const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-hardlink-"));
      try {
        const job = createCliJob(dataDir, "task");
        const external = join(dataDir, "external");
        writeFileSync(external, "keep");
        unlinkSync(job.logPath);
        linkSync(external, job.logPath);
        expect(() =>
          appendCliJobEvent(dataDir, job.id, {
            type: "notice",
            timestamp: new Date().toISOString(),
            kind: "status",
            message: "x",
          }),
        ).toThrow();
        expect(() => readCliJobEvents(dataDir, job.id)).toThrow();
        expect(readFileSync(external, "utf8")).toBe("keep");
      } finally {
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
  );
  it("keeps new job state and prompts owner-only", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-cli-job-private-"));
    try {
      const job = createCliJob(dataDir, "private prompt");
      if (process.platform !== "win32") {
        expect(statSync(join(dataDir, "cli-jobs")).mode & 0o777).toBe(0o700);
        expect(statSync(job.stateDir).mode & 0o777).toBe(0o700);
        expect(statSync(job.logPath).mode & 0o777).toBe(0o600);
        expect(
          statSync(join(dataDir, "cli-jobs", "jobs.json")).mode & 0o777,
        ).toBe(0o600);
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "refuses linked job logs and resumes after a regular log is restored",
    () => {
      const dataDir = mkdtempSync(join(tmpdir(), "doolittle-cli-job-link-"));
      try {
        const job = createCliJob(dataDir, "prompt");
        const target = join(dataDir, "target");
        writeFileSync(target, "keep");
        unlinkSync(job.logPath);
        symlinkSync(target, job.logPath);
        const event = {
          type: "notice",
          timestamp: new Date().toISOString(),
          kind: "status",
          message: "test",
        } as const;
        expect(() => appendCliJobEvent(dataDir, job.id, event)).toThrow();
        expect(readFileSync(target, "utf8")).toBe("keep");
        unlinkSync(job.logPath);
        writeFileSync(job.logPath, "", { mode: 0o600 });
        appendCliJobEvent(dataDir, job.id, event);
        expect(readCliJobEvents(dataDir, job.id)).toHaveLength(1);
      } finally {
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
  );

  it("creates, persists, finalizes, and replays job events", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-cli-jobs-"));
    const job = createCliJob(dataDir, "hello world");

    expect(listCliJobs(dataDir)).toHaveLength(1);
    appendCliJobEvent(dataDir, job.id, {
      type: "notice",
      timestamp: new Date().toISOString(),
      kind: "status",
      message: "booted",
    });
    finalizeCliJob(dataDir, job.id, "completed", 0);

    const stored = getCliJob(dataDir, job.id);
    expect(readCliJobEvents(dataDir, job.id)).toHaveLength(1);
    expect(stored?.status).toBe("completed");
    expect(stored).toBeDefined();
    expect(summarizeCliJob(stored as NonNullable<typeof stored>)).toContain(
      "prompt=hello world",
    );
  });
});
