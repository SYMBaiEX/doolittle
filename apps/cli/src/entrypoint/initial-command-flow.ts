import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { CliExecutionResult } from "../cli/execution/types";
import { loadLocalRuntimeEnv, type runOnboardingWizard } from "../cli/startup";
import { handleBackgroundExec } from "./exec-flow";
import { handleJobsSubcommand } from "./jobs-command";
import { handleLocalEntrypointSubcommand } from "./local-subcommands";
import type { writeStderrLine } from "./output";
import { handleStaticPromptCommand } from "./static-prompt-command";
import type { EntrypointSubcommand, OneShotOptions } from "./subcommand";

export async function handleEntrypointInitialCommandFlow(input: {
  command: EntrypointSubcommand;
  rest: string[];
  repoRoot: string;
  renderTopLevelHelp: () => string;
  entryLogger: AppLogger;
  oneShot?: OneShotOptions;
  immediatePrompt?: string;
  staticPromptResult?: CliExecutionResult;
  jobControlDir?: string;
  launcherPath?: string;
  writeStderrLine: typeof writeStderrLine;
  runOnboardingWizard: typeof runOnboardingWizard;
}): Promise<boolean> {
  const { command, entryLogger, jobControlDir, oneShot } = input;
  const localExitCode = await handleLocalEntrypointSubcommand(input);
  if (localExitCode !== undefined) {
    if (localExitCode) process.exit(localExitCode);
    return true;
  }

  if (command === "jobs") {
    loadLocalRuntimeEnv();
    const exitCode = await handleJobsSubcommand({
      rest: input.rest,
      jobControlDir,
      entryLogger,
    });
    if (exitCode) process.exit(exitCode);
    return true;
  }

  const prompt = input.immediatePrompt;
  if (command === "exec" && oneShot?.background) {
    const exitCode = await handleBackgroundExec({
      oneShot,
      prompt,
      jobControlDir,
      launcherPath: input.launcherPath,
      entryLogger,
    });
    if (exitCode) process.exit(exitCode);
    return true;
  }

  if (input.staticPromptResult) {
    await handleStaticPromptCommand({
      result: input.staticPromptResult,
      prompt: prompt ?? "",
      oneShot,
      jobControlDir,
    });
    return true;
  }

  if (command === "exec" && !prompt?.trim()) {
    entryLogger.warn("exec-usage");
    input.writeStderrLine(
      'Usage: doolittle exec --prompt "your request" [--json]',
    );
    process.exit(1);
  }

  return false;
}
