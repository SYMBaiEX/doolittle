#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import {
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  getCliJob,
  renderCliJobReplay,
} from "@/cli/jobs";
import { restoreTerminalState } from "@/cli/render-utils";
import { loadLocalRuntimeEnv, runOnboardingWizard } from "@/cli/startup";
import { renderCliTurnEvent } from "@/cli/turn-events";
import { loadConfig } from "@/config/env";
import { handleBackgroundExec } from "@/entrypoint/exec-flow";
import { handleJobsSubcommand } from "@/entrypoint/jobs-command";
import { handleLocalEntrypointSubcommand } from "@/entrypoint/local-subcommands";
import { writeStderrLine } from "@/entrypoint/output";
import { prepareEntrypointRuntimeBoot } from "@/entrypoint/runtime-boot";
import { resolveEntrypointCommandPlan } from "@/entrypoint/runtime-control";
import { handleEntrypointRuntimeSurface } from "@/entrypoint/runtime-surface";
import { handleStaticPromptCommand } from "@/entrypoint/static-prompt-command";
import {
  formatTopLevelError,
  isRecoverableTopLevelRuntimeError,
  resolveStaticPrompt,
} from "@/entrypoint/static-prompts";
import {
  parseOneShotOptions,
  resolveSubcommand,
  shouldLoadLocalRuntimeEnvForEntrypoint,
} from "@/entrypoint/subcommand";
import { getEntrypointLogger } from "@/logging/entrypoint-logger";

function repoRoot(): string {
  // packages/agent/src/index.ts → ../../../ = repo root
  return fileURLToPath(new URL("../../../", import.meta.url));
}

function renderTopLevelHelp(): string {
  return [
    "Doolittle",
    "",
    "Terminal-first ElizaOS-native coding agent.",
    "",
    "Usage:",
    "  doolittle                 Start the plain interactive shell",
    "  doolittle commands        Browse slash commands and bundled workflows",
    "  doolittle cockpit         Open the fullscreen observability cockpit",
    '  doolittle exec -p "..."   Run one prompt and exit',
    '  doolittle exec -p "..." --json-stream',
    '  doolittle exec -p "..." --background',
    "  doolittle jobs list      Inspect background jobs",
    "  doolittle setup           Run onboarding",
    "  doolittle doctor          Check readiness and local setup",
    "",
    "Examples:",
    '  doolittle exec -p "summarize this repo"',
    '  doolittle exec -p "/status" --json',
    '  doolittle exec -p "review the repo" --background',
    "  doolittle jobs attach <job-id>",
    "  doolittle cockpit",
    "",
    "Legacy aliases:",
    "  doolittle plain",
    "  doolittle --cockpit",
    "  doolittle --plain-cli",
  ].join("\n");
}

async function readStdinText(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const entryLogger = getEntrypointLogger("index");
  const { command, rest } = resolveSubcommand();
  const shellIsInteractive = process.stdin.isTTY && process.stdout.isTTY;
  const commandPlan = resolveEntrypointCommandPlan(command);
  const oneShot = command === "exec" ? parseOneShotOptions(rest) : undefined;
  const pipedPrompt =
    !shellIsInteractive && (command === "start" || command === "plain")
      ? await readStdinText()
      : undefined;
  const immediatePrompt = command === "exec" ? oneShot?.prompt : pipedPrompt;
  const staticPromptResult = resolveStaticPrompt(
    immediatePrompt,
    process.env.DOOLITTLE_NAME?.trim() || "Eliza",
    repoRoot(),
  );
  const jobControlDir = process.env.DOOLITTLE_JOB_CONTROL_DIR?.trim();

  if (
    await handleLocalEntrypointSubcommand({
      command,
      rest,
      repoRoot: repoRoot(),
      renderTopLevelHelp,
      entryLogger,
      runOnboardingWizard,
      printLine: console.log,
      writeStderrLine,
      exit: process.exit,
    })
  ) {
    return;
  }

  if (shouldLoadLocalRuntimeEnvForEntrypoint(command, oneShot)) {
    loadLocalRuntimeEnv();
  }

  if (command === "jobs") {
    await handleJobsSubcommand({
      rest,
      jobControlDir,
      deps: {
        loadConfig,
        cliJobStatusSummary,
        getCliJob,
        renderCliJobReplay,
        attachCliJob,
        cancelCliJob,
        renderCliTurnEvent,
        entryLogger,
        printLine: console.log,
        writeStdout: (message) => process.stdout.write(message),
        writeStderrLine,
        exit: process.exit,
      },
    });
    return;
  }

  if (
    await handleStaticPromptCommand({
      command,
      immediatePrompt,
      staticPromptResult,
      oneShot,
      jobControlDir,
    })
  ) {
    return;
  }

  if (
    await handleBackgroundExec({
      command,
      oneShot,
      immediatePrompt,
      jobControlDir,
      launcherPath: Bun.argv[1],
      sessionId: oneShot?.sessionId,
      entryLogger,
      writeStderrLine,
      exit: process.exit,
    })
  ) {
    return;
  }

  // ----- Runtime subcommands need env + onboarding -----

  if (command === "exec" && !immediatePrompt?.trim()) {
    entryLogger.warn("exec-usage");
    writeStderrLine('Usage: doolittle exec --prompt "your request" [--json]');
    process.exit(1);
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
    stdinIsTTY: process.stdin.isTTY,
    writeStderrLine,
    formatTopLevelError,
  });

  if (runtimePlan.shouldStartApi && runtimePlan.shouldStartApiImmediately) {
    await startServer();
  }

  if (
    await handleEntrypointRuntimeSurface({
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
    })
  ) {
    return;
  }
}

// Bun can exit early from executable entrypoints while long-lived async
// startup is still awaiting TUI/server promises. Keep one lightweight
// handle alive for the lifetime of main().
const entryKeepAlive = setInterval(() => {}, 60_000);

main()
  .catch((error) => {
    const entryLogger = getEntrypointLogger("index");
    restoreTerminalState();
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
