import { finalizeCliJob } from "@/cli/jobs";
import { loadConfig } from "@/config/env";
import {
  emitStaticPromptEvents,
  printOneShotResult,
} from "@/entrypoint/output";
import type { StaticResult } from "./static-prompts";
import type { OneShotOptions } from "./subcommand";

interface StaticPromptCommandDeps {
  emitStaticPromptEvents: typeof emitStaticPromptEvents;
  finalizeCliJob: typeof finalizeCliJob;
  printOneShotResult: typeof printOneShotResult;
  loadConfig: typeof loadConfig;
}

const staticPromptCommandDeps: StaticPromptCommandDeps = {
  emitStaticPromptEvents,
  finalizeCliJob,
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
    await deps.emitStaticPromptEvents(
      input.immediatePrompt ?? "",
      staticPromptResult,
      {
        sessionId: input.oneShot.sessionId,
      },
    );
    if (activeJobId) {
      deps.finalizeCliJob(
        input.jobControlDir || deps.loadConfig().dataDir,
        activeJobId,
        staticPromptResult.shouldExit ? "cancelled" : "completed",
        0,
      );
    }
    return true;
  }

  deps.printOneShotResult(
    staticPromptResult,
    input.command === "exec" && Boolean(input.oneShot?.json),
  );
  return true;
}
