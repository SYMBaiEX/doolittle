import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { CliTurnEvent } from "../../turn-events";
import type { CliJobRecord } from "../types";
import {
  appendCliJobEventToPath,
  hasExitedWorker,
  readCliJobEventsFromPath,
} from "./events";
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

export { openCliJobLog } from "./events";

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
  appendCliJobEventToPath(job.logPath, event);
}

export function readCliJobEvents(dataDir: string, id: string): CliTurnEvent[] {
  const job = getCliJob(dataDir, id);
  if (!job) {
    return [];
  }
  assertJobPaths(dataDir, id);
  return readCliJobEventsFromPath(job.logPath);
}

function clipEnd(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 0) return "";
  if (width === 1) return "…";
  return `${text.slice(0, width - 1)}…`;
}

/**
 * Render a bounded operator summary. Full timestamps and session metadata are
 * included only while at least a useful prompt preview still fits; the prompt
 * is single-lined and explicitly ellipsized rather than left to terminal wrap.
 */
export function summarizeCliJob(
  job: CliJobRecord,
  options?: { maxWidth?: number },
): string {
  const maxWidth = Math.max(48, Math.floor(options?.maxWidth ?? 160));
  const prompt = job.prompt.replace(/\s+/gu, " ").trim();
  const identity = `${job.id} [${job.status}]`;
  const metadata = [
    `created=${job.createdAt}`,
    job.startedAt ? `started=${job.startedAt}` : undefined,
    job.completedAt ? `completed=${job.completedAt}` : undefined,
    job.sessionId ? `session=${job.sessionId}` : undefined,
    job.exitCode !== undefined ? `exit=${job.exitCode}` : undefined,
  ].filter((part): part is string => Boolean(part));
  const promptPrefix = "prompt=";
  const reservedPromptWidth = Math.min(Math.max(prompt.length, 1), 24);

  const parts = [identity];
  for (const part of metadata) {
    const candidate = [...parts, part].join(" ");
    const fitsWithPrompt =
      candidate.length + 1 + promptPrefix.length + reservedPromptWidth <=
      maxWidth;
    if (fitsWithPrompt) parts.push(part);
  }

  const fixed = parts.join(" ");
  const promptWidth = maxWidth - fixed.length - 1 - promptPrefix.length;
  const singleLine = `${fixed} ${promptPrefix}${clipEnd(prompt, promptWidth)}`;
  if (singleLine.length <= maxWidth) return singleLine;

  const facts = metadata.join(" ");
  return [
    identity,
    ...(facts ? [`  ${clipEnd(facts, Math.max(0, maxWidth - 2))}`] : []),
    `  ${promptPrefix}${clipEnd(prompt, Math.max(0, maxWidth - 2 - promptPrefix.length))}`,
  ].join("\n");
}
