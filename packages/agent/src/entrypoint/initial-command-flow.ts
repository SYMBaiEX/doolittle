import {
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  getCliJob,
  renderCliJobReplay,
} from "@/cli/jobs";
import { loadLocalRuntimeEnv, runOnboardingWizard } from "@/cli/startup";
import { renderCliTurnEvent } from "@/cli/turn-events";
import { loadConfig } from "@/config/env";
import { handleBackgroundExec } from "@/entrypoint/exec-flow";
import { handleJobsSubcommand } from "@/entrypoint/jobs-command";
import { handleLocalEntrypointSubcommand } from "@/entrypoint/local-subcommands";
import { writeStderrLine } from "@/entrypoint/output";
import { handleStaticPromptCommand } from "@/entrypoint/static-prompt-command";
import type { AppLogger } from "@/logging/logger";
import type { StaticResult } from "./static-prompts";
import {
  type EntrypointSubcommand,
  type OneShotOptions,
  shouldLoadLocalRuntimeEnvForEntrypoint,
} from "./subcommand";

interface InitialCommandFlowDeps {
  handleLocalEntrypointSubcommand: typeof handleLocalEntrypointSubcommand;
  shouldLoadLocalRuntimeEnvForEntrypoint: typeof shouldLoadLocalRuntimeEnvForEntrypoint;
  loadLocalRuntimeEnv: typeof loadLocalRuntimeEnv;
  handleJobsSubcommand: typeof handleJobsSubcommand;
  handleStaticPromptCommand: typeof handleStaticPromptCommand;
  handleBackgroundExec: typeof handleBackgroundExec;
  loadConfig: typeof loadConfig;
  cliJobStatusSummary: typeof cliJobStatusSummary;
  getCliJob: typeof getCliJob;
  renderCliJobReplay: typeof renderCliJobReplay;
  attachCliJob: typeof attachCliJob;
  cancelCliJob: typeof cancelCliJob;
  renderCliTurnEvent: typeof renderCliTurnEvent;
}

const initialCommandFlowDeps: InitialCommandFlowDeps = {
  handleLocalEntrypointSubcommand,
  shouldLoadLocalRuntimeEnvForEntrypoint,
  loadLocalRuntimeEnv,
  handleJobsSubcommand,
  handleStaticPromptCommand,
  handleBackgroundExec,
  loadConfig,
  cliJobStatusSummary,
  getCliJob,
  renderCliJobReplay,
  attachCliJob,
  cancelCliJob,
  renderCliTurnEvent,
};

export async function handleEntrypointInitialCommandFlow(
  input: {
    command: EntrypointSubcommand;
    rest: string[];
    repoRoot: string;
    renderTopLevelHelp: () => string;
    entryLogger: AppLogger;
    oneShot?: OneShotOptions;
    immediatePrompt?: string;
    staticPromptResult?: StaticResult;
    jobControlDir?: string;
    launcherPath?: string;
    printLine?: (message: string) => void;
    writeStdout?: (message: string) => void;
    writeStderrLine?: (message: string) => void;
    exit?: (code: number) => void;
    runOnboardingWizard?: typeof runOnboardingWizard;
  },
  deps: InitialCommandFlowDeps = initialCommandFlowDeps,
): Promise<boolean> {
  const printLine = input.printLine ?? console.log;
  const writeStdout =
    input.writeStdout ?? ((message: string) => process.stdout.write(message));
  const writeStderrLineFn = input.writeStderrLine ?? writeStderrLine;
  const exit = input.exit ?? process.exit;
  const runOnboardingWizardFn =
    input.runOnboardingWizard ?? runOnboardingWizard;

  if (
    await deps.handleLocalEntrypointSubcommand({
      command: input.command,
      rest: input.rest,
      repoRoot: input.repoRoot,
      renderTopLevelHelp: input.renderTopLevelHelp,
      entryLogger: input.entryLogger,
      runOnboardingWizard: runOnboardingWizardFn,
      printLine,
      writeStderrLine: writeStderrLineFn,
      exit,
    })
  ) {
    return true;
  }

  if (
    deps.shouldLoadLocalRuntimeEnvForEntrypoint(input.command, input.oneShot)
  ) {
    deps.loadLocalRuntimeEnv();
  }

  if (input.command === "jobs") {
    await deps.handleJobsSubcommand({
      rest: input.rest,
      jobControlDir: input.jobControlDir,
      deps: {
        loadConfig: deps.loadConfig,
        cliJobStatusSummary: deps.cliJobStatusSummary,
        getCliJob: deps.getCliJob,
        renderCliJobReplay: deps.renderCliJobReplay,
        attachCliJob: deps.attachCliJob,
        cancelCliJob: deps.cancelCliJob,
        renderCliTurnEvent: deps.renderCliTurnEvent,
        entryLogger: input.entryLogger,
        printLine,
        writeStdout,
        writeStderrLine: writeStderrLineFn,
        exit,
      },
    });
    return true;
  }

  if (
    await deps.handleStaticPromptCommand({
      command: input.command,
      immediatePrompt: input.immediatePrompt,
      staticPromptResult: input.staticPromptResult,
      oneShot: input.oneShot,
      jobControlDir: input.jobControlDir,
    })
  ) {
    return true;
  }

  if (
    await deps.handleBackgroundExec({
      command: input.command,
      oneShot: input.oneShot,
      immediatePrompt: input.immediatePrompt,
      jobControlDir: input.jobControlDir,
      launcherPath: input.launcherPath,
      sessionId: input.oneShot?.sessionId,
      entryLogger: input.entryLogger,
      writeStderrLine: writeStderrLineFn,
      exit,
    })
  ) {
    return true;
  }

  if (input.command === "exec" && !input.immediatePrompt?.trim()) {
    input.entryLogger.warn("exec-usage");
    writeStderrLineFn('Usage: doolittle exec --prompt "your request" [--json]');
    exit(1);
    return true;
  }

  return false;
}
