import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { EnvConfig } from "@/types";
import {
  type CliTurnEvent,
  encodeCliTurnEvent,
  parseCliTurnEvent,
  renderCliTurnEvent,
} from "./turn-events";

export type CliJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface CliJobRecord {
  id: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  status: CliJobStatus;
  logPath: string;
  stateDir: string;
  pid?: number;
  sessionId?: string;
  exitCode?: number;
  startedAt?: string;
  completedAt?: string;
}

interface CliJobIndex {
  jobs: CliJobRecord[];
}

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

export function renderCliJobReplay(dataDir: string, id: string): string {
  const events = readCliJobEvents(dataDir, id);
  if (!events.length) {
    return "No job events recorded yet.";
  }
  return events.map((event) => renderCliTurnEvent(event)).join("\n");
}

export async function attachCliJob(
  dataDir: string,
  id: string,
  handlers?: {
    onLine?: (line: string) => void;
    onEvent?: (event: CliTurnEvent) => void;
  },
): Promise<CliJobRecord | undefined> {
  const seen = new Set<string>();
  while (true) {
    const job = getCliJob(dataDir, id);
    if (!job) {
      return undefined;
    }
    if (existsSync(job.logPath)) {
      const raw = readFileSync(job.logPath, "utf8");
      for (const line of raw.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed || seen.has(trimmed)) {
          continue;
        }
        seen.add(trimmed);
        handlers?.onLine?.(trimmed);
        const event = parseCliTurnEvent(trimmed);
        if (event) {
          handlers?.onEvent?.(event);
        }
      }
    }

    if (job.status !== "queued" && job.status !== "running") {
      return job;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

export function cancelCliJob(
  dataDir: string,
  id: string,
): CliJobRecord | undefined {
  const job = getCliJob(dataDir, id);
  if (!job) {
    return undefined;
  }

  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {
      // Best effort only.
    }
  }

  appendCliJobEvent(dataDir, id, {
    type: "completed",
    timestamp: new Date().toISOString(),
    status: "cancelled",
  });
  return finalizeCliJob(dataDir, id, "cancelled");
}

export function launchCliBackgroundJob(params: {
  config: EnvConfig;
  launcherPath: string;
  prompt: string;
  sessionId?: string;
}): CliJobRecord {
  const record = createCliJob(params.config.dataDir, params.prompt);

  const stdoutFd = openSync(record.logPath, "a");
  const stderrFd = openSync(record.logPath, "a");
  const child = spawn(
    process.execPath,
    [
      params.launcherPath,
      "exec",
      "--prompt",
      params.prompt,
      "--json-stream",
      "--job-id",
      record.id,
      ...(params.sessionId ? ["--session-id", params.sessionId] : []),
    ],
    {
      cwd: resolve(process.cwd()),
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: {
        ...process.env,
        ELIZA_AGENT_DATA_DIR: record.stateDir,
        ELIZA_AGENT_JOB_CONTROL_DIR: params.config.dataDir,
        PGLITE_DATA_DIR: join(record.stateDir, "pglite"),
      },
    },
  );

  child.unref();
  closeSync(stdoutFd);
  closeSync(stderrFd);
  markCliJobStarted(params.config.dataDir, record.id, {
    pid: child.pid ?? 0,
    sessionId: params.sessionId,
  });
  return getCliJob(params.config.dataDir, record.id) ?? record;
}

export function cliJobStatusSummary(dataDir: string): string {
  const jobs = listCliJobs(dataDir).slice(0, 10);
  if (!jobs.length) {
    return "No background jobs recorded.";
  }
  return jobs.map((job) => `- ${summarizeCliJob(job)}`).join("\n");
}

export function jobHasLiveLog(dataDir: string, id: string): boolean {
  const job = getCliJob(dataDir, id);
  if (!job || !existsSync(job.logPath)) {
    return false;
  }
  try {
    return statSync(job.logPath).size > 0;
  } catch {
    return false;
  }
}
