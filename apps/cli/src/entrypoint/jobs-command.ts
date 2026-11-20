import { loadConfig } from "@doolittle/agent/config/env";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import {
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  getCliJob,
  renderCliJobReplay,
} from "../cli/jobs/index";
import { renderCliTurnEvent } from "../cli/turn-events";
import { writeStderrLine } from "./output";

export async function handleJobsSubcommand(input: {
  rest: string[];
  jobControlDir?: string;
  entryLogger: AppLogger;
}): Promise<number> {
  const config = loadConfig();
  const dataDir = input.jobControlDir || config.dataDir;
  const command = input.rest[0] ?? "list";
  const { entryLogger } = input;

  if (command === "list") {
    console.log(cliJobStatusSummary(dataDir));
    return 0;
  }
  if (command !== "show" && command !== "attach" && command !== "cancel") {
    entryLogger.warn("jobs-usage");
    writeStderrLine("Usage: doolittle jobs <list|show|attach|cancel> [job-id]");
    return 1;
  }
  const jobId = input.rest[1]?.trim();
  if (!jobId) {
    entryLogger.warn(`jobs-${command}-usage`);
    writeStderrLine(`Usage: doolittle jobs ${command} <job-id>`);
    return 1;
  }
  const missingJob = () => {
    entryLogger.warn(`jobs-${command}-missing`, { jobId });
    writeStderrLine(`Background job not found: ${jobId}`);
    return 1;
  };

  if (command === "show") {
    if (!getCliJob(dataDir, jobId)) return missingJob();
    console.log(renderCliJobReplay(dataDir, jobId));
    return 0;
  }

  if (command === "attach") {
    const job = await attachCliJob(dataDir, jobId, {
      onEvent: (event) => {
        process.stdout.write(`${renderCliTurnEvent(event)}\n`);
      },
    });
    if (!job) return missingJob();
    if (job.status === "queued" || job.status === "running") {
      writeStderrLine(
        `Background job ${jobId} is unconfirmed or stale; no terminal event has been observed.`,
      );
      return 1;
    }
    return 0;
  }

  const result = cancelCliJob(dataDir, jobId);
  switch (result.kind) {
    case "not-found":
      return missingJob();
    case "cannot-request":
      writeStderrLine(
        `Cannot request cancellation of background job ${jobId}; check its status.`,
      );
      return 1;
    case "already-terminal":
      console.log(`Background job ${jobId} already ${result.job.status}.`);
      return 0;
    default:
      console.log(
        `Cancellation requested for background job ${jobId}; awaiting child confirmation.`,
      );
      return 0;
  }
}
