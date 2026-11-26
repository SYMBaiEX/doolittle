import { existsSync } from "node:fs";
import { readRegularFileSync } from "@doolittle/storage";
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

function jobsListContentWidth(): number {
  const columns =
    process.stdout.isTTY && Number.isFinite(process.stdout.columns)
      ? Math.floor(process.stdout.columns)
      : 160;
  // The list renderer adds "- "; keep the complete logical row inside the
  // selected width, bounded even when a very wide terminal is in use.
  return Math.max(48, Math.min(160, columns) - 2);
}

export function cliJobStatusSummary(dataDir: string): string {
  const jobs = listCliJobs(dataDir).slice(0, 10);
  if (!jobs.length) {
    return "No background jobs recorded.";
  }
  const width = jobsListContentWidth();
  return jobs
    .map(
      (job) =>
        `- ${summarizeCliJob(job, { maxWidth: width })}${isUnconfirmed(dataDir, job) ? " (unconfirmed or stale)" : ""}`,
    )
    .join("\n");
}
