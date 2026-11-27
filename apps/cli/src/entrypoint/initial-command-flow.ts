import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { EntrypointInvocation } from "./invocation";
import { writeStderrLine } from "./output";

export async function handleEntrypointInitialCommandFlow(
  input: EntrypointInvocation & {
    entryLogger: AppLogger;
    launcherPath?: string;
  },
): Promise<number | undefined> {
  const { command, entryLogger, jobControlDir, oneShot } = input;

  if (command === "jobs") {
    const [{ loadLocalRuntimeEnv }, { handleJobsSubcommand }] =
      await Promise.all([import("../cli/startup"), import("./jobs-command")]);
    loadLocalRuntimeEnv();
    return handleJobsSubcommand({
      rest: input.rest,
      jobControlDir,
      entryLogger,
    });
  }

  const prompt = input.immediatePrompt;
  if (command === "exec" && oneShot?.background) {
    const { handleBackgroundExec } = await import("./exec-flow");
    return handleBackgroundExec({
      oneShot,
      prompt,
      jobControlDir,
      launcherPath: input.launcherPath,
      entryLogger,
    });
  }

  if (input.staticPromptResult) {
    const { handleStaticPromptCommand } = await import(
      "./static-prompt-command"
    );
    await handleStaticPromptCommand({
      result: input.staticPromptResult,
      prompt: prompt ?? "",
      oneShot,
      jobControlDir,
    });
    return 0;
  }

  if (command === "exec" && !prompt?.trim()) {
    writeStderrLine('Usage: doolittle exec --prompt "your request" [--json]');
    return 1;
  }
}
