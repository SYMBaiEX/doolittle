#!/usr/bin/env bun
import { restoreTerminalState } from "@/cli/render-utils";
import { isCliStartupExitError, runOnboardingWizard } from "@/cli/startup";
import {
  renderTopLevelHelp,
  resolveEntrypointRepoRoot,
} from "@/entrypoint/help";
import { handleEntrypointInitialCommandFlow } from "@/entrypoint/initial-command-flow";
import { resolveEntrypointInvocation } from "@/entrypoint/invocation";
import { writeStderrLine } from "@/entrypoint/output";
import { prepareEntrypointRuntimeBoot } from "@/entrypoint/runtime-boot";
import { handleEntrypointRuntimeSurface } from "@/entrypoint/runtime-surface";
import {
  formatTopLevelError,
  isRecoverableTopLevelRuntimeError,
} from "@/entrypoint/static-prompts";
import { getEntrypointLogger } from "@/logging/entrypoint-logger";

async function main(): Promise<number> {
  const entryLogger = getEntrypointLogger("index");
  const repoRoot = resolveEntrypointRepoRoot(import.meta.url);
  const invocation = await resolveEntrypointInvocation({ repoRoot });
  const {
    command,
    rest,
    commandPlan,
    shellIsInteractive,
    stdinIsTTY,
    oneShot,
    immediatePrompt,
    staticPromptResult,
    jobControlDir,
  } = invocation;

  if (
    await handleEntrypointInitialCommandFlow({
      command,
      rest,
      repoRoot,
      renderTopLevelHelp,
      entryLogger,
      runOnboardingWizard,
      oneShot,
      immediatePrompt,
      staticPromptResult,
      jobControlDir,
      launcherPath: Bun.argv[1],
      writeStderrLine,
    })
  ) {
    return 0;
  }

  const {
    context,
    bootLogs,
    runtimePlan,
    runtimeLogger,
    startCli,
    runCliPrompt,
    runCliPromptWithEvents,
    startServer,
    startServerWhenShellReady,
  } = await prepareEntrypointRuntimeBoot({
    command,
    commandPlan,
    shellIsInteractive,
    stdinIsTTY,
    writeStderrLine,
    formatTopLevelError,
  });

  if (runtimePlan.shouldStartApi && runtimePlan.shouldStartApiImmediately) {
    await startServer();
  }

  const runtimeSurface = await handleEntrypointRuntimeSurface({
    command,
    shellIsInteractive,
    immediatePrompt,
    oneShot,
    jobControlDir,
    context,
    runtimePlan,
    runtimeLogger,
    startCli,
    startServerWhenShellReady,
    runCliPrompt,
    runCliPromptWithEvents,
    bootLogs,
  });

  if (runtimeSurface.handled) {
    return runtimeSurface.exitCode ?? 0;
  }

  return 0;
}

// Bun can exit early from executable entrypoints while long-lived async
// startup is still awaiting TUI/server promises. Keep one lightweight
// handle alive for the lifetime of main().
const entryKeepAlive = setInterval(() => {}, 60_000);

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    const entryLogger = getEntrypointLogger("index");
    restoreTerminalState();
    if (isCliStartupExitError(error)) {
      process.exitCode = error.exitCode;
      return;
    }
    entryLogger.captureError("entrypoint-main-failed", error);
    if (isRecoverableTopLevelRuntimeError(error)) {
      writeStderrLine(formatTopLevelError(error));
    } else {
      writeStderrLine(String(error));
    }
    process.exit(1);
  })
  .finally(() => {
    clearInterval(entryKeepAlive);
  });
