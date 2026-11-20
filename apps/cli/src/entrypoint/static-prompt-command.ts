import { loadConfig } from "@doolittle/agent/config/env";
import { monitorJobCancel } from "../cli/jobs/control";
import { appendCliJobEvent, finalizeCliJob } from "../cli/jobs/index";
import { emitStaticPromptEvents, printOneShotResult } from "./output";
import type { StaticResult } from "./static-prompts";
import type { OneShotOptions } from "./subcommand";

export async function handleStaticPromptCommand(input: {
  result: StaticResult;
  prompt: string;
  oneShot?: OneShotOptions;
  jobControlDir?: string;
}): Promise<void> {
  const { result, prompt, oneShot } = input;
  if (!oneShot?.jsonStream) {
    printOneShotResult(result, Boolean(oneShot?.json));
    return;
  }

  const activeJobId = oneShot.jobId?.trim();
  if (!activeJobId) {
    await emitStaticPromptEvents(prompt, result, {
      sessionId: oneShot.sessionId,
    });
    return;
  }
  const nonce = process.env.DOOLITTLE_JOB_CONTROL_NONCE;
  if (!nonce) throw new Error("Missing child job control identity.");

  const dataDir = input.jobControlDir || loadConfig().dataDir;
  let cancelRequested = false;
  const stopMonitor = monitorJobCancel(dataDir, activeJobId, nonce, () => {
    cancelRequested = true;
  });
  try {
    await emitStaticPromptEvents(
      prompt,
      cancelRequested ? { ...result, shouldExit: true } : result,
      {
        sessionId: oneShot.sessionId,
        onEvent: (event) => appendCliJobEvent(dataDir, activeJobId, event),
      },
    );
    finalizeCliJob(
      dataDir,
      activeJobId,
      cancelRequested || result.shouldExit ? "cancelled" : "completed",
      cancelRequested ? 130 : 0,
    );
  } finally {
    stopMonitor();
  }
}
