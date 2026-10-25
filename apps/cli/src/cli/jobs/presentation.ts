import { existsSync, lstatSync } from "node:fs";
import { readRegularFileSync } from "@doolittle/agent/utils/read-regular-file";
import { renderCliTurnEvent } from "../turn-events";
import {
  getCliJob,
  listCliJobs,
  readCliJobEvents,
  summarizeCliJob,
} from "./store";
import { jobPaths } from "./store/index-store";
import type { CliJobRecord } from "./types";

function isUnconfirmed(
  dataDir: string,
  job: CliJobRecord | undefined,
): boolean {
  if (!job) return false;
  if (job.status !== "queued" && job.status !== "running") return false;
  const createdAt = Date.parse(job.createdAt);
  if (
    Number.isFinite(createdAt) &&
    createdAt <= Date.now() + 1000 &&
    Date.now() - createdAt < 10_000
  )
    return false;
  try {
    const path = jobPaths(dataDir, job.id).heartbeatPath;
    if (!existsSync(path)) return true;
    const at = Number(
      readRegularFileSync(path, 64, { singleLink: true }).toString("utf8"),
    );
    return (
      !Number.isSafeInteger(at) ||
      at > Date.now() + 1000 ||
      Date.now() - at > 10_000
    );
  } catch {
    return true;
  }
}

export function renderCliJobReplay(dataDir: string, id: string): string {
  const job = getCliJob(dataDir, id);
  const events = readCliJobEvents(dataDir, id);
  if (!events.length) {
    return isUnconfirmed(dataDir, job)
      ? "No terminal event recorded; job is unconfirmed or stale."
      : "No job events recorded yet.";
  }
  const replay = events.map((event) => renderCliTurnEvent(event)).join("\n");
  return isUnconfirmed(dataDir, job)
    ? `${replay}\nJob is unconfirmed or stale.`
    : replay;
}

export function cliJobStatusSummary(dataDir: string): string {
  const jobs = listCliJobs(dataDir).slice(0, 10);
  if (!jobs.length) {
    return "No background jobs recorded.";
  }
  return jobs
    .map(
      (job) =>
        `- ${summarizeCliJob(job)}${isUnconfirmed(dataDir, job) ? " (unconfirmed or stale)" : ""}`,
    )
    .join("\n");
}

export function jobHasLiveLog(dataDir: string, id: string): boolean {
  const job = getCliJob(dataDir, id);
  if (!job || !existsSync(job.logPath)) {
    return false;
  }
  try {
    const info = lstatSync(job.logPath);
    return (
      info.isFile() &&
      !info.isSymbolicLink() &&
      info.size > 0 &&
      info.size <= 16 * 1024 * 1024
    );
  } catch {
    return false;
  }
}
