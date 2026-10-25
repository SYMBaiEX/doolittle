import type { EnvConfig } from "@doolittle/agent/types/runtime";
import type {
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  getCliJob,
  renderCliJobReplay,
} from "../cli/jobs/index";
import type { renderCliTurnEvent } from "../cli/turn-events";

interface JobsCommandLogger {
  warn(event: string, fields?: Record<string, unknown>): void;
}

interface JobsCommandDependencies {
  loadConfig: () => Pick<EnvConfig, "dataDir">;
  cliJobStatusSummary: typeof cliJobStatusSummary;
  getCliJob: typeof getCliJob;
  renderCliJobReplay: typeof renderCliJobReplay;
  attachCliJob: typeof attachCliJob;
  cancelCliJob: typeof cancelCliJob;
  renderCliTurnEvent: typeof renderCliTurnEvent;
  entryLogger: JobsCommandLogger;
  printLine: (message: string) => void;
  writeStdout: (message: string) => void;
  writeStderrLine: (message: string) => void;
  exit: (code: number) => void;
}

export async function handleJobsSubcommand(options: {
  rest: string[];
  jobControlDir?: string;
  deps: JobsCommandDependencies;
}): Promise<void> {
  const { deps, jobControlDir, rest } = options;
  const config = deps.loadConfig();
  const dataDir = jobControlDir || config.dataDir;
  const jobCommand = rest[0] ?? "list";
  const jobArgs = rest.slice(1);

  if (jobCommand === "list") {
    deps.printLine(deps.cliJobStatusSummary(dataDir));
    return;
  }

  if (jobCommand === "show") {
    const jobId = jobArgs[0]?.trim();
    if (!jobId) {
      deps.entryLogger.warn("jobs-show-usage");
      deps.writeStderrLine("Usage: doolittle jobs show <job-id>");
      deps.exit(1);
      return;
    }
    const job = deps.getCliJob(dataDir, jobId);
    if (!job) {
      deps.entryLogger.warn("jobs-show-missing", { jobId });
      deps.writeStderrLine(`Background job not found: ${jobId}`);
      deps.exit(1);
      return;
    }
    deps.printLine(deps.renderCliJobReplay(dataDir, jobId));
    return;
  }

  if (jobCommand === "attach") {
    const jobId = jobArgs[0]?.trim();
    if (!jobId) {
      deps.entryLogger.warn("jobs-attach-usage");
      deps.writeStderrLine("Usage: doolittle jobs attach <job-id>");
      deps.exit(1);
      return;
    }
    const job = await deps.attachCliJob(dataDir, jobId, {
      onEvent: (event) => {
        deps.writeStdout(`${deps.renderCliTurnEvent(event)}\n`);
      },
    });
    if (!job) {
      deps.entryLogger.warn("jobs-attach-missing", { jobId });
      deps.writeStderrLine(`Background job not found: ${jobId}`);
      deps.exit(1);
      return;
    }
    if (job.status === "queued" || job.status === "running") {
      deps.writeStderrLine(
        `Background job ${jobId} is unconfirmed or stale; no terminal event has been observed.`,
      );
      deps.exit(1);
    }
    return;
  }

  if (jobCommand === "cancel") {
    const jobId = jobArgs[0]?.trim();
    if (!jobId) {
      deps.entryLogger.warn("jobs-cancel-usage");
      deps.writeStderrLine("Usage: doolittle jobs cancel <job-id>");
      deps.exit(1);
      return;
    }
    const result = deps.cancelCliJob(dataDir, jobId);
    if (result.kind === "not-found") {
      deps.entryLogger.warn("jobs-cancel-missing", { jobId });
      deps.writeStderrLine(`Background job not found: ${jobId}`);
      deps.exit(1);
      return;
    }
    if (result.kind === "already-terminal")
      deps.printLine(`Background job ${jobId} already ${result.job.status}.`);
    else if (result.kind === "cannot-request") {
      deps.writeStderrLine(
        `Cannot request cancellation of background job ${jobId}; check its status.`,
      );
      deps.exit(1);
    } else
      deps.printLine(
        `Cancellation requested for background job ${jobId}; awaiting child confirmation.`,
      );
    return;
  }

  deps.entryLogger.warn("jobs-usage");
  deps.writeStderrLine(
    "Usage: doolittle jobs <list|show|attach|cancel> [job-id]",
  );
  deps.exit(1);
}
