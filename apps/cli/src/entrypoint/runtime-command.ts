import { pathToFileURL } from "node:url";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import { installSharedEngineHost } from "@doolittle/agent/runtime/engine/host";
import { installEngineWorkerTransport } from "@doolittle/agent/runtime/engine/worker-transport";
import type { AgentRuntime } from "@elizaos/core";
import type { EntrypointInvocation } from "./invocation";
import { prepareEntrypointRuntimeBoot } from "./runtime-boot";
import { installRuntimeProcessLifecycle } from "./runtime-process-lifecycle";

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

  const shutdown = async (reason: string) => {
    const { shutdownApplicationRuntime } = await import(
      "@doolittle/agent/runtime/application"
    );
    await shutdownApplicationRuntime(context.runtime as AgentRuntime, reason, {
      fast: true,
    });
  };
  const installApiLifecycle = () =>
    installRuntimeProcessLifecycle({
      label: `${context.config.agentName} ${command}`,
      async close(reason) {
        try {
          await sharedEngineHost?.stopAll();
        } finally {
          await shutdown(reason);
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
      await shutdown("Doolittle API unavailable");
      return 1;
    }
    if (command === "api") return 0;
  }

  const { handleEntrypointRuntimeSurface } = await import("./runtime-surface");
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
