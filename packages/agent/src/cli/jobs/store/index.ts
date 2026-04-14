import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliTurnEvent, encodeCliTurnEvent } from "@/cli/turn-events";
import type { CliJobRecord } from "../types";
import { readCliJobEventsFromPath } from "./events";
import {
  jobsRoot,
  mutateJob,
  readJobsIndex,
  writeJobsIndex,
} from "./index-store";

export function createCliJob(dataDir: string, prompt: string): CliJobRecord {
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
