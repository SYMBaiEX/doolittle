import type { CliExecutionResult } from "@/cli/execution";
import { getCliResultStatus } from "@/cli/execution/types";
import {
  appendCliJobEvent,
  finalizeCliJob,
  markCliJobStarted,
} from "@/cli/jobs";
import { encodeCliTurnEvent } from "@/cli/turn-events";
import type { AppContext } from "@/runtime/bootstrap";
import { printOneShotResult } from "./output";
import type { EntrypointSubcommand, OneShotOptions } from "./subcommand";
import { isEntrypointAliasCommand } from "./subcommand";

type RunCliPrompt = (
  context: AppContext,
  line: string,
  options?: { sessionId?: string; abortSignal?: AbortSignal },
) => Promise<CliExecutionResult | undefined>;

type RunCliPromptWithEvents = (
  context: AppContext,
  line: string,
  handlers?: {
    onEvent?: (
      event: Parameters<typeof encodeCliTurnEvent>[0],
    ) => Promise<void> | void;
  },
  options?: {
    abortSignal?: AbortSignal;
    sessionId?: string;
    codingVerificationReceipts?: boolean;
  },
) => Promise<{ result: CliExecutionResult; sessionId: string }>;

interface PromptCommandDeps {
  markCliJobStarted: typeof markCliJobStarted;
  appendCliJobEvent: typeof appendCliJobEvent;
  finalizeCliJob: typeof finalizeCliJob;
  encodeCliTurnEvent: typeof encodeCliTurnEvent;
  printOneShotResult: typeof printOneShotResult;
}

const promptCommandDeps: PromptCommandDeps = {
  markCliJobStarted,
  appendCliJobEvent,
  finalizeCliJob,
  encodeCliTurnEvent,
  printOneShotResult,
};

export async function handleRuntimePromptCommand(
  input: {
    command: EntrypointSubcommand;
    shellIsInteractive: boolean;
    immediatePrompt?: string;
    oneShot?: OneShotOptions;
    jobControlDir?: string;
    context: AppContext;
    runCliPrompt?: RunCliPrompt;
    runCliPromptWithEvents?: RunCliPromptWithEvents;
    abortSignal?: AbortSignal;
    writeStdout?: (message: string) => void;
    exit?: (code: number) => void;
  },
  deps: PromptCommandDeps = promptCommandDeps,
): Promise<boolean> {
  const trimmedPrompt = input.immediatePrompt?.trim();
  if (
    !(
      input.command === "exec" ||
      isEntrypointAliasCommand(input.command) ||
      (!input.shellIsInteractive && trimmedPrompt)
    )
  ) {
    return false;
  }
  if (!trimmedPrompt) {
    return false;
  }

  const writeStdout =
    input.writeStdout ?? ((message) => process.stdout.write(message));
  const exit = input.exit ?? process.exit;
  const controlDataDir = input.jobControlDir || input.context.config.dataDir;

  if (input.command === "exec" && input.oneShot?.jsonStream) {
    if (!input.runCliPromptWithEvents) {
      exit(1);
      return true;
    }
    const abortSignal = input.abortSignal;
    const activeJobId = input.oneShot.jobId?.trim() || undefined;
    if (activeJobId) {
      deps.markCliJobStarted(controlDataDir, activeJobId, {
        pid: process.pid,
        sessionId: input.oneShot.sessionId,
      });
    }
    const writeEvent = (event: Parameters<typeof encodeCliTurnEvent>[0]) => {
      if (activeJobId && event.type === "coding-verification") {
        return;
      }
      if (activeJobId) {
        deps.appendCliJobEvent(controlDataDir, activeJobId, event);
      }
      writeStdout(deps.encodeCliTurnEvent(event));
    };
    const finalizeActiveJob = (
      status: "completed" | "failed" | "cancelled",
      exitCode?: number,
    ) => {
      if (!activeJobId) {
        return;
      }
      deps.finalizeCliJob(controlDataDir, activeJobId, status, exitCode);
    };
    try {
      const { result } = await input.runCliPromptWithEvents(
        input.context,
        trimmedPrompt,
        {
          onEvent: async (event) => {
            writeEvent(event);
          },
        },
        {
          abortSignal,
          sessionId: input.oneShot.sessionId,
          codingVerificationReceipts:
            !activeJobId &&
            process.env.DOOLITTLE_EVAL_CODING_VERIFICATION === "true",
        },
      );
      const status = getCliResultStatus(result, abortSignal);
      const exitCode =
        status === "failed" ? 1 : status === "cancelled" ? 130 : 0;
      finalizeActiveJob(status, exitCode);
      if (exitCode !== 0) process.exitCode = exitCode;
    } catch (_error) {
      finalizeActiveJob(
        abortSignal?.aborted ? "cancelled" : "failed",
        abortSignal?.aborted ? 130 : 1,
      );
      process.exitCode = abortSignal?.aborted ? 130 : 1;
    }
    return true;
  }

  const result = await input.runCliPrompt?.(input.context, trimmedPrompt, {
    sessionId: input.oneShot?.sessionId,
    abortSignal: input.abortSignal,
  });
  if (!result) {
    exit(1);
    return true;
  }
  const status = getCliResultStatus(result, input.abortSignal);
  deps.printOneShotResult(
    { ...result, status },
    input.command === "exec" && Boolean(input.oneShot?.json),
  );
  if (status !== "completed")
    process.exitCode = status === "cancelled" ? 130 : 1;
  return true;
}
