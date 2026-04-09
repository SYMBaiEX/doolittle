import type {
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  getCliJob,
  renderCliJobReplay,
} from "@/cli/jobs";
import type { renderCliTurnEvent } from "@/cli/turn-events";
import type { EnvConfig } from "@/types/runtime";

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
    const job = deps.cancelCliJob(dataDir, jobId);
    if (!job) {
      deps.entryLogger.warn("jobs-cancel-missing", { jobId });
      deps.writeStderrLine(`Background job not found: ${jobId}`);
      deps.exit(1);
      return;
    }
    deps.printLine(`Cancelled background job ${job.id}.`);
    return;
  }

  deps.entryLogger.warn("jobs-usage");
  deps.writeStderrLine(
    "Usage: doolittle jobs <list|show|attach|cancel> [job-id]",
  );
  deps.exit(1);
}
