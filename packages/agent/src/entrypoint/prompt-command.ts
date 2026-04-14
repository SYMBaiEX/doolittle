import type { CliExecutionResult } from "@/cli/execution";
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
  options?: { sessionId?: string },
) => Promise<CliExecutionResult | undefined>;

type RunCliPromptWithEvents = (
  context: AppContext,
  line: string,
  handlers?: {
    onEvent?: (
      event: Parameters<typeof encodeCliTurnEvent>[0],
    ) => Promise<void> | void;
  },
  options?: { abortSignal?: AbortSignal; sessionId?: string },
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
    const sessionController = new AbortController();
    const activeJobId = input.oneShot.jobId?.trim() || undefined;
    if (activeJobId) {
      deps.markCliJobStarted(controlDataDir, activeJobId, {
        pid: process.pid,
        sessionId: input.oneShot.sessionId,
      });
    }
    const writeEvent = (event: Parameters<typeof encodeCliTurnEvent>[0]) => {
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
      await input.runCliPromptWithEvents(
        input.context,
        trimmedPrompt,
        {
          onEvent: async (event) => {
            writeEvent(event);
          },
        },
        {
          abortSignal: sessionController.signal,
          sessionId: input.oneShot.sessionId,
        },
      );
      finalizeActiveJob("completed", 0);
    } catch (_error) {
      finalizeActiveJob(
        sessionController.signal.aborted ? "cancelled" : "failed",
        1,
      );
      process.exitCode = 1;
    }
    return true;
  }

  const result = await input.runCliPrompt?.(input.context, trimmedPrompt, {
    sessionId: input.oneShot?.sessionId,
  });
  if (!result) {
    exit(1);
    return true;
  }
  deps.printOneShotResult(
    result,
    input.command === "exec" && Boolean(input.oneShot?.json),
  );
  return true;
}
