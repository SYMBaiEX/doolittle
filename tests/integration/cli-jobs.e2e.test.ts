import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  builtCliEntry,
  createTerminalProfile,
  type TerminalProfile,
} from "../support/terminal-pty";

const execute = promisify(execFile);
const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

type StoredJob = {
  id: string;
  status: string;
  pid?: number;
  exitCode?: number;
  logPath: string;
  completedAt?: string;
};

let fixture: TerminalProfile;
const launchedPids = new Set<number>();

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(() => {
  for (const pid of launchedPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The child may already have exited; cleanup is best-effort only.
    }
  }
  launchedPids.clear();
  fixture.cleanup();
});

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function jobsIndexPath(): string {
  return join(fixture.data, "cli-jobs", "jobs.json");
}

function readStoredJob(id: string): StoredJob | undefined {
  if (!existsSync(jobsIndexPath())) return undefined;
  const index = JSON.parse(readFileSync(jobsIndexPath(), "utf8")) as {
    jobs?: StoredJob[];
  };
  return index.jobs?.find((job) => job.id === id);
}

async function launchBackgroundJob(prompt: string): Promise<StoredJob> {
  const result = await execute(
    process.execPath,
    [builtCliEntry, "exec", "-p", prompt, "--background", "--json"],
    {
      cwd: fixture.profile,
      env: fixture.environment,
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  expect(result.stderr).toBe("");
  const job = JSON.parse(result.stdout) as StoredJob;
  expect(job.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  );
  if (job.pid) launchedPids.add(job.pid);
  return job;
}

async function waitForTerminalJob(
  id: string,
  timeoutMs: number,
): Promise<StoredJob> {
  const deadline = Date.now() + timeoutMs;
  let lastJob: StoredJob | undefined;
  let lastEvents = "";
  while (Date.now() < deadline) {
    lastJob = readStoredJob(id);
    if (lastJob && terminalStatuses.has(lastJob.status)) return lastJob;
    if (lastJob && existsSync(lastJob.logPath)) {
      lastEvents = readFileSync(lastJob.logPath, "utf8");
    }
    await sleep(250);
  }
  throw new Error(
    `Job ${id} did not reach a terminal state within ${timeoutMs}ms. ` +
      `last=${JSON.stringify(lastJob)} events=${JSON.stringify(lastEvents.slice(-2000))}`,
  );
}

function readEvents(job: StoredJob): Array<Record<string, unknown>> {
  expect(statSync(job.logPath).size).toBeGreaterThan(0);
  return readFileSync(job.logPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function expectCompletedJob(id: string, timeoutMs: number) {
  const job = await waitForTerminalJob(id, timeoutMs);
  expect(job.status).toBe("completed");
  expect(job.exitCode).toBe(0);
  const events = readEvents(job);
  expect(events[0]?.type).toBe("start");
  expect(events.at(-1)).toMatchObject({
    type: "completed",
    status: "completed",
  });
}

describe("built CLI background jobs", () => {
  it("runs a runtime-backed job to a terminal state and reaps a deliberately killed worker as failed", async () => {
    const runtimeJob = await launchBackgroundJob("/status");
    await expectCompletedJob(runtimeJob.id, 45_000);

    const killedJob = await launchBackgroundJob("/status");
    const launched = readStoredJob(killedJob.id);
    expect(launched?.pid).toBeGreaterThan(0);
    process.kill(launched?.pid ?? 0, "SIGKILL");

    // Reading the jobs surface is the retention sweep: a dead worker must not
    // remain persisted as running forever even when it cannot finalize itself.
    await execute(process.execPath, [builtCliEntry, "jobs", "list"], {
      cwd: fixture.profile,
      env: fixture.environment,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    const reaped = readStoredJob(killedJob.id);
    expect(reaped).toMatchObject({ status: "failed" });
    expect(reaped?.completedAt).toBeTruthy();
    expect(reaped?.pid).toBeUndefined();
    if (!reaped) throw new Error("Killed job disappeared from the index.");
    const reapedEvents = readEvents(reaped);
    expect(reapedEvents.at(-2)).toMatchObject({
      type: "error",
      message: expect.stringContaining("job supervisor marked it failed"),
    });
    expect(reapedEvents.at(-1)).toMatchObject({
      type: "completed",
      status: "failed",
    });
  }, 90_000);

  it("still completes a static pre-boot background job", async () => {
    const staticJob = await launchBackgroundJob("/help");
    await expectCompletedJob(staticJob.id, 10_000);
  }, 30_000);
});
