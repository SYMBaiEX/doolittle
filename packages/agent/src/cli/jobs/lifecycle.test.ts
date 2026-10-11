import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "@/types";
import { attachCliJob, launchCliBackgroundJob } from "./lifecycle";
import { createCliJob, getCliJob } from "./store";
import { jobPaths } from "./store/index-store";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
afterEach(() => spawnMock.mockReset());

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    pid: process.pid,
    unref: vi.fn(),
    stdin: new PassThrough(),
  });
  queueMicrotask(() => child.emit("spawn"));
  return child;
}

describe("private background job launch", () => {
  it("returns an unconfirmed running job for malformed heartbeat without hanging", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-bad-heartbeat-"));
    try {
      const job = createCliJob(dataDir, "wait");
      const path = join(dataDir, "cli-jobs", "jobs.json");
      const index = JSON.parse(readFileSync(path, "utf8"));
      index.jobs[0].createdAt = new Date(Date.now() - 60_000).toISOString();
      index.jobs[0].status = "running";
      writeFileSync(path, JSON.stringify(index));
      writeFileSync(
        jobPaths(dataDir, job.id).heartbeatPath,
        "not-a-timestamp",
        { mode: 0o600 },
      );
      expect((await attachCliJob(dataDir, job.id))?.status).toBe("running");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("treats a future index timestamp without heartbeat as unconfirmed", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-future-time-"));
    try {
      const job = createCliJob(dataDir, "wait");
      const path = join(dataDir, "cli-jobs", "jobs.json");
      const index = JSON.parse(readFileSync(path, "utf8"));
      index.jobs[0].createdAt = new Date(Date.now() + 60_000).toISOString();
      index.jobs[0].status = "running";
      writeFileSync(path, JSON.stringify(index));
      expect((await attachCliJob(dataDir, job.id))?.status).toBe("running");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("passes prompt through bounded stdin, never argv or inherited output", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-launch-"));
    const child = fakeChild();
    const delivered: Buffer[] = [];
    child.stdin.on("data", (chunk) => delivered.push(chunk));
    try {
      spawnMock.mockImplementation((_executable, args, options) => {
        expect(args).toContain("--prompt-stdin");
        expect(args).not.toContain("hello");
        expect(options.stdio).toEqual(["pipe", "ignore", "ignore"]);
        expect(options.env.DOOLITTLE_JOB_CONTROL_NONCE).toMatch(
          /^[a-f0-9]{64}$/u,
        );
        return child;
      });
      const job = await launchCliBackgroundJob({
        config: { dataDir } as EnvConfig,
        launcherPath: "/operator/launcher",
        prompt: "hello",
      });
      expect(job.status).toBe("running");
      expect(Buffer.concat(delivered).toString()).toBe("hello");
      expect(child.unref).toHaveBeenCalledOnce();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("records a failed launch instead of claiming a started job", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-failed-launch-"));
    let id: string | undefined;
    try {
      spawnMock.mockImplementation((_executable, args) => {
        id = args[args.indexOf("--job-id") + 1];
        throw new Error("spawn failed");
      });
      await expect(
        launchCliBackgroundJob({
          config: { dataDir } as EnvConfig,
          launcherPath: "/bad",
          prompt: "hello",
        }),
      ).rejects.toThrow("spawn failed");
      expect(getCliJob(dataDir, id as string)?.status).toBe("failed");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("rejects prompts above one MiB before creating a job", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-prompt-bound-"));
    try {
      await expect(
        launchCliBackgroundJob({
          config: { dataDir } as EnvConfig,
          launcherPath: "/operator",
          prompt: "x".repeat(1024 * 1024 + 1),
        }),
      ).rejects.toThrow("1 MiB");
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
