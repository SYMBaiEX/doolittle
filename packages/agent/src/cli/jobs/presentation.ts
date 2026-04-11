import { existsSync, statSync } from "node:fs";
import { renderCliTurnEvent } from "../turn-events";
import {
  getCliJob,
  listCliJobs,
  readCliJobEvents,
  summarizeCliJob,
} from "./store";

export function renderCliJobReplay(dataDir: string, id: string): string {
  const events = readCliJobEvents(dataDir, id);
  if (!events.length) {
    return "No job events recorded yet.";
  }
  return events.map((event) => renderCliTurnEvent(event)).join("\n");
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
