import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { type CliTurnEvent, encodeCliTurnEvent } from "../../turn-events";
import type { CliJobRecord } from "../types";
import { readCliJobEventsFromPath } from "./events";
import {
  assertJobPaths,
  jobPaths,
  mutateJob,
  readJobsIndex,
  updateJobsIndex,
} from "./index-store";

export function createCliJob(dataDir: string, prompt: string): CliJobRecord {
  if (Buffer.byteLength(prompt, "utf8") > 1024 * 1024)
    throw new Error("Background prompt exceeds 1 MiB.");
  const id = randomUUID();
  readJobsIndex(dataDir);
  const { root, stateDir, logPath } = jobPaths(dataDir, id);
  mkdirSync(root, { mode: 0o700 });
  mkdirSync(stateDir, { mode: 0o700 });
  assertJobPaths(dataDir, id);
  writeFileSync(logPath, "", { encoding: "utf8", mode: 0o600, flag: "wx" });
  const now = new Date().toISOString();
  const record: CliJobRecord = {
    id,
    prompt,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    logPath,
    stateDir,
  };
  updateJobsIndex(dataDir, (index) => {
    index.jobs.unshift(record);
    index.jobs = index.jobs.slice(0, 200);
  });
  return record;
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
