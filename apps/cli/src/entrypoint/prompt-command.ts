import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import {
  runCliPrompt,
  runCliPromptWithEvents,
} from "../cli/execution/prompt-runner";
import { getCliResultStatus } from "../cli/execution/types";
import { monitorJobCancel } from "../cli/jobs/control";
import {
  appendCliJobEvent,
  finalizeCliJob,
  markCliJobStarted,
} from "../cli/jobs/index";
import { encodeCliTurnEvent } from "../cli/turn-events";
import { printOneShotResult } from "./output";
import type { OneShotOptions } from "./subcommand";

function exitCodeForStatus(status: ReturnType<typeof getCliResultStatus>) {
  return status === "failed" ? 1 : status === "cancelled" ? 130 : 0;
}

export async function runRuntimePromptCommand(input: {
  prompt: string;
  oneShot?: OneShotOptions;
  jobControlDir?: string;
  context: AppContext;
  controller: AbortController;
}): Promise<number> {
  const { context, controller, oneShot, prompt } = input;
  const { signal } = controller;
  const sessionId = oneShot?.sessionId;

  if (!oneShot?.jsonStream) {
    const result = await runCliPrompt(context, prompt, {
      sessionId,
      abortSignal: signal,
    });
    const status = getCliResultStatus(result, signal);
    printOneShotResult({ ...result, status }, Boolean(oneShot?.json));
    return exitCodeForStatus(status);
  }

  const activeJobId = oneShot.jobId?.trim() || undefined;
  const dataDir = input.jobControlDir || context.config.dataDir;
  // A forged --job-id cannot mutate a persisted job without the launch-only identity.
  const nonce = process.env.DOOLITTLE_JOB_CONTROL_NONCE;
  if (activeJobId && !nonce)
    throw new Error("Missing child job control identity.");
  const stopMonitor =
    activeJobId && nonce
      ? monitorJobCancel(dataDir, activeJobId, nonce, () => controller.abort())
      : undefined;
  let status: ReturnType<typeof getCliResultStatus>;
  try {
    if (activeJobId) {
      markCliJobStarted(dataDir, activeJobId, { pid: process.pid, sessionId });
    }
    const { result } = await runCliPromptWithEvents(
      context,
      prompt,
      {
        onEvent(event) {
          if (!activeJobId) {
            process.stdout.write(encodeCliTurnEvent(event));
          } else if (event.type !== "coding-verification") {
            appendCliJobEvent(dataDir, activeJobId, event);
          }
        },
      },
      {
        abortSignal: signal,
        sessionId,
        codingVerificationReceipts:
          !activeJobId &&
          process.env.DOOLITTLE_EVAL_CODING_VERIFICATION === "true",
      },
    );
    status = getCliResultStatus(result, signal);
  } catch {
    status = signal.aborted ? "cancelled" : "failed";
  } finally {
    stopMonitor?.();
  }
  const exitCode = exitCodeForStatus(status);
  if (activeJobId) finalizeCliJob(dataDir, activeJobId, status, exitCode);
  return exitCode;
}
