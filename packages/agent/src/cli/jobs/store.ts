import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CliTurnEvent } from "@/cli/turn-events";
import { encodeCliTurnEvent, parseCliTurnEvent } from "@/cli/turn-events";
import type { CliJobIndex, CliJobRecord } from "./types";

function readCliJobEventsFromPath(logPath: string): CliTurnEvent[] {
  if (!existsSync(logPath)) {
    return [];
  }
  return readFileSync(logPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => parseCliTurnEvent(line))
    .filter((entry): entry is CliTurnEvent => Boolean(entry));
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function reconcileJobRecords(index: CliJobIndex): boolean {
  let changed = false;
  for (const job of index.jobs) {
    if (job.status !== "queued" && job.status !== "running") {
      continue;
    }
    if (job.pid && isProcessAlive(job.pid)) {
      continue;
    }

    const terminalEvent = readCliJobEventsFromPath(job.logPath)
      .reverse()
      .find((event) => event.type === "completed");
    if (!terminalEvent) {
      if (job.status === "running") {
        job.status = "failed";
        job.exitCode ??= 1;
        job.completedAt ??= new Date().toISOString();
        job.pid = undefined;
        changed = true;
      }
      continue;
    }

    job.status = terminalEvent.status;
    job.completedAt ??= terminalEvent.timestamp;
    job.exitCode ??=
      terminalEvent.status === "completed"
        ? 0
        : terminalEvent.status === "cancelled"
          ? 130
          : 1;
    job.pid = undefined;
    changed = true;
  }
  return changed;
}

function jobsRoot(dataDir: string): string {
  return join(dataDir, "cli-jobs");
}

function jobsIndexPath(dataDir: string): string {
  return join(jobsRoot(dataDir), "jobs.json");
}

function ensureJobsStore(dataDir: string): void {
  const root = jobsRoot(dataDir);
  mkdirSync(root, { recursive: true });
  const indexPath = jobsIndexPath(dataDir);
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, JSON.stringify({ jobs: [] }, null, 2), "utf8");
  }
}

function readJobsIndex(dataDir: string): CliJobIndex {
  ensureJobsStore(dataDir);
  try {
    const raw = readFileSync(jobsIndexPath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as CliJobIndex;
    const index = {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
    if (reconcileJobRecords(index)) {
      writeJobsIndex(dataDir, index);
    }
    return index;
  } catch {
    return { jobs: [] };
  }
}

function writeJobsIndex(dataDir: string, index: CliJobIndex): void {
  ensureJobsStore(dataDir);
  writeFileSync(jobsIndexPath(dataDir), JSON.stringify(index, null, 2), "utf8");
}

function mutateJob(
  dataDir: string,
  id: string,
  mutate: (job: CliJobRecord) => void,
): CliJobRecord | undefined {
  const index = readJobsIndex(dataDir);
  const job = index.jobs.find((entry) => entry.id === id);
  if (!job) {
    return undefined;
  }
  mutate(job);
  job.updatedAt = new Date().toISOString();
  writeJobsIndex(dataDir, index);
  return job;
}

export function createCliJob(dataDir: string, prompt: string): CliJobRecord {
  ensureJobsStore(dataDir);
  const id = randomUUID();
  const root = join(jobsRoot(dataDir), id);
  const stateDir = join(root, "state");
  const logPath = join(root, "events.jsonl");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(logPath, "", "utf8");
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
  const index = readJobsIndex(dataDir);
  index.jobs.unshift(record);
  index.jobs = index.jobs.slice(0, 200);
  writeJobsIndex(dataDir, index);
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
  writeFileSync(job.logPath, encodeCliTurnEvent(event), {
    encoding: "utf8",
    flag: "a",
  });
}

export function readCliJobEvents(dataDir: string, id: string): CliTurnEvent[] {
  const job = getCliJob(dataDir, id);
  if (!job) {
    return [];
  }
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
