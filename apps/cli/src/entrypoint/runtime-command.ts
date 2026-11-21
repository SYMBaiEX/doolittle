import { pathToFileURL } from "node:url";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import { shutdownApplicationRuntime } from "@doolittle/agent/runtime/application";
import { installSharedEngineHost } from "@doolittle/agent/runtime/engine/host";
import { installEngineWorkerTransport } from "@doolittle/agent/runtime/engine/worker-transport";
import type { AgentRuntime } from "@elizaos/core";
import type { EntrypointInvocation } from "./invocation";
import { prepareEntrypointRuntimeBoot } from "./runtime-boot";
import { installRuntimeProcessLifecycle } from "./runtime-process-lifecycle";
import { handleEntrypointRuntimeSurface } from "./runtime-surface";

export async function runEntrypointRuntime(
  invocation: EntrypointInvocation,
  entryLogger: AppLogger,
  entryUrl: string,
): Promise<number> {
  installEngineWorkerTransport();
  const workerEntry = process.env.DOOLITTLE_ENGINE_WORKER_ENTRY;
  const sharedEngineHost = installSharedEngineHost(
    workerEntry ? pathToFileURL(workerEntry) : entryUrl,
  );
  const { command, oneShot, jobControlDir } = invocation;
  const {
    context,
    bootLogs,
    runtimePlan,
    runtimeLogger,
    startServer,
    startServerWhenShellReady,
    apiOwnsRuntimeAfterCli,
  } = await prepareEntrypointRuntimeBoot(invocation);

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
            { fast: true },
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
