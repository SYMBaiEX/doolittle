import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import { type CliTurnEvent, encodeCliTurnEvent } from "../../turn-events";
import type { CliJobRecord } from "../types";
import { readCliJobEventsFromPath } from "./events";
import {
  assertJobPaths,
  isJobId,
  jobPaths,
  jobsRoot,
  MAX_JOBS,
  mutateJob,
  readJobsIndex,
  updateJobsIndex,
} from "./index-store";

function hasExitedWorker(pid: number | undefined): boolean {
  if (pid === undefined || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

export function createCliJob(dataDir: string, prompt: string): CliJobRecord {
  if (Buffer.byteLength(prompt, "utf8") > 1024 * 1024)
    throw new Error("Background prompt exceeds 1 MiB.");
  const id = randomUUID();
  if (!isJobId(id)) throw new Error("Invalid job id.");
  let createdRoot: string | undefined;
  try {
    return updateJobsIndex(dataDir, (index) => {
      if (index.jobs.length >= MAX_JOBS) {
        let terminalIndex = index.jobs.length - 1;
        let exitedIndex = -1;
        for (; terminalIndex >= 0; terminalIndex--) {
          const { status, pid } = index.jobs[terminalIndex];
          if (status !== "queued" && status !== "running") break;
          if (exitedIndex === -1 && hasExitedWorker(pid))
            exitedIndex = terminalIndex;
        }
        const evictIndex = terminalIndex >= 0 ? terminalIndex : exitedIndex;
        if (evictIndex < 0)
          throw new Error("Job index is full of active jobs.");
        index.jobs.splice(evictIndex, 1);
      }

      assertJobPaths(dataDir);
      const base = realpathSync(jobsRoot(dataDir));
      const resolvedRoot = resolve(base, id);
      const resolvedState = resolve(resolvedRoot, "state");
      const resolvedLog = resolve(resolvedRoot, "events.jsonl");
      if (!resolvedRoot.startsWith(base + sep))
        throw new Error("Unsafe job directory.");
      if (
        !resolvedState.startsWith(resolvedRoot + sep) ||
        !resolvedLog.startsWith(resolvedRoot + sep)
      )
        throw new Error("Unsafe job files.");
      mkdirSync(resolvedRoot, { mode: 0o700 });
      createdRoot = resolvedRoot;
      mkdirSync(resolvedState, { mode: 0o700 });
      assertJobPaths(dataDir, id);
      writeFileSync(resolvedLog, "", {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });

      const now = new Date().toISOString();
      const paths = jobPaths(dataDir, id);
      const record: CliJobRecord = {
        id,
        prompt,
        createdAt: now,
        updatedAt: now,
        status: "queued",
        logPath: paths.logPath,
        stateDir: paths.stateDir,
      };
      index.jobs.unshift(record);
      return record;
    });
  } catch (error) {
    if (createdRoot) {
      try {
        rmSync(createdRoot, { recursive: true, force: true });
      } catch {
        // Preserve the original creation error if cleanup also fails.
      }
    }
    throw error;
  }
}

export function listCliJobs(dataDir: string): CliJobRecord[] {
  return readJobsIndex(dataDir).jobs;
}

export function getCliJob(
  dataDir: string,
  id: string,
): CliJobRecord | undefined {
  return readJobsIndex(dataDir).jobs.find((entry) => entry.id === id);
}

export function markCliJobStarted(
  dataDir: string,
  id: string,
  params: { pid: number; sessionId?: string },
): CliJobRecord | undefined {
  return mutateJob(dataDir, id, (job) => {
    if (job.status !== "queued" && job.status !== "running") return;
    job.status = "running";
    job.pid = params.pid;
    job.sessionId = params.sessionId;
    job.startedAt = new Date().toISOString();
  });
}

export function finalizeCliJob(
  dataDir: string,
  id: string,
  status: "completed" | "failed" | "cancelled",
  exitCode?: number,
): CliJobRecord | undefined {
  return mutateJob(dataDir, id, (job) => {
    if (job.status !== "queued" && job.status !== "running") return;
    job.status = status;
    job.exitCode = exitCode;
    job.completedAt = new Date().toISOString();
    job.pid = undefined;
  });
}

export function appendCliJobEvent(
  dataDir: string,
  id: string,
  event: CliTurnEvent,
): void {
  const job = getCliJob(dataDir, id);
  if (!job) {
    return;
  }
  assertJobPaths(dataDir, id);
  const encoded = encodeCliTurnEvent(event);
  const descriptor = openCliJobLog(job.logPath);
  try {
    const limit = 16 * 1024 * 1024;
    const reserve = event.type === "completed" ? 0 : 4096;
    if (
      fstatSync(descriptor).size + Buffer.byteLength(encoded, "utf8") >
      limit - reserve
    ) {
      if (event.type === "completed")
        throw new Error("Job log is full; terminal event cannot be stored.");
      return;
    }
    writeFileSync(descriptor, encoded, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

export function openCliJobLog(path: string): number {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    throw new Error("Job log is not a private regular file.");
  const descriptor = openSync(
    path,
    constants.O_WRONLY |
      constants.O_APPEND |
      (constants.O_NOFOLLOW ?? 0) |
      constants.O_NONBLOCK,
  );
  try {
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > 16 * 1024 * 1024
    )
      throw new Error("Job log is not a regular file.");
    fchmodSync(descriptor, 0o600);
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

export function readCliJobEvents(dataDir: string, id: string): CliTurnEvent[] {
  const job = getCliJob(dataDir, id);
  if (!job) {
    return [];
  }
  assertJobPaths(dataDir, id);
  return readCliJobEventsFromPath(job.logPath);
}

export function summarizeCliJob(job: CliJobRecord): string {
  return [
    `${job.id} [${job.status}]`,
    `created=${job.createdAt}`,
    job.startedAt ? `started=${job.startedAt}` : undefined,
    job.completedAt ? `completed=${job.completedAt}` : undefined,
    job.sessionId ? `session=${job.sessionId}` : undefined,
    job.exitCode !== undefined ? `exit=${job.exitCode}` : undefined,
    `prompt=${job.prompt}`,
  ]
    .filter(Boolean)
    .join(" ");
}
