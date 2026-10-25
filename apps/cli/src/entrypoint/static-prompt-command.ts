import { loadConfig } from "@doolittle/agent/config/env";
import { monitorJobCancel } from "../cli/jobs/control";
import { appendCliJobEvent, finalizeCliJob } from "../cli/jobs/index";
import { emitStaticPromptEvents, printOneShotResult } from "./output";
import type { StaticResult } from "./static-prompts";
import type { OneShotOptions } from "./subcommand";

interface StaticPromptCommandDeps {
  emitStaticPromptEvents: typeof emitStaticPromptEvents;
  finalizeCliJob: typeof finalizeCliJob;
  appendCliJobEvent?: typeof appendCliJobEvent;
  monitorJobCancel?: typeof monitorJobCancel;
  printOneShotResult: typeof printOneShotResult;
  loadConfig: typeof loadConfig;
}

const staticPromptCommandDeps: StaticPromptCommandDeps = {
  emitStaticPromptEvents,
  finalizeCliJob,
  appendCliJobEvent,
  monitorJobCancel,
  printOneShotResult,
  loadConfig,
};

export async function handleStaticPromptCommand(
  input: {
    command: string;
    immediatePrompt?: string;
    staticPromptResult?: StaticResult;
    oneShot?: OneShotOptions;
    jobControlDir?: string;
    jobControlNonce?: string;
  },
  deps: StaticPromptCommandDeps = staticPromptCommandDeps,
): Promise<boolean> {
  const staticPromptResult = input.staticPromptResult;
  if (
    !staticPromptResult ||
    (input.command === "exec" && input.oneShot?.background)
  ) {
    return false;
  }

  if (input.command === "exec" && input.oneShot?.jsonStream) {
    const activeJobId = input.oneShot.jobId?.trim() || undefined;
    const dataDir = input.jobControlDir || deps.loadConfig().dataDir;
    const nonce =
      input.jobControlNonce ?? process.env.DOOLITTLE_JOB_CONTROL_NONCE;
    if (activeJobId && !nonce)
      throw new Error("Missing child job control identity.");
    let cancelRequested = false;
    const stopMonitor =
      activeJobId && nonce
        ? (deps.monitorJobCancel ?? monitorJobCancel)(
            dataDir,
            activeJobId,
            nonce,
            () => {
              cancelRequested = true;
            },
          )
        : undefined;
    try {
      await deps.emitStaticPromptEvents(
        input.immediatePrompt ?? "",
        cancelRequested
          ? { ...staticPromptResult, shouldExit: true }
          : staticPromptResult,
        {
          sessionId: input.oneShot.sessionId,
          onEvent: activeJobId
            ? (event) =>
                (deps.appendCliJobEvent ?? appendCliJobEvent)(
                  dataDir,
                  activeJobId,
                  event,
                )
            : undefined,
        },
      );
      if (activeJobId) {
        deps.finalizeCliJob(
          dataDir,
          activeJobId,
          cancelRequested || staticPromptResult.shouldExit
            ? "cancelled"
            : "completed",
          cancelRequested ? 130 : 0,
        );
      }
    } finally {
      stopMonitor?.();
    }
    return true;
  }

  deps.printOneShotResult(
    staticPromptResult,
    input.command === "exec" && Boolean(input.oneShot?.json),
  );
  return true;
}
