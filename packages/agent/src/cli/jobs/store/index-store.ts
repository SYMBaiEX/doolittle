import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CliJobIndex, CliJobRecord } from "../types";
import { reconcileJobRecords } from "./events";

export function jobsRoot(dataDir: string): string {
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

export function readJobsIndex(dataDir: string): CliJobIndex {
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

export function writeJobsIndex(dataDir: string, index: CliJobIndex): void {
  ensureJobsStore(dataDir);
  writeFileSync(jobsIndexPath(dataDir), JSON.stringify(index, null, 2), "utf8");
}

export function mutateJob(
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
