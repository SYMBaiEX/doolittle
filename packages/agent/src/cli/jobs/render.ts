import { renderCliTurnEvent } from "../turn-events";
import { listCliJobs, readCliJobEvents, summarizeCliJob } from "./store";

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
