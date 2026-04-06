import {
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  getCliJob,
  launchCliBackgroundJob,
  renderCliJobReplay,
} from "@/cli/jobs";
import type { AppContext } from "@/runtime/bootstrap";
import type { CliExecutionHooks, CliExecutionResult, CliState } from "./types";
import { createCliSessionId } from "./types";

export interface CliJobCommandDeps {
  attachCliJob?: typeof attachCliJob;
  cancelCliJob?: typeof cancelCliJob;
  cliJobStatusSummary?: typeof cliJobStatusSummary;
  createJobSessionId?: () => string;
  getCliJob?: typeof getCliJob;
  getLauncherPath?: () => string | undefined;
  launchCliBackgroundJob?: typeof launchCliBackgroundJob;
  renderCliJobReplay?: typeof renderCliJobReplay;
}

export async function handleCliJobCommand(
  normalizedTrimmed: string,
  context: AppContext,
  _state: CliState,
  hooks?: CliExecutionHooks,
  deps: CliJobCommandDeps = {},
): Promise<CliExecutionResult | undefined> {
  const attachCliJobFn = deps.attachCliJob ?? attachCliJob;
  const cancelCliJobFn = deps.cancelCliJob ?? cancelCliJob;
  const cliJobStatusSummaryFn = deps.cliJobStatusSummary ?? cliJobStatusSummary;
  const getCliJobFn = deps.getCliJob ?? getCliJob;
  const getLauncherPath = deps.getLauncherPath ?? (() => Bun.argv[1]);
  const launchCliBackgroundJobFn =
    deps.launchCliBackgroundJob ?? launchCliBackgroundJob;
  const renderCliJobReplayFn = deps.renderCliJobReplay ?? renderCliJobReplay;
  const createJobSessionId =
    deps.createJobSessionId ?? (() => createCliSessionId("job"));

  if (normalizedTrimmed === "/jobs") {
    return {
      text: cliJobStatusSummaryFn(context.config.dataDir),
      tone: "info",
    };
  }
  if (normalizedTrimmed.startsWith("/jobs start ")) {
    const prompt = normalizedTrimmed.replace("/jobs start ", "").trim();
    if (!prompt) {
      return { text: "Usage: /jobs start <prompt>", tone: "warning" };
    }
    const launcherPath = getLauncherPath();
    if (!launcherPath) {
      return {
        text: "The launcher path is not available for background jobs in this shell.",
        tone: "error",
      };
    }
    const job = launchCliBackgroundJobFn({
      config: context.config,
      launcherPath,
      prompt,
      sessionId: createJobSessionId(),
    });
    return {
      text: `Started background job ${job.id}.\nUse /jobs to list jobs, /jobs show ${job.id} to replay output, or /jobs attach ${job.id} to follow it live.`,
      tone: "success",
    };
  }
  if (normalizedTrimmed.startsWith("/jobs cancel ")) {
    const jobId = normalizedTrimmed.replace("/jobs cancel ", "").trim();
    if (!jobId) {
      return { text: "Usage: /jobs cancel <job-id>", tone: "warning" };
    }
    const cancelled = cancelCliJobFn(context.config.dataDir, jobId);
    return cancelled
      ? {
          text: `Cancelled background job ${cancelled.id}.`,
          tone: "success",
        }
      : {
          text: `Background job not found: ${jobId}`,
          tone: "warning",
        };
  }
  if (normalizedTrimmed.startsWith("/jobs show ")) {
    const jobId = normalizedTrimmed.replace("/jobs show ", "").trim();
    if (!jobId) {
      return { text: "Usage: /jobs show <job-id>", tone: "warning" };
    }
    const job = getCliJobFn(context.config.dataDir, jobId);
    if (!job) {
      return { text: `Background job not found: ${jobId}`, tone: "warning" };
    }
    return {
      text: renderCliJobReplayFn(context.config.dataDir, jobId),
      tone: "info",
    };
  }
  if (normalizedTrimmed.startsWith("/jobs attach ")) {
    const jobId = normalizedTrimmed.replace("/jobs attach ", "").trim();
    if (!jobId) {
      return { text: "Usage: /jobs attach <job-id>", tone: "warning" };
    }
    const job = await attachCliJobFn(context.config.dataDir, jobId, {
      onEvent: async (event) => {
        if (event.type === "run") {
          await hooks?.onNotice?.({
            kind: "status",
            message: event.detail,
          });
          return;
        }
        if (event.type === "progress") {
          await hooks?.onResponseProgress?.({ response: event.response });
        }
      },
    });
    if (!job) {
      return { text: `Background job not found: ${jobId}`, tone: "warning" };
    }
    return {
      text: renderCliJobReplayFn(context.config.dataDir, jobId),
      tone:
        job.status === "failed"
          ? "warning"
          : job.status === "cancelled"
            ? "warning"
            : "success",
    };
  }
  return undefined;
}
