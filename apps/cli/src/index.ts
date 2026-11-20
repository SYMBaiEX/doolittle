#!/usr/bin/env nub
import "./entrypoint/host-execution";
import { pathToFileURL } from "node:url";
import { getDefaultRepoRoot } from "@doolittle/agent/config/env/paths";
import { getEntrypointLogger } from "@doolittle/agent/logging/entrypoint-logger";
import { shutdownApplicationRuntime } from "@doolittle/agent/runtime/application";
import { installSharedEngineHost } from "@doolittle/agent/runtime/engine/host";
import { installEngineWorkerTransport } from "@doolittle/agent/runtime/engine/worker-transport";
import type { AgentRuntime } from "@elizaos/core";
import { restoreTerminalState } from "./cli/render-utils";
import { isCliStartupExitError, runOnboardingWizard } from "./cli/startup";
import { renderTopLevelHelp } from "./entrypoint/help";
import { handleEntrypointInitialCommandFlow } from "./entrypoint/initial-command-flow";
import { resolveEntrypointInvocation } from "./entrypoint/invocation";
import { writeStderrLine } from "./entrypoint/output";
import { prepareEntrypointRuntimeBoot } from "./entrypoint/runtime-boot";
import { installRuntimeProcessLifecycle } from "./entrypoint/runtime-process-lifecycle";
import { handleEntrypointRuntimeSurface } from "./entrypoint/runtime-surface";
import {
  formatTopLevelError,
  isRecoverableTopLevelRuntimeError,
} from "./entrypoint/static-prompts";

installEngineWorkerTransport();
const sharedEngineHost = installSharedEngineHost(
  process.env.DOOLITTLE_ENGINE_WORKER_ENTRY
    ? pathToFileURL(process.env.DOOLITTLE_ENGINE_WORKER_ENTRY)
    : import.meta.url,
);

async function main(): Promise<number> {
  const entryLogger = getEntrypointLogger("index");
  const repoRoot = getDefaultRepoRoot();
  const invocation = await resolveEntrypointInvocation({ repoRoot });
  const {
    command,
    rest,
    shellIsInteractive,
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
      launcherPath: process.argv[1],
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
    startServer,
    startServerWhenShellReady,
    apiOwnsRuntimeAfterCli,
  } = await prepareEntrypointRuntimeBoot({
    command,
    shellIsInteractive,
    immediatePrompt,
  });

  const installApiLifecycle = () =>
    installRuntimeProcessLifecycle({
      label: `${context.config.agentName} ${command}`,
      async close(reason) {
        try {
          await sharedEngineHost?.stopAll();
        } finally {
          await shutdownApplicationRuntime(
            context.runtime as AgentRuntime,
            reason,
            {
              fast: true,
            },
          );
        }
      },
      captureFatal: (error, origin) => {
        entryLogger.captureError("runtime-process-fatal", error, {
          command,
          origin,
        });
      },
    });

  if (runtimePlan.shouldStartApiImmediately) {
    const lifecycle = installApiLifecycle();
    if (!(await startServer())) {
      lifecycle.dispose();
      await shutdownApplicationRuntime(
        context.runtime as AgentRuntime,
        "Doolittle API unavailable",
        { fast: true },
      );
      return 1;
    }
  }

  const runtimeSurface = await handleEntrypointRuntimeSurface({
    command,
    oneShot,
    jobControlDir,
    context,
    runtimePlan,
    runtimeLogger,
    startServerWhenShellReady,
    apiOwnsRuntimeAfterCli,
    bootLogs,
  });

  if (runtimeSurface.apiOwnsRuntime) installApiLifecycle();
  return runtimeSurface.exitCode;
}

// Keep one lightweight handle alive while long-lived TUI/server startup
// promises are being assembled.
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
