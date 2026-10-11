import {
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
